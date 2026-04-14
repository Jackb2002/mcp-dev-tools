/**
 * VS Code Extension - Development Tools
 * Provides sidebar views for real-time development insights
 */

import * as vscode from 'vscode'
import * as CoreLib from '@dev-tools/core'
import * as http from 'http'

let config: CoreLib.DevToolsConfig | null = null
const watchers: CoreLib.Unsubscribe[] = []

// ---------------------------------------------------------------------------
// Debug Bridge — local HTTP server on port 7891 that exposes the active VS
// Code debug session to the MCP server. The MCP calls these endpoints instead
// of trying to run its own DAP connection (which fails on macOS arm64 due to
// netcoredbg architecture limitations and vsdbg license restrictions).
// ---------------------------------------------------------------------------

const DEBUG_BRIDGE_PORT = 7891
let debugBridgeServer: http.Server | null = null

// Track breakpoints per file so setBreakpoints merges rather than replaces
const breakpointMap = new Map<string, Set<number>>()

// Track the currently stopped thread and top frame from DAP stopped events
let stoppedThreadId: number | null = null
let stoppedFrameId: number | null = null

function startDebugBridge(context: vscode.ExtensionContext): void {
  if (debugBridgeServer) return

  // Listen for DAP stopped/continued events to track the paused thread
  context.subscriptions.push(
    vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
      if (e.event === 'stopped') {
        stoppedThreadId = (e.body as { threadId?: number })?.threadId ?? null
        stoppedFrameId = null // will be resolved on first stackTrace call
      } else if (e.event === 'continued') {
        stoppedThreadId = null
        stoppedFrameId = null
      }
    })
  )

  debugBridgeServer = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader('Content-Type', 'application/json')

    const session = vscode.debug.activeDebugSession
    if (!session) {
      res.writeHead(503)
      res.end(JSON.stringify({ error: 'No active debug session' }))
      return
    }

    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', async () => {
      try {
        const args = body ? JSON.parse(body) : {}

        if (req.url === '/breakpoints') {
          const all: Record<string, number[]> = {}
          breakpointMap.forEach((lines, file) => { all[file] = Array.from(lines).sort((a, b) => a - b) })
          res.writeHead(200)
          res.end(JSON.stringify({ breakpoints: all }))
          return
        }

        if (req.url === '/stoppedThread') {
          res.writeHead(200)
          res.end(JSON.stringify({ threadId: stoppedThreadId, frameId: stoppedFrameId }))
          return
        }

        if (req.url === '/status') {
          res.writeHead(200)
          res.end(JSON.stringify({
            active: true,
            sessionId: session.id,
            sessionName: session.name,
            sessionType: session.type
          }))
          return
        }

        if (req.url === '/threads') {
          const result = await session.customRequest('threads', {})
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/stackTrace') {
          const threadId = args.threadId ?? stoppedThreadId ?? 1
          const result = await session.customRequest('stackTrace', {
            threadId,
            startFrame: 0,
            levels: args.levels ?? 20
          })
          // Cache top user frame for evaluate/scopes default
          const frames = (result as { stackFrames?: Array<{ id: number; presentationHint?: string }> }).stackFrames ?? []
          const topFrame = frames.find(f => f.presentationHint !== 'subtle')
          if (topFrame) stoppedFrameId = topFrame.id
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/evaluate') {
          const result = await session.customRequest('evaluate', {
            expression: args.expression,
            frameId: args.frameId ?? stoppedFrameId,
            context: args.context ?? 'watch'
          })
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/scopes') {
          const result = await session.customRequest('scopes', { frameId: args.frameId ?? stoppedFrameId })
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/variables') {
          const result = await session.customRequest('variables', {
            variablesReference: args.variablesReference
          })
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/setBreakpoints') {
          const file = String(args.file)
          const line = Number(args.line)
          // Merge with existing breakpoints for this file
          if (!breakpointMap.has(file)) breakpointMap.set(file, new Set())
          breakpointMap.get(file)!.add(line)
          const lines = Array.from(breakpointMap.get(file)!)
          const result = await session.customRequest('setBreakpoints', {
            source: { path: file },
            breakpoints: lines.map(l => ({ line: l })),
            sourceModified: false
          })
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/clearBreakpoints') {
          const file = String(args.file)
          const line = args.line !== undefined ? Number(args.line) : undefined
          if (line !== undefined) {
            // Remove just this line
            breakpointMap.get(file)?.delete(line)
          } else {
            // Clear all for file
            breakpointMap.delete(file)
          }
          const lines = Array.from(breakpointMap.get(file) ?? [])
          const result = await session.customRequest('setBreakpoints', {
            source: { path: file },
            breakpoints: lines.map(l => ({ line: l })),
            sourceModified: false
          })
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/continue') {
          const result = await session.customRequest('continue', { threadId: args.threadId ?? 1 })
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/pause') {
          const result = await session.customRequest('pause', { threadId: args.threadId ?? 1 })
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/next') {
          const result = await session.customRequest('next', { threadId: args.threadId ?? 1 })
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/stepIn') {
          const result = await session.customRequest('stepIn', { threadId: args.threadId ?? 1 })
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/stepOut') {
          const result = await session.customRequest('stepOut', { threadId: args.threadId ?? 1 })
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (req.url === '/loadedSources') {
          const result = await session.customRequest('loadedSources', {})
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        res.writeHead(404)
        res.end(JSON.stringify({ error: `Unknown endpoint: ${req.url}` }))
      } catch (e) {
        res.writeHead(500)
        res.end(JSON.stringify({ error: (e as Error).message }))
      }
    })
  })

  debugBridgeServer.listen(DEBUG_BRIDGE_PORT, '127.0.0.1', () => {
    console.log(`[Dev Tools] Debug bridge listening on port ${DEBUG_BRIDGE_PORT}`)
    vscode.window.setStatusBarMessage(`Dev Tools debug bridge: port ${DEBUG_BRIDGE_PORT}`, 5000)
  })

  debugBridgeServer.on('error', (e: Error) => {
    console.error('[Dev Tools] Debug bridge error:', e)
  })
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {

  try {
    console.log('[Dev Tools] VS Code extension activating...')

    // Load configuration — pass workspace root so config is found next to the project
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
    const configManager = CoreLib.getConfigManager(workspaceRoot)
    config = configManager.getConfig()

    // Set context flags for conditional UI
    await vscode.commands.executeCommand('setContext', 'devTools.initialized', true)
    await vscode.commands.executeCommand(
      'setContext',
      'devTools.language',
      config.language
    )

    console.log('[Dev Tools] Project:', config.projectName)
    console.log('[Dev Tools] Language:', config.language)

    // Register commands
    registerCommands(context)

    // Register tree view providers
    registerTreeViews(context)

    // Start watchers
    startWatchers()

    // Start debug bridge so MCP tools can use the active VS Code debug session
    startDebugBridge(context)
    context.subscriptions.push({
      dispose: () => {
        if (debugBridgeServer) {
          debugBridgeServer.close()
          debugBridgeServer = null
        }
      }
    })

    console.log('[Dev Tools] Extension activated successfully')
  } catch (error) {
    console.error('[Dev Tools] Activation failed:', error)
    vscode.window.showErrorMessage(
      `Dev Tools activation failed: ${(error as Error).message}`
    )
  }
}

