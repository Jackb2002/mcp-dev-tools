/**
 * Git Status Panel
 * Displays current branch, changes, and ahead/behind tracking
 */

import * as CoreLib from '@dev-tools/core'

export interface GitPanelState {
  branch: string
  ahead: number
  behind: number
  untracked: string[]
  isDirty: boolean
  lastUpdate: number
}

export class GitPanel {
  private state: GitPanelState = {
    branch: 'unknown',
    ahead: 0,
    behind: 0,
    untracked: [],
    isDirty: false,
    lastUpdate: 0
  }

  /**
   * Refresh git status from core library
   */
  async refresh(): Promise<GitPanelState> {
    try {
      const status = await CoreLib.getStatus()
      this.state = {
        branch: status.branch,
        ahead: status.ahead,
        behind: status.behind,
        untracked: status.untracked || [],
        isDirty: status.ahead > 0 || status.behind > 0 || (status.untracked?.length || 0) > 0,
        lastUpdate: Date.now()
      }
      return this.state
    } catch (error) {
      console.error('[Git Panel] Refresh failed:', error)
      return this.state
    }
  }

  /**
   * Format git status for display
   */
  formatStatus(): string {
    const lines: string[] = [
      `Branch: ${this.state.branch}`,
      `Ahead: ${this.state.ahead} | Behind: ${this.state.behind}`,
      `Untracked files: ${this.state.untracked.length}`
    ]

    if (this.state.untracked.length > 0) {
      lines.push('', 'Untracked:')
      this.state.untracked.slice(0, 10).forEach(file => {
        lines.push(`  • ${file}`)
      })
      if (this.state.untracked.length > 10) {
        lines.push(`  ... and ${this.state.untracked.length - 10} more`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Get brief status icon
   */
  getIcon(): string {
    if (this.state.isDirty) {
      return '⚠️'
    }
    return '✓'
  }

  getState(): GitPanelState {
    return this.state
  }
}
