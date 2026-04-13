#!/usr/bin/env node

/**
 * MCP Server for Development Tools
 * Exposes build logs, git status, disk usage, app health, database info as MCP resources
 *
 * Phase 2: Will integrate with MCP SDK and wire up resources/tools
 */

import * as CoreLib from '@dev-tools/core'

/**
 * Main server entry point
 * Currently a stub that initializes the core library
 * Phase 2 will implement proper MCP protocol via stdio
 */
async function main(): Promise<void> {
  try {
    // Load configuration
    const config = CoreLib.getConfigManager().getConfig()

    console.error(`[MCP Server] Starting...`)
    console.error(`[MCP Server] Project: ${config.projectName}`)
    console.error(`[MCP Server] Working directory: ${config.workingDir}`)

    // Phase 2: Implement MCP resources
    // - commsreporter://logs/build-latest
    // - commsreporter://git/status
    // - commsreporter://disk/usage
    // - commsreporter://app/health
    // - commsreporter://db/migrations
    // etc.

    // Phase 3: Add debugger resources & tools
    // - commsreporter://debugger/breakpoints
    // - tool: setBreakpoint(file, line)
    // - tool: stepOver() / stepInto() / stepOut()
    // etc.

    // For now, just demonstrate core library access
    console.error(`[MCP Server] Core library loaded successfully`)

    // Test a basic call
    const gitStatus = await CoreLib.getStatus()
    console.error(`[MCP Server] Current branch: ${gitStatus.branch}`)

    // Keep process alive (Phase 2 will use proper MCP stdio)
    console.error(`[MCP Server] Ready (Phase 2 stub)`)

    // Prevent process from exiting
    await new Promise(() => {})
  } catch (error) {
    console.error(`[MCP Server] Fatal error:`, error)
    process.exit(1)
  }
}

main()