/**
 * Register VS Code commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  const commands = [
    {
      id: 'devTools.showGitPanel',
      callback: async () => {
        const status = await CoreLib.getStatus()
        showPanel('Git Status', formatGitStatus(status))
      }
    },
    {
      id: 'devTools.showHealthPanel',
      callback: async () => {
        const health = await CoreLib.getHealth(config?.appPort)
        showPanel('App Health', formatHealth(health as any))
      }
    },
    {
      id: 'devTools.showBuildPanel',
      callback: async () => {
        const builds = await CoreLib.getRecentBuilds(20)
        showPanel('Recent Builds', formatBuilds(builds))
      }
    },
    {
      id: 'devTools.showDiskPanel',
      callback: async () => {
        const usage = await CoreLib.getUsage(config?.workingDir)
        showPanel('Disk Usage', formatDiskUsage(usage as any))
      }
    },
    {
      id: 'devTools.showDatabasePanel',
      callback: async () => {
        const migrations = await CoreLib.getMigrationStatus()
        showPanel('Database', formatMigrations(migrations))
      }
    }
  ]

  commands.forEach(cmd => {
    const disposable = vscode.commands.registerCommand(cmd.id, cmd.callback)
    context.subscriptions.push(disposable)
  })

  console.log('[Dev Tools] Registered', commands.length, 'commands')
}

/**
 * Register tree view providers for sidebar
 */
function registerTreeViews(context: vscode.ExtensionContext): void {
  // Git Status tree view
  const gitProvider = new GitTreeProvider()
  vscode.window.registerTreeDataProvider('devToolsGit', gitProvider)
  context.subscriptions.push(
    vscode.commands.registerCommand('devTools.refreshGit', () =>
      gitProvider.refresh()
    )
  )

  // Health tree view
  const healthProvider = new HealthTreeProvider()
  vscode.window.registerTreeDataProvider('devToolsHealth', healthProvider)
  context.subscriptions.push(
    vscode.commands.registerCommand('devTools.refreshHealth', () =>
      healthProvider.refresh()
    )
  )

  // Build tree view
  const buildProvider = new BuildTreeProvider()
  vscode.window.registerTreeDataProvider('devToolsBuild', buildProvider)
  context.subscriptions.push(
    vscode.commands.registerCommand('devTools.refreshBuild', () =>
      buildProvider.refresh()
    )
  )

  console.log('[Dev Tools] Registered tree view providers')
}

