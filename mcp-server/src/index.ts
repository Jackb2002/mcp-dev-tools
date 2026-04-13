#!/usr/bin/env node

/**
 * MCP Server for Development Tools
 * Exposes build logs, git status, disk usage, app health, database info via MCP resources
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ResourceContents,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as CoreLib from '@dev-tools/core'

/**
 * Resource definitions
 */
interface ManagedResource {
  uri: string
  name: string
  description: string
  mimeType: string
  ttlMs?: number
  fetch: () => Promise<string>
}

interface CacheEntry {
  value: string
  fetchedAt: number
  lastKnownGood?: string
  errorCount: number
}

const resources: ManagedResource[] = []
const resourceCache = new Map<string, CacheEntry>()

/**
 * Tool definitions
 */
interface ManagedTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<string>
}

const tools: ManagedTool[] = []

// Global debugger instance
let debugger_: CoreLib.DAPDebugger | null = null
const breakpointManager = new CoreLib.BreakpointManager()
const stackManager = new CoreLib.StackManager()
const watchManager = new CoreLib.WatchManager()

/**
 * Initialize all resources
 */
function initializeResources(): void {
  const config = CoreLib.getConfigManager().getConfig()

  // Logs resources
  resources.push({
    uri: 'commsreporter://logs/build-latest',
    name: 'Build Log (Latest)',
    description: 'Last 100 lines of build log output',
    mimeType: 'text/plain',
    ttlMs: 10000,
    fetch: async () => CoreLib.getBuildLog(100)
  })

  resources.push({
    uri: 'commsreporter://logs/test-results',
    name: 'Test Results',
    description: 'Last test run results',
    mimeType: 'application/json',
    ttlMs: 120000,
    fetch: async () => {
      const results = await CoreLib.getTestResults()
      return JSON.stringify(results, null, 2)
    }
  })

  // Git resources
  resources.push({
    uri: 'commsreporter://git/status',
    name: 'Git Status',
    description: 'Current git branch, ahead/behind, untracked files',
    mimeType: 'application/json',
    ttlMs: 30000,
    fetch: async () => {
      const status = await CoreLib.getStatus()
      return JSON.stringify(status, null, 2)
    }
  })

  resources.push({
    uri: 'commsreporter://git/diff',
    name: 'Git Diff',
    description: 'Files changed since main branch',
    mimeType: 'application/json',
    ttlMs: 30000,
    fetch: async () => {
      const diff = await CoreLib.getDiff(config.gitBaseBranch || 'main')
      return JSON.stringify(diff, null, 2)
    }
  })

  resources.push({
    uri: 'commsreporter://git/recent-commits',
    name: 'Recent Commits',
    description: 'Last 10 commits',
    mimeType: 'application/json',
    ttlMs: 30000,
    fetch: async () => {
      const commits = await CoreLib.getRecentCommits(10)
      return JSON.stringify(commits, null, 2)
    }
  })

  // Disk resources
  resources.push({
    uri: 'commsreporter://disk/usage',
    name: 'Disk Usage',
    description: 'Directory sizes in project',
    mimeType: 'application/json',
    ttlMs: 300000,
    fetch: async () => {
      const usage = await CoreLib.getUsage(config.workingDir)
      return JSON.stringify(usage, null, 2)
    }
  })

  resources.push({
    uri: 'commsreporter://disk/large-files',
    name: 'Large Files',
    description: 'Files larger than 100MB',
    mimeType: 'application/json',
    ttlMs: 300000,
    fetch: async () => {
      const files = await CoreLib.getLargeFiles(config.workingDir, 100)
      return JSON.stringify(files, null, 2)
    }
  })

  resources.push({
    uri: 'commsreporter://disk/cleanup',
    name: 'Cleanup Suggestions',
    description: 'Directories that can be cleaned (bin, obj, node_modules, etc)',
    mimeType: 'application/json',
    ttlMs: 300000,
    fetch: async () => {
      const suggestions = await CoreLib.getCleanupSuggestions(config.workingDir)
      return JSON.stringify(suggestions, null, 2)
    }
  })

  // Build resources
  resources.push({
    uri: 'commsreporter://build/recent',
    name: 'Recent Builds',
    description: 'Last 20 builds with duration and success status',
    mimeType: 'application/json',
    ttlMs: 30000,
    fetch: async () => {
      const builds = await CoreLib.getRecentBuilds(20)
      return JSON.stringify(builds, null, 2)
    }
  })

  // App health resources
  resources.push({
    uri: 'commsreporter://app/health',
    name: 'App Health',
    description: 'Application running status, PID, memory, ports',
    mimeType: 'application/json',
    ttlMs: 10000,
    fetch: async () => {
      const health = await CoreLib.getHealth(config.appPort)
      return JSON.stringify(health, null, 2)
    }
  })

  // Database resources
  resources.push({
    uri: 'commsreporter://db/migrations',
    name: 'Database Migrations',
    description: 'EF Core migration status (applied and pending)',
    mimeType: 'application/json',
    ttlMs: 60000,
    fetch: async () => {
      const migrations = await CoreLib.getMigrationStatus()
      return JSON.stringify(migrations, null, 2)
    }
  })

  resources.push({
    uri: 'commsreporter://db/schema',
    name: 'Database Schema',
    description: 'Cached database schema snapshot',
    mimeType: 'application/json',
    ttlMs: 300000,
    fetch: async () => {
      const schema = await CoreLib.getSchemaSnapshot()
      return JSON.stringify(schema, null, 2)
    }
  })

  // Debugger resources
  resources.push({
    uri: 'commsreporter://debugger/breakpoints',
    name: 'Breakpoints',
    description: 'Active breakpoints',
    mimeType: 'application/json',
    fetch: async () => {
      return JSON.stringify(breakpointManager.getAll(), null, 2)
    }
  })

  resources.push({
    uri: 'commsreporter://debugger/stack',
    name: 'Stack Trace',
    description: 'Current stack trace and execution context',
    mimeType: 'application/json',
    fetch: async () => {
      const context = stackManager.getCurrentContext()
      const threads = stackManager.getThreads()
      return JSON.stringify({ context, threads }, null, 2)
    }
  })

  resources.push({
    uri: 'commsreporter://debugger/variables',
    name: 'Variables',
    description: 'Local variables in current stack frame',
    mimeType: 'application/json',
    fetch: async () => {
      const context = stackManager.getCurrentContext()
      if (!context) {
        return JSON.stringify({ error: 'No active frame context' })
      }
      // Would fetch from debugger in real implementation
      return JSON.stringify([])
    }
  })

  resources.push({
    uri: 'commsreporter://debugger/watches',
    name: 'Watches',
    description: 'Watch expressions and their values',
    mimeType: 'application/json',
    fetch: async () => {
      return JSON.stringify(watchManager.getAll(), null, 2)
    }
  })

  resources.push({
    uri: 'commsreporter://debugger/threads',
    name: 'Threads',
    description: 'Active threads and their state',
    mimeType: 'application/json',
    fetch: async () => {
      return JSON.stringify(stackManager.getThreads(), null, 2)
    }
  })

  console.error(`[MCP Server] Initialized ${resources.length} resources`)
}

