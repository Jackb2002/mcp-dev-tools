#!/usr/bin/env node

/**
 * MCP Server for Development Tools
 * Exposes build logs, git status, disk usage, app health, database info via MCP resources
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ResourceContents
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
  fetch: () => Promise<string>
}

const resources: ManagedResource[] = []

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
    fetch: async () => CoreLib.getBuildLog(100)
  })

  resources.push({
    uri: 'commsreporter://logs/test-results',
    name: 'Test Results',
    description: 'Last test run results',
    mimeType: 'application/json',
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
    fetch: async () => {
      const schema = await CoreLib.getSchemaSnapshot()
      return JSON.stringify(schema, null, 2)
    }
  })

  console.error(`[MCP Server] Initialized ${resources.length} resources`)
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

    // Initialize resources
    initializeResources()

    // Create MCP server
    const server = new Server(
      {
        name: 'dev-tools-mcp',
        version: '0.2.0'
      },
      {
        capabilities: {}
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
        const content = await resource.fetch()
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

    // Connect via stdio (for Claude integration)
    const transport = new StdioServerTransport()
    await server.connect(transport)

    console.error(`[MCP Server] Connected and ready`)
    console.error(`[MCP Server] Serving ${resources.length} resources`)
  } catch (error) {
    console.error(`[MCP Server] Fatal error:`, error)
    process.exit(1)
  }
}

main()
