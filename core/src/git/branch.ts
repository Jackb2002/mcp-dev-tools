/**
 * Git diff and recent commits
 */

import { GitDiff, CommitInfo } from '../types'
import { exec } from '../utils'

/**
 * Get diff of changed files since base branch (default: main)
 */
export async function getDiff(baseBranch: string = 'main', cwd?: string): Promise<GitDiff> {
  try {
    const added = exec(`git diff ${baseBranch}...HEAD --name-only --diff-filter=A`, cwd)
      .split('\n')
      .filter(f => f)

    const modified = exec(`git diff ${baseBranch}...HEAD --name-only --diff-filter=M`, cwd)
      .split('\n')
      .filter(f => f)

    const deleted = exec(`git diff ${baseBranch}...HEAD --name-only --diff-filter=D`, cwd)
      .split('\n')
      .filter(f => f)

    return { added, modified, deleted }
  } catch (error) {
    throw new Error(`Failed to get git diff: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Get recent commits
 */
export async function getRecentCommits(count: number = 10, cwd?: string): Promise<CommitInfo[]> {
  try {
    const format = '%H%n%an%n%s%n%ai%n---'
    const output = exec(`git log -${count} --format=${format}`, cwd)

    const commits: CommitInfo[] = []
    const parts = output.split('---').filter(p => p.trim())

    for (const part of parts) {
      const lines = part.trim().split('\n')
      if (lines.length >= 4) {
        commits.push({
          hash: lines[0].trim(),
          author: lines[1].trim(),
          message: lines[2].trim(),
          date: new Date(lines[3].trim())
        })
      }
    }

    return commits
  } catch (error) {
    throw new Error(`Failed to get recent commits: ${error instanceof Error ? error.message : String(error)}`)
  }
}
