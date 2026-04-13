/**
 * VS Code Extension - Development Tools
 * Provides sidebar views for real-time development insights
 */

import * as vscode from 'vscode'
import * as CoreLib from '@dev-tools/core'

let config: CoreLib.DevToolsConfig | null = null
const watchers: CoreLib.Unsubscribe[] = []

export async function activate(context: vscode.ExtensionContext): Promise<void> {

  try {
    console.log('[Dev Tools] VS Code extension activating...')

    // Load configuration
    const configManager = CoreLib.getConfigManager()
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
