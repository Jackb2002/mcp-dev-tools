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
import * as path from 'path'
import * as http from 'http'
import * as CoreLib from '@dev-tools/core'

// ---------------------------------------------------------------------------
// Debug Bridge client — talks to the VS Code extension's local HTTP server
// (port 7891) which proxies requests through vscode.debug.activeDebugSession.
// This avoids the arm64/license issues with running our own DAP connection.
// ---------------------------------------------------------------------------
const DEBUG_BRIDGE_PORT = 7891

async function bridgeCall<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : ''
    const req = http.request({
      hostname: '127.0.0.1',
      port: DEBUG_BRIDGE_PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) reject(new Error(parsed.error))
          else resolve(parsed as T)
        } catch (e) {
          reject(new Error(`Bridge parse error: ${data}`))
        }
      })
    })
    req.on('error', (e: Error) => reject(new Error(`Debug bridge unavailable: ${e.message}. Start a debug session in VS Code (F5) first.`)))
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Debug bridge timed out')) })
    req.write(payload)
    req.end()
  })
}

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

// Global debugger instance (kept for potential future use; bridge is primary path)
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
  // Set breakpoint — routes through VS Code debug bridge
  tools.push({
    name: 'debugger_set_breakpoint',
    description: 'Set a breakpoint at a specific file and line (requires an active VS Code debug session)',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (relative to project root or absolute)' },
        line: { type: 'number', description: 'Line number' }
      },
      required: ['file', 'line']
    },
    handler: async (args) => {
      try {
        const config = CoreLib.getConfigManager().getConfig()
        const file = path.isAbsolute(String(args.file))
          ? String(args.file)
          : path.join(config.workingDir, String(args.file))
        const result = await bridgeCall<{ breakpoints?: Array<{ verified: boolean; line: number }> }>(
          '/setBreakpoints', { file, line: Number(args.line) }
        )
        const bp = result.breakpoints?.[0]
        return `Breakpoint set at ${file}:${args.line} (verified: ${bp?.verified ?? false})`
      } catch (e) {
        return `Error setting breakpoint: ${(e as Error).message}`
      }
    }
  })

  // Clear breakpoint — VS Code API manages breakpoints via setBreakpoints with empty list
  tools.push({
    name: 'debugger_clear_breakpoint',
    description: 'Clear a breakpoint — pass the file path and line as "file:line"',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Breakpoint ID in the form "file:line" (from set_breakpoint)' }
      },
      required: ['id']
    },
    handler: async (args) => {
      try {
        // id format: "file:line"
        const id = String(args.id)
        const lastColon = id.lastIndexOf(':')
        const file = id.substring(0, lastColon)
        const line = Number(id.substring(lastColon + 1))
        const config = CoreLib.getConfigManager().getConfig()
        const absFile = path.isAbsolute(file) ? file : path.join(config.workingDir, file)
        await bridgeCall('/clearBreakpoints', { file: absFile, line })
        return `Breakpoint cleared at ${absFile}:${line}`
      } catch (e) {
        return `Error clearing breakpoint: ${(e as Error).message}`
      }
    }
  })

  // Continue
  tools.push({
    name: 'debugger_continue',
    description: 'Continue execution until next breakpoint',
    inputSchema: { type: 'object', properties: { threadId: { type: 'number' } } },
    handler: async (args) => {
      try {
        await bridgeCall('/continue', { threadId: args.threadId })
        return 'Execution continued'
      } catch (e) { return `Error: ${(e as Error).message}` }
    }
  })

  // Pause
  tools.push({
    name: 'debugger_pause',
    description: 'Pause execution',
    inputSchema: { type: 'object', properties: { threadId: { type: 'number' } } },
    handler: async (args) => {
      try {
        await bridgeCall('/pause', { threadId: args.threadId })
        return 'Execution paused'
      } catch (e) { return `Error: ${(e as Error).message}` }
    }
  })

  // Step over
  tools.push({
    name: 'debugger_step_over',
    description: 'Step over current line',
    inputSchema: { type: 'object', properties: { threadId: { type: 'number' } } },
    handler: async (args) => {
      try {
        await bridgeCall('/next', { threadId: args.threadId })
        return 'Stepped over'
      } catch (e) { return `Error: ${(e as Error).message}` }
    }
  })

  // Step into
  tools.push({
    name: 'debugger_step_into',
    description: 'Step into current line',
    inputSchema: { type: 'object', properties: { threadId: { type: 'number' } } },
    handler: async (args) => {
      try {
        await bridgeCall('/stepIn', { threadId: args.threadId })
        return 'Stepped into'
      } catch (e) { return `Error: ${(e as Error).message}` }
    }
  })

  // Step out
  tools.push({
    name: 'debugger_step_out',
    description: 'Step out of current function',
    inputSchema: { type: 'object', properties: { threadId: { type: 'number' } } },
    handler: async (args) => {
      try {
        await bridgeCall('/stepOut', { threadId: args.threadId })
        return 'Stepped out'
      } catch (e) { return `Error: ${(e as Error).message}` }
    }
  })

  // Evaluate
  tools.push({
    name: 'debugger_evaluate',
    description: 'Evaluate an expression in the current debug context (requires active paused session)',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'C# expression to evaluate' },
        frameId: { type: 'number', description: 'Stack frame ID (optional)' }
      },
      required: ['expression']
    },
    handler: async (args) => {
      try {
        const result = await bridgeCall<{ result: string; type: string }>('/evaluate', {
          expression: String(args.expression),
          frameId: args.frameId
        })
        return `${result.result} (${result.type})`
      } catch (e) { return `Error evaluating: ${(e as Error).message}` }
    }
  })

  // Watches — just evaluate immediately since VS Code session handles state
  tools.push({
    name: 'debugger_add_watch',
    description: 'Evaluate a watch expression in the current debug context',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'Expression to watch' } },
      required: ['expression']
    },
    handler: async (args) => {
      try {
        const result = await bridgeCall<{ result: string; type: string }>('/evaluate', {
          expression: String(args.expression),
          context: 'watch'
        })
        return `${args.expression} = ${result.result} (${result.type})`
      } catch (e) { return `Error: ${(e as Error).message}` }
    }
  })

  tools.push({
    name: 'debugger_remove_watch',
    description: 'Remove a watch expression (no-op — watches are evaluated on demand)',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async () => 'Watch removed'
  })

  // List breakpoints — shows what the bridge currently has registered
  tools.push({
    name: 'debugger_list_breakpoints',
    description: 'List all breakpoints currently tracked by the debug bridge',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const result = await bridgeCall<{ breakpoints: Record<string, number[]> }>('/breakpoints')
        const entries = Object.entries(result.breakpoints)
        if (entries.length === 0) return 'No breakpoints set'
        return entries
          .map(([file, lines]) => `${file}\n  lines: ${lines.join(', ')}`)
          .join('\n')
      } catch (e) { return `Error: ${(e as Error).message}` }
    }
  })

  // Status — shows bridge health + VS Code session state
  tools.push({
    name: 'debugger_status',
    description: 'Show debug bridge status and active VS Code debug session info',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const config = CoreLib.getConfigManager().getConfig()
      const health = await CoreLib.getHealth(config.appPort)
      try {
        const session = await bridgeCall<{ active: boolean; sessionId: string; sessionName: string; sessionType: string }>('/status')
        return JSON.stringify({
          bridgeConnected: true,
          debugSessionActive: session.active,
          sessionName: session.sessionName,
          sessionType: session.sessionType,
          appRunning: health.running,
          appPid: health.pid ?? null,
          note: 'Debug operations route through VS Code active debug session'
        }, null, 2)
      } catch {
        return JSON.stringify({
          bridgeConnected: false,
          debugSessionActive: false,
          appRunning: health.running,
          appPid: health.pid ?? null,
          note: 'Start the Dev Tools VS Code extension and press F5 to enable debugging'
        }, null, 2)
      }
    }
  })

  // Threads
  tools.push({
    name: 'debugger_threads',
    description: 'List active threads from the VS Code debug session',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const result = await bridgeCall<{ threads: Array<{ id: number; name: string }> }>('/threads')
        return JSON.stringify(result.threads, null, 2)
      } catch (e) { return `Error: ${(e as Error).message}` }
    }
  })

  // Stack trace
  tools.push({
    name: 'debugger_stack_trace',
    description: 'Get call stack from the VS Code debug session (requires paused execution). Omit threadId to use the currently stopped thread automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'number', description: 'Thread ID — omit to use stopped thread automatically' },
        levels: { type: 'number', description: 'Max frames to return (default 20)' }
      }
    },
    handler: async (args) => {
      try {
        const result = await bridgeCall<{ stackFrames: unknown[] }>('/stackTrace', {
          threadId: args.threadId,
          levels: args.levels ?? 20
        })
        return JSON.stringify(result.stackFrames, null, 2)
      } catch (e) { return `Error: ${(e as Error).message}` }
    }
  })

  // Variables
  tools.push({
    name: 'debugger_variables',
    description: 'Get local variables for a stack frame (requires paused execution). Omit frameId to use the top frame of the stopped thread automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        frameId: { type: 'number', description: 'Frame ID from stack trace — omit to use top stopped frame automatically' }
      }
    },
    handler: async (args) => {
      try {
        // Get scopes first, then variables from local scope
        const scopesResult = await bridgeCall<{ scopes: Array<{ variablesReference: number; name: string }> }>(
          '/scopes', { frameId: Number(args.frameId) }
        )
        const localScope = scopesResult.scopes.find(s => s.name === 'Locals') ?? scopesResult.scopes[0]
        if (!localScope) return 'No scopes available'
        const varsResult = await bridgeCall<{ variables: unknown[] }>(
          '/variables', { variablesReference: localScope.variablesReference }
        )
        return JSON.stringify(varsResult.variables, null, 2)
      } catch (e) { return `Error: ${(e as Error).message}` }
    }
  })

  // Loaded sources
  tools.push({
    name: 'debugger_loaded_sources',
    description: 'List source files known to the VS Code debug session',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const result = await bridgeCall<{ sources: Array<{ name: string; path: string }> }>('/loadedSources')
        return JSON.stringify(result.sources, null, 2)
      } catch (e) { return `Error: ${(e as Error).message}` }
    }
  })

  // Reconnect — just checks bridge health now
  tools.push({
    name: 'debugger_reconnect',
    description: 'Check debug bridge connectivity — debugging now routes through VS Code session',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const session = await bridgeCall<{ sessionName: string }>('/status')
        return `Bridge connected — active session: ${session.sessionName}`
      } catch (e) {
        return `Bridge not available: ${(e as Error).message}\nEnsure the Dev Tools VS Code extension is active and a debug session is running (F5).`
      }
    }
  })

  console.error(`[MCP Server] Initialized ${tools.length} tools`)
}