/**
 * Initialize all debugger tools
 */
function initializeTools(): void {
  // Set breakpoint tool
  tools.push({
    name: 'debugger_set_breakpoint',
    description: 'Set a breakpoint at a specific file and line',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path' },
        line: { type: 'number', description: 'Line number' }
      },
      required: ['file', 'line']
    },
    handler: async (args) => {
      if (!debugger_) {
        return 'Debugger not running'
      }
      try {
        const bp = await debugger_.setBreakpoint(String(args.file), Number(args.line))
        breakpointManager.add(bp)
        return `Breakpoint set at ${args.file}:${args.line}`
      } catch (e) {
        return `Error setting breakpoint: ${(e as Error).message}`
      }
    }
  })

  // Clear breakpoint tool
  tools.push({
    name: 'debugger_clear_breakpoint',
    description: 'Clear a breakpoint by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Breakpoint ID' }
      },
      required: ['id']
    },
    handler: async (args) => {
      if (!debugger_) {
        return 'Debugger not running'
      }
      try {
        await debugger_.clearBreakpoint(String(args.id))
        breakpointManager.remove(String(args.id))
        return `Breakpoint cleared: ${args.id}`
      } catch (e) {
        return `Error clearing breakpoint: ${(e as Error).message}`
      }
    }
  })

  // Continue execution tool
  tools.push({
    name: 'debugger_continue',
    description: 'Continue execution until next breakpoint',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      if (!debugger_) {
        return 'Debugger not running'
      }
      try {
        await debugger_.continue()
        return 'Execution continued'
      } catch (e) {
        return `Error continuing: ${(e as Error).message}`
      }
    }
  })

  // Pause execution tool
  tools.push({
    name: 'debugger_pause',
    description: 'Pause execution',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      if (!debugger_) {
        return 'Debugger not running'
      }
      try {
        await debugger_.pause()
        return 'Execution paused'
      } catch (e) {
        return `Error pausing: ${(e as Error).message}`
      }
    }
  })

  // Step over tool
  tools.push({
    name: 'debugger_step_over',
    description: 'Step over current line',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      if (!debugger_) {
        return 'Debugger not running'
      }
      try {
        await debugger_.stepOver()
        return 'Stepped over'
      } catch (e) {
        return `Error stepping: ${(e as Error).message}`
      }
    }
  })

  // Step into tool
  tools.push({
    name: 'debugger_step_into',
    description: 'Step into current line',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      if (!debugger_) {
        return 'Debugger not running'
      }
      try {
        await debugger_.stepInto()
        return 'Stepped into'
      } catch (e) {
        return `Error stepping: ${(e as Error).message}`
      }
    }
  })

  // Step out tool
  tools.push({
    name: 'debugger_step_out',
    description: 'Step out of current function',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      if (!debugger_) {
        return 'Debugger not running'
      }
      try {
        await debugger_.stepOut()
        return 'Stepped out'
      } catch (e) {
        return `Error stepping: ${(e as Error).message}`
      }
    }
  })

  // Evaluate expression tool
  tools.push({
    name: 'debugger_evaluate',
    description: 'Evaluate an expression in the current context',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Expression to evaluate' }
      },
      required: ['expression']
    },
    handler: async (args) => {
      if (!debugger_) {
        return 'Debugger not running'
      }
      try {
        const result = await debugger_.evaluate(String(args.expression))
        return `${result.value} (${result.type})`
      } catch (e) {
        return `Error evaluating: ${(e as Error).message}`
      }
    }
  })

  // Add watch tool
  tools.push({
    name: 'debugger_add_watch',
    description: 'Add a watch expression',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Expression to watch' }
      },
      required: ['expression']
    },
    handler: async (args) => {
      if (!debugger_) {
        return 'Debugger not running'
      }
      try {
        const watch = await debugger_.addWatch(String(args.expression))
        watchManager.add(args.expression as string)
        return `Watch added: ${watch.id}`
      } catch (e) {
        return `Error adding watch: ${(e as Error).message}`
      }
    }
  })

  // Remove watch tool
  tools.push({
    name: 'debugger_remove_watch',
    description: 'Remove a watch expression',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Watch ID' }
      },
      required: ['id']
    },
    handler: async (args) => {
      if (!debugger_) {
        return 'Debugger not running'
      }
      try {
        await debugger_.removeWatch(String(args.id))
        watchManager.remove(String(args.id))
        return `Watch removed: ${args.id}`
      } catch (e) {
        return `Error removing watch: ${(e as Error).message}`
      }
    }
  })

  console.error(`[MCP Server] Initialized ${tools.length} tools`)
}