/**
 * Start background watchers
 */
function startWatchers(): void {
  // Watch git changes
  try {
    const unsubGit = CoreLib.watchDebugLog(() => {
      vscode.commands.executeCommand('devTools.refreshGit')
    })
    watchers.push(unsubGit)
  } catch (e) {
    console.warn('[Dev Tools] Git watcher failed:', e)
  }

  // Watch health
  try {
    const unsubHealth = CoreLib.watchHealth(() => {
      vscode.commands.executeCommand('devTools.refreshHealth')
    })
    watchers.push(unsubHealth)
  } catch (e) {
    console.warn('[Dev Tools] Health watcher failed:', e)
  }

  console.log('[Dev Tools] Started', watchers.length, 'watchers')
}

/**
 * Show a panel with formatted content
 */
function showPanel(title: string, content: string): void {
  const panel = vscode.window.createOutputChannel(`Dev Tools: ${title}`)
  panel.clear()
  panel.appendLine(content)
  panel.show()
}

/**
 * Tree item classes
 */
class GitTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    try {
      const status = await CoreLib.getStatus()
      return [
        new vscode.TreeItem(
          `Branch: ${status.branch}`,
          vscode.TreeItemCollapsibleState.None
        ),
        new vscode.TreeItem(
          `Ahead: ${status.ahead} | Behind: ${status.behind}`,
          vscode.TreeItemCollapsibleState.None
        ),
        new vscode.TreeItem(
          `Untracked: ${(status.untracked || []).length}`,
          vscode.TreeItemCollapsibleState.None
        )
      ]
    } catch (error) {
      return [
        new vscode.TreeItem('Error loading git status', vscode.TreeItemCollapsibleState.None)
      ]
    }
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element
  }
}

class HealthTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    try {
      const health = await CoreLib.getHealth(config?.appPort)
      const h = health as any
      return [
        new vscode.TreeItem(
          `Status: ${h.running ? '✅ Running' : '❌ Not Running'}`,
          vscode.TreeItemCollapsibleState.None
        ),
        ...(h.pid ? [new vscode.TreeItem(`PID: ${h.pid}`, vscode.TreeItemCollapsibleState.None)] : []),
        ...(h.memory ? [new vscode.TreeItem(`Memory: ${h.memory}`, vscode.TreeItemCollapsibleState.None)] : [])
      ]
    } catch (error) {
      return [
        new vscode.TreeItem('Error loading health', vscode.TreeItemCollapsibleState.None)
      ]
    }
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element
  }
}

class BuildTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    try {
      const builds = await CoreLib.getRecentBuilds(5)
      return builds.map(b => {
        const label = `${b.timestamp} - ${b.success ? '✅' : '❌'} ${b.duration}ms`
        return new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)
      })
    } catch (error) {
      return [
        new vscode.TreeItem('Error loading builds', vscode.TreeItemCollapsibleState.None)
      ]
    }
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element
  }
}

/**
 * Formatting helpers
 */
function formatGitStatus(status: any): string {
  return `Branch: ${status.branch}\nAhead: ${status.ahead}\nBehind: ${status.behind}\nUntracked: ${(status.untracked || []).length}`
}

function formatHealth(health: any): string {
  return `Status: ${health.running ? 'Running ✅' : 'Not Running ❌'}\nPID: ${health.pid || 'N/A'}\nMemory: ${health.memory || 'N/A'}`
}

function formatBuilds(builds: any[]): string {
  return builds
    .slice(0, 10)
    .map(b => `${b.timestamp}: ${b.success ? '✅' : '❌'} (${b.duration}ms)`)
    .join('\n')
}

function formatDiskUsage(usage: any): string {
  return Object.entries(usage)
    .slice(0, 10)
    .map(([dir, size]) => `${dir}: ${size}`)
    .join('\n')
}

function formatMigrations(migrations: any): string {
  return `Applied: ${migrations.applied?.length || 0}\nPending: ${migrations.pending?.length || 0}`
}

export function deactivate(): void {
  watchers.forEach(unsub => {
    try {
      unsub()
    } catch (e) {
      console.warn('[Dev Tools] Watcher cleanup failed:', e)
    }
  })
  console.log('[Dev Tools] Extension deactivated')
}
