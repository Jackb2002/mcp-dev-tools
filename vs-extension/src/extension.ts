/**
 * Visual Studio Extension - Development Tools
 * Provides tool windows and panels for real-time development insights
 *
 * Note: This is a Node.js bridge module. The actual VS UI components would be in C# with XAML.
 * This module coordinates the core library with VS UI.
 */

import * as CoreLib from '@dev-tools/core'

/**
 * Global extension state
 */
interface ExtensionState {
  initialized: boolean
  config: CoreLib.DevToolsConfig | null
  activePanels: Map<string, Panel>
}

interface Panel {
  id: string
  name: string
  isVisible: boolean
  lastUpdate: number
  data: unknown
}

let extensionState: ExtensionState = {
  initialized: false,
  config: null,
  activePanels: new Map()
}

/**
 * Extension entry point
 */
export async function activate(): Promise<void> {
  try {
    console.log('[Dev Tools Extension] Activating...')

    // Load configuration
    const configManager = CoreLib.getConfigManager()
    extensionState.config = configManager.getConfig()

    console.log('[Dev Tools Extension] Project:', extensionState.config.projectName)
    console.log('[Dev Tools Extension] Language:', extensionState.config.language)

    // Initialize available panels based on project language
    initializePanels()

    // Start background watchers
    startWatchers()

    extensionState.initialized = true
    console.log('[Dev Tools Extension] Activated successfully')
  } catch (error) {
    console.error('[Dev Tools Extension] Activation failed:', error)
    throw error
  }
}

/**
 * Initialize UI panels based on project configuration
 */
function initializePanels(): void {
  const config = extensionState.config!

  // Always available panels
  const panels = [
    { id: 'git', name: 'Git Status', category: 'Version Control' },
    { id: 'build', name: 'Recent Builds', category: 'Build' },
    { id: 'health', name: 'App Health', category: 'Monitoring' },
    { id: 'disk', name: 'Disk Usage', category: 'Performance' },
    { id: 'db', name: 'Database Info', category: 'Database' }
  ]

  // Debugger panels if debugging is enabled
  if (config.debugger?.enabled) {
    panels.push(
      { id: 'debugger-breakpoints', name: 'Breakpoints', category: 'Debugging' },
      { id: 'debugger-stack', name: 'Call Stack', category: 'Debugging' },
      { id: 'debugger-watches', name: 'Watches', category: 'Debugging' }
    )
  }

  // .NET-specific panels
  if (config.language === 'dotnet' && config.debugger?.enabled) {
    panels.push(
      { id: 'debugger-async', name: 'Async State', category: 'Debugging (.NET)' },
      { id: 'debugger-linq', name: 'LINQ Eval', category: 'Debugging (.NET)' },
      { id: 'debugger-memory', name: 'Memory Stats', category: 'Debugging (.NET)' }
    )
  }

  // Register panels
  for (const panelDef of panels) {
    const panel: Panel = {
      id: panelDef.id,
      name: panelDef.name,
      isVisible: false,
      lastUpdate: 0,
      data: null
    }
    extensionState.activePanels.set(panelDef.id, panel)
    console.log(`[Dev Tools Extension] Registered panel: ${panelDef.name}`)
  }

  console.log(
    `[Dev Tools Extension] Initialized ${extensionState.activePanels.size} panels`
  )
}

/**
 * Start background watchers for real-time updates
 */
function startWatchers(): void {
  const unsubscribers: CoreLib.Unsubscribe[] = []

  // Watch git status
  try {
    const unsubGit = CoreLib.watchDebugLog(() => {
      updatePanelData('git', 'git-changed')
    })
    unsubscribers.push(unsubGit)
  } catch (e) {
    console.warn('[Dev Tools Extension] Git watcher failed:', e)
  }

  // Watch app health
  try {
    const unsubHealth = CoreLib.watchHealth(() => {
      updatePanelData('health', 'health-changed')
    })
    unsubscribers.push(unsubHealth)
  } catch (e) {
    console.warn('[Dev Tools Extension] Health watcher failed:', e)
  }

  // Periodic updates for expensive resources
  const updateInterval = setInterval(async () => {
    await updatePanelData('disk', 'periodic')
    await updatePanelData('build', 'periodic')
    await updatePanelData('db', 'periodic')
  }, 30000) // 30s

  unsubscribers.push(() => clearInterval(updateInterval))

  // Store for cleanup on deactivation
  ;(global as any).devToolsWatchers = unsubscribers
}

/**
 * Update panel data
 */
async function updatePanelData(panelId: string, trigger: string): Promise<void> {
  const panel = extensionState.activePanels.get(panelId)
  if (!panel) return

  try {
    let data: unknown = null

    switch (panelId) {
      case 'git':
        data = await CoreLib.getStatus()
        break
      case 'build':
        data = await CoreLib.getRecentBuilds(20)
        break
      case 'health':
        data = await CoreLib.getHealth()
        break
      case 'disk':
        data = await CoreLib.getUsage()
        break
      case 'db':
        data = await CoreLib.getMigrationStatus()
        break
    }

    panel.data = data
    panel.lastUpdate = Date.now()
    console.log(`[Dev Tools Extension] Updated panel: ${panelId} (${trigger})`)
  } catch (error) {
    console.error(`[Dev Tools Extension] Panel update failed for ${panelId}:`, error)
  }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  const watchers = (global as any).devToolsWatchers as CoreLib.Unsubscribe[] | undefined
  if (watchers) {
    watchers.forEach(unsub => {
      try {
        unsub()
      } catch (e) {
        console.warn('[Dev Tools Extension] Watcher cleanup failed:', e)
      }
    })
  }
  console.log('[Dev Tools Extension] Deactivated')
}

/**
 * Public API for panels
 */
export function getExtensionState(): ExtensionState {
  return extensionState
}

export function getPanelData(panelId: string): unknown {
  return extensionState.activePanels.get(panelId)?.data ?? null
}

export function getAllPanels(): Panel[] {
  return Array.from(extensionState.activePanels.values())
}