/**
 * Fetch resource with retry logic and stale-cache fallback
 */
async function fetchWithRetry(
  resource: ManagedResource,
  uri: string,
  maxRetries: number = 2,
  delayMs: number = 200
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const content = await resource.fetch()
      // Cache on success
      if (resource.ttlMs) {
        resourceCache.set(uri, {
          value: content,
          fetchedAt: Date.now(),
          lastKnownGood: content,
          errorCount: 0
        })
      }
      return content
    } catch (error) {
      const entry = resourceCache.get(uri)
      if (entry) entry.errorCount++

      // On last retry failure, try stale cache
      if (attempt === maxRetries) {
        if (entry?.lastKnownGood) {
          return `[STALE CACHE - FETCH FAILED]\n${entry.lastKnownGood}\n\nError: ${(error as Error).message}`
        }
        return `Error fetching resource: ${(error as Error).message}`
      }

      // Wait before retry
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }
  return 'Unknown error'
}

/**
 * Initialize file watchers for cache invalidation
 */
function initializeWatchers(): void {
  const config = CoreLib.getConfigManager().getConfig()
  const unsubscribers: CoreLib.Unsubscribe[] = []

  // Watch debug log → invalidate build-latest cache
  try {
    const unsubDebug = CoreLib.watchDebugLog(() => {
      resourceCache.delete('commsreporter://logs/build-latest')
    })
    unsubscribers.push(unsubDebug)
  } catch (e) {
    console.error('[MCP Server] watchDebugLog failed:', e)
  }

  // Watch git changes → invalidate git resources
  try {
    const fs = require('fs')
    const gitHeadPath = `${config.workingDir}/.git/HEAD`
    const gitIndexPath = `${config.workingDir}/.git/index`

    if (fs.existsSync(gitHeadPath)) {
      const headWatcher = fs.watch(gitHeadPath, () => {
        resourceCache.delete('commsreporter://git/status')
        resourceCache.delete('commsreporter://git/diff')
        resourceCache.delete('commsreporter://git/recent-commits')
      })
      unsubscribers.push(() => headWatcher.close())
    }

    if (fs.existsSync(gitIndexPath)) {
      const indexWatcher = fs.watch(gitIndexPath, () => {
        resourceCache.delete('commsreporter://git/status')
        resourceCache.delete('commsreporter://git/diff')
        resourceCache.delete('commsreporter://git/recent-commits')
      })
      unsubscribers.push(() => indexWatcher.close())
    }
  } catch (e) {
    console.error('[MCP Server] Git watchers failed:', e)
  }

  // Wire health polling → proactive cache refresh
  try {
    const unsubHealth = CoreLib.watchHealth(() => {
      // Health callback updates internal state; invalidate cache
      resourceCache.delete('commsreporter://app/health')
    })
    unsubscribers.push(unsubHealth)
  } catch (e) {
    console.error('[MCP Server] watchHealth failed:', e)
  }

  // Store for cleanup on shutdown (future enhancement)
  ;(process as any).devToolsWatchers = unsubscribers
  console.error(`[MCP Server] Initialized ${unsubscribers.length} file watchers`)
}