/**
 * Initialize .NET-specific resources and tools (only when language === 'dotnet')
 */
function initializeDotNetResourcesAndTools(): void {
  // Resource: GC / heap stats snapshot
  resources.push({
    uri: 'commsreporter://debugger/dotnet/memory-stats',
    name: '.NET Memory Stats',
    description: 'GC heap size and per-generation collection counts from the live debug session',
    mimeType: 'application/json',
    ttlMs: 5000,
    fetch: async () => {
      try {
        const [totalMem, gen0, gen1, gen2, workingSet] = await Promise.all([
          bridgeCall<{ result: string }>('/evaluate', { expression: 'GC.GetTotalMemory(false).ToString()', context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: 'GC.CollectionCount(0).ToString()', context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: 'GC.CollectionCount(1).ToString()', context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: 'GC.CollectionCount(2).ToString()', context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: 'Environment.WorkingSet.ToString()', context: 'repl' })
        ])
        const stats = buildMemoryStats(totalMem.result, gen0.result, gen1.result, gen2.result, workingSet.result)
        return JSON.stringify(stats, null, 2)
      } catch (e) {
        return JSON.stringify({ error: (e as Error).message })
      }
    }
  })

  // Tool: rich type inspection
  tools.push({
    name: 'debugger_dotnet_type_info',
    description: 'Get rich .NET type information for a variable — full type name, base type, interfaces, generics',
    inputSchema: {
      type: 'object',
      properties: {
        variable: { type: 'string', description: 'Variable name to inspect' },
        frameId: { type: 'number', description: 'Stack frame ID (optional, defaults to top stopped frame)' }
      },
      required: ['variable']
    },
    handler: async (args) => {
      try {
        const varName = String(args.variable)
        const frameId = args.frameId as number | undefined

        const [fullType, baseType, interfaces, isValueType] = await Promise.all([
          bridgeCall<{ result: string }>('/evaluate', { expression: `${varName}.GetType().FullName`, frameId, context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: `${varName}.GetType().BaseType?.FullName ?? "(none)"`, frameId, context: 'repl' }).catch(() => ({ result: '(none)' })),
          bridgeCall<{ result: string }>('/evaluate', { expression: `string.Join(", ", ${varName}.GetType().GetInterfaces().Select(i => i.Name))`, frameId, context: 'repl' }).catch(() => ({ result: '' })),
          bridgeCall<{ result: string }>('/evaluate', { expression: `${varName}.GetType().IsValueType.ToString()`, frameId, context: 'repl' }).catch(() => ({ result: 'False' }))
        ])

        const variable: CoreLib.Variable = { name: varName, value: '', type: fullType.result, variablesReference: 0 }
        const typeInfo = CoreLib.RoslynAnalyzer.getTypeInfo(variable)
        const parsedInterfaces = interfaces.result ? interfaces.result.split(', ').filter(Boolean) : []

        return JSON.stringify({
          variable: varName,
          fullType: fullType.result,
          baseType: baseType.result,
          interfaces: parsedInterfaces,
          isValueType: isValueType.result === 'True',
          isGeneric: typeInfo.isGeneric,
          genericArguments: typeInfo.genericArguments,
          isNullable: typeInfo.isNullable,
          hierarchy: CoreLib.RoslynAnalyzer.getHierarchy({
            ...typeInfo,
            baseName: baseType.result !== '(none)' ? baseType.result : undefined,
            interfaces: parsedInterfaces
          })
        }, null, 2)
      } catch (e) {
        return `Error: ${(e as Error).message}`
      }
    }
  })

  // Tool: Task / async state inspection
  tools.push({
    name: 'debugger_dotnet_async_inspect',
    description: 'Inspect the status and state of a Task or async variable in the current debug frame',
    inputSchema: {
      type: 'object',
      properties: {
        variable: { type: 'string', description: 'Task or async variable name' },
        frameId: { type: 'number', description: 'Stack frame ID (optional)' }
      },
      required: ['variable']
    },
    handler: async (args) => {
      try {
        const varName = String(args.variable)
        const frameId = args.frameId as number | undefined

        const [status, isCompleted, isFaulted, isCanceled, exception] = await Promise.all([
          bridgeCall<{ result: string }>('/evaluate', { expression: `${varName}.Status.ToString()`, frameId, context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: `${varName}.IsCompleted.ToString()`, frameId, context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: `${varName}.IsFaulted.ToString()`, frameId, context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: `${varName}.IsCanceled.ToString()`, frameId, context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: `${varName}.Exception?.InnerException?.Message ?? ${varName}.Exception?.Message ?? "(none)"`, frameId, context: 'repl' }).catch(() => ({ result: '(none)' }))
        ])

        const variable: CoreLib.Variable = { name: varName, value: status.result, type: 'Task', variablesReference: 0 }
        const taskInfo = CoreLib.TaskInspector.getTaskInfo(variable)
        taskInfo.isCompleted = isCompleted.result === 'True'
        taskInfo.isFaulted = isFaulted.result === 'True'
        taskInfo.isCanceled = isCanceled.result === 'True'
        const awaiterState = CoreLib.TaskInspector.getAwaiterState(taskInfo)

        const asyncState: CoreLib.AsyncMethodState = {
          methodName: varName,
          stateMachineType: 'Task',
          currentState: 0,
          humanReadableState: status.result,
          stateName: status.result,
          isCompleted: taskInfo.isCompleted,
          isFaulted: taskInfo.isFaulted,
          isCancelled: taskInfo.isCanceled,
          awaiterState,
          awaiterType: 'Task',
          pendingContinuations: []
        }

        return JSON.stringify({
          variable: varName,
          status: status.result,
          isCompleted: taskInfo.isCompleted,
          isFaulted: taskInfo.isFaulted,
          isCanceled: taskInfo.isCanceled,
          awaiterState,
          exception: exception.result !== '(none)' ? exception.result : null,
          summary: CoreLib.AsyncStateAnalyzer.describeAsyncState(asyncState),
          advice: CoreLib.AsyncFlowAnalyzer.getAdvice(asyncState)
        }, null, 2)
      } catch (e) {
        return `Error: ${(e as Error).message}`
      }
    }
  })

  // Tool: LINQ / IEnumerable analysis
  tools.push({
    name: 'debugger_dotnet_linq_analyze',
    description: 'Analyze a LINQ expression or IEnumerable variable — detects operators, counts elements, and suggests optimizations',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Variable name or LINQ expression to analyze' },
        frameId: { type: 'number', description: 'Stack frame ID (optional)' },
        countElements: { type: 'boolean', description: 'Materialize and count elements (may be slow for large sequences, default true)' }
      },
      required: ['expression']
    },
    handler: async (args) => {
      try {
        const expression = String(args.expression)
        const frameId = args.frameId as number | undefined
        const countElements = args.countElements !== false

        const typeResult = await bridgeCall<{ result: string }>('/evaluate', {
          expression: `(${expression}).GetType().Name`,
          frameId,
          context: 'repl'
        }).catch(() => ({ result: 'Unknown' }))

        const variable: CoreLib.Variable = { name: expression, value: '', type: typeResult.result, variablesReference: 0 }
        const linqInfo = CoreLib.LINQEvaluator.analyzeLINQVariable(variable)
        const detectedOperators = CoreLib.LINQEvaluator.detectOperators(expression)
        const suggestions = CoreLib.LINQEvaluator.suggestOptimizations({ ...linqInfo, chainLength: detectedOperators.length + 1 })

        let count: number | null = null
        if (countElements) {
          const countResult = await bridgeCall<{ result: string }>('/evaluate', {
            expression: `System.Linq.Enumerable.Count(${expression})`,
            frameId,
            context: 'repl'
          }).catch(() => ({ result: '' }))
          const parsed = parseInt(countResult.result)
          if (!isNaN(parsed)) count = parsed
        }

        return JSON.stringify({
          expression,
          type: typeResult.result,
          isIEnumerable: linqInfo.isIEnumerable,
          isIQueryable: linqInfo.isIQueryable,
          isAsync: linqInfo.isAsync,
          elementType: linqInfo.elementType,
          detectedOperators,
          count,
          suggestions
        }, null, 2)
      } catch (e) {
        return `Error: ${(e as Error).message}`
      }
    }
  })

  // Tool: GC / memory stats on demand
  tools.push({
    name: 'debugger_dotnet_memory_stats',
    description: 'Get .NET GC heap size and collection counts from the live debug session',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const [totalMem, gen0, gen1, gen2, workingSet] = await Promise.all([
          bridgeCall<{ result: string }>('/evaluate', { expression: 'GC.GetTotalMemory(false).ToString()', context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: 'GC.CollectionCount(0).ToString()', context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: 'GC.CollectionCount(1).ToString()', context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: 'GC.CollectionCount(2).ToString()', context: 'repl' }),
          bridgeCall<{ result: string }>('/evaluate', { expression: 'Environment.WorkingSet.ToString()', context: 'repl' })
        ])
        const stats = buildMemoryStats(totalMem.result, gen0.result, gen1.result, gen2.result, workingSet.result)
        return JSON.stringify(stats, null, 2)
      } catch (e) {
        return `Error getting memory stats: ${(e as Error).message}`
      }
    }
  })

  console.error('[MCP Server] Initialized .NET resources and tools')
}

