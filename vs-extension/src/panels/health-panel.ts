/**
 * App Health Panel
 * Displays application running status, PID, memory usage, and port binding
 */

import * as CoreLib from '@dev-tools/core'

export interface HealthPanelState {
  running: boolean
  pid?: number
  uptime?: string
  memory?: string
  cpu?: string
  ports: string[]
  lastCheck: number
}

export class HealthPanel {
  private state: HealthPanelState = {
    running: false,
    ports: [],
    lastCheck: 0
  }

  /**
   * Refresh health status from core library
   */
  async refresh(appPort?: number): Promise<HealthPanelState> {
    try {
      const health = await CoreLib.getHealth(appPort)
      this.state = {
        running: (health as any).running || false,
        pid: (health as any).pid,
        uptime: (health as any).uptime,
        memory: (health as any).memory,
        cpu: (health as any).cpu,
        ports: (health as any).ports || [],
        lastCheck: Date.now()
      }
      return this.state
    } catch (error) {
      console.error('[Health Panel] Refresh failed:', error)
      return this.state
    }
  }

  /**
   * Format health status for display
   */
  formatStatus(): string {
    const lines: string[] = []

    if (this.state.running) {
      lines.push('✅ App is running')
      if (this.state.pid) lines.push(`   PID: ${this.state.pid}`)
      if (this.state.uptime) lines.push(`   Uptime: ${this.state.uptime}`)
      if (this.state.memory) lines.push(`   Memory: ${this.state.memory}`)
      if (this.state.cpu) lines.push(`   CPU: ${this.state.cpu}`)
    } else {
      lines.push('❌ App is not running')
    }

    if (this.state.ports.length > 0) {
      lines.push('')
      lines.push('Ports:')
      this.state.ports.forEach(port => {
        lines.push(`  • ${port}`)
      })
    }

    return lines.join('\n')
  }

  /**
   * Get health status icon
   */
  getIcon(): string {
    return this.state.running ? '🟢' : '🔴'
  }

  getState(): HealthPanelState {
    return this.state
  }
}