/**
 * Main server
 */
async function main(): Promise<void> {
  try {
    const config = CoreLib.getConfigManager().getConfig()

    console.error(`[MCP Server] Starting...`)
    console.error(`[MCP Server] Project: ${config.projectName}`)
    console.error(`[MCP Server] Language: ${config.language}`)

    // Initialize resources and tools
    initializeResources()
    initializeTools()
    initializeWatchers()

    // Create MCP server
    const server = new Server(
      {
        name: 'dev-tools-mcp',
        version: '0.3.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )

    /**
     * Handle list resources request
     */
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: resources.map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType
      }))
    }))

    /**
     * Handle read resource request
     */
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resource = resources.find(r => r.uri === request.params.uri)

      if (!resource) {
        throw new Error(`Resource not found: ${request.params.uri}`)
      }

      try {
        let content = ''
        const now = Date.now()
        const uri = request.params.uri

        // Check cache if TTL is set
        if (resource.ttlMs && resourceCache.has(uri)) {
          const entry = resourceCache.get(uri)!
          const age = now - entry.fetchedAt
          if (age < resource.ttlMs) {
            // Cache hit
            content = entry.value
          } else {
            // Cache expired; fetch fresh
            content = await fetchWithRetry(resource, uri)
          }
        } else {
          // Not cacheable or not in cache yet
          content = await fetchWithRetry(resource, uri)
        }

        return {
          contents: [
            {
              uri: resource.uri,
              mimeType: resource.mimeType,
              text: content
            }
          ] as ResourceContents[]
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        return {
          contents: [
            {
              uri: resource.uri,
              mimeType: 'text/plain',
              text: `Error fetching resource: ${errorMsg}`
            }
          ] as ResourceContents[]
        }
      }
    })

    /**
     * Handle list tools request
     */
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Tool['inputSchema']
      }))
    }))

    /**
     * Handle call tool request
     */
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = tools.find(t => t.name === request.params.name)

      if (!tool) {
        throw new Error(`Tool not found: ${request.params.name}`)
      }

      try {
        const result = await tool.handler(request.params.arguments || {})
        return {
          content: [
            {
              type: 'text',
              text: result
            }
          ]
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        return {
          content: [
            {
              type: 'text',
              text: `Error calling tool: ${errorMsg}`
            }
          ],
          isError: true
        }
      }
    })

    // Connect via stdio (for Claude integration)
    const transport = new StdioServerTransport()
    await server.connect(transport)

    console.error(`[MCP Server] Connected and ready`)
    console.error(`[MCP Server] Serving ${resources.length} resources and ${tools.length} tools`)
  } catch (error) {
    console.error(`[MCP Server] Fatal error:`, error)
    process.exit(1)
  }
}

main()