/**
 * Build memory stats object with GC analysis
 */
function buildMemoryStats(
  totalMemStr: string, gen0Str: string, gen1Str: string, gen2Str: string, workingSetStr: string
): Record<string, unknown> {
  const totalHeapBytes = parseInt(totalMemStr) || 0
  const gen0Collections = parseInt(gen0Str) || 0
  const gen1Collections = parseInt(gen1Str) || 0
  const gen2Collections = parseInt(gen2Str) || 0
  const workingSetBytes = parseInt(workingSetStr) || 0

  const gcStats: CoreLib.GCGenerationStats[] = [
    { generation: 0, collectionCount: gen0Collections, totalMemory: 0, liveObjectCount: 0, deadObjectCount: 0, promotedSize: 0 },
    { generation: 1, collectionCount: gen1Collections, totalMemory: 0, liveObjectCount: 0, deadObjectCount: 0, promotedSize: 0 },
    { generation: 2, collectionCount: gen2Collections, totalMemory: 0, liveObjectCount: 0, deadObjectCount: 0, promotedSize: 0 }
  ]

  return {
    totalHeapBytes,
    totalHeapMB: (totalHeapBytes / 1024 / 1024).toFixed(2) + ' MB',
    gen0Collections,
    gen1Collections,
    gen2Collections,
    workingSetBytes,
    workingSetMB: (workingSetBytes / 1024 / 1024).toFixed(2) + ' MB',
    analysis: CoreLib.GCAnalyzer.analyzeCollectionStats(gcStats)
  }
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
    if (config.language === 'dotnet') {
      initializeDotNetResourcesAndTools()
    }
    initializeWatchers()

    // Attach debugger to running process if enabled
    if (config.debugger?.enabled) {
      const adapter = CoreLib.findDebugAdapter()
      if (!adapter) {
        console.error('[MCP Server] No .NET debug adapter found (install netcoredbg or VS Code C# extension)')
      } else {
        const health = await CoreLib.getHealth(config.appPort)
        if (!health.pid) {
          console.error('[MCP Server] App not running or PID unavailable — debugger tools will be unavailable')
        } else {
          try {
            console.error(`[MCP Server] Attaching ${adapter.kind} to PID ${health.pid} via ${adapter.path}`)
            const vsdbgPath = adapter.path
            debugger_ = new CoreLib.DAPDebugger(vsdbgPath, {
              request: 'attach',
              processId: health.pid,
              justMyCode: false
            })
            await debugger_.start()
            console.error(`[MCP Server] Debugger attached to PID ${health.pid}`)
          } catch (e) {
            console.error('[MCP Server] Debugger attach failed (continuing without):', (e as Error).message ?? String(e))
            debugger_ = null
          }
        }
      }
    }

    // Create MCP server
    const server = new Server(
      {
        name: 'dev-tools-mcp',
        version: '0.3.0'
      },
      {
        capabilities: {
          resources: {},
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
