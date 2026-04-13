/**
 * Git status - branch, ahead/behind, untracked files
 */

import { GitStatus } from '../types'
import { exec, execSafe } from '../utils'

/**
 * Get current git status
 */
export async function getStatus(cwd?: string): Promise<GitStatus> {
  try {
    const currentBranch = exec('git rev-parse --abbrev-ref HEAD', cwd)

    // Get ahead/behind count
    const trackingBranch = exec(`git rev-parse --abbrev-ref ${currentBranch}@{upstream}`, cwd).trim()
    let ahead = 0
    let behind = 0

    if (trackingBranch && !trackingBranch.startsWith('fatal:')) {
      const result = execSafe(`git rev-list --left-right --count ${currentBranch}...${trackingBranch}`, cwd)
      if (result.exitCode === 0) {
        const [aheadStr, behindStr] = result.stdout.split('\t')
        ahead = parseInt(aheadStr, 10) || 0
        behind = parseInt(behindStr, 10) || 0
      }
    }

    // Get untracked files
    const untrackedOutput = exec('git ls-files --others --exclude-standard', cwd)
    const untracked = untrackedOutput ? untrackedOutput.split('\n').filter(f => f) : []

    return {
      branch: currentBranch,
      ahead,
      behind,
      untracked
    }
  } catch (error) {
    throw new Error(`Failed to get git status: ${error instanceof Error ? error.message : String(error)}`)
  }
}
