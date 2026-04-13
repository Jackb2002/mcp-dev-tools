/**
 * Cleanup suggestions - identify directories like bin, obj, publish
 */

import * as fs from 'fs'
import * as path from 'path'
import { CleanupSuggestion } from '../types'
import { getConfigManager } from '../config'
import { formatBytes } from '../utils'

const CLEANUP_PATTERNS = [
  { dir: 'bin', action: 'dotnet clean' },
  { dir: 'obj', action: 'dotnet clean' },
  { dir: 'publish', action: 'Delete publish folder' },
  { dir: '.vs', action: 'Delete .vs folder (VS cache)' },
  { dir: 'node_modules', action: 'npm install or yarn install to restore' },
  { dir: '.next', action: 'Next.js build cache - safe to delete' },
  { dir: 'dist', action: 'Rebuild if needed' },
  { dir: 'build', action: 'Rebuild if needed' }
]

/**
 * Get cleanup suggestions
 */
export async function getCleanupSuggestions(dir?: string): Promise<CleanupSuggestion[]> {
  const targetDir = dir || getConfigManager().getConfig().workingDir
  const suggestions: CleanupSuggestion[] = []

  function walkDir(dirPath: string): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const fullPath = path.join(dirPath, entry.name)

        // Check against cleanup patterns
        for (const pattern of CLEANUP_PATTERNS) {
          if (entry.name === pattern.dir) {
            const size = getDirSizeBytes(fullPath)
            if (size > 0) {
              suggestions.push({
                dir: fullPath,
                size: formatBytes(size),
                action: pattern.action
              })
            }
          }
        }

        // Continue walking (but limit depth to avoid too much recursion)
        const depth = fullPath.split(path.sep).length - targetDir.split(path.sep).length
        if (depth < 4) {
          walkDir(fullPath)
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  walkDir(targetDir)
  return suggestions.sort((a, b) => {
    const sizeA = parseInt(a.size.split(' ')[0], 10)
    const sizeB = parseInt(b.size.split(' ')[0], 10)
    return sizeB - sizeA
  })
}

/**
 * Get directory size in bytes
 */
function getDirSizeBytes(dirPath: string): number {
  let size = 0

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      try {
        if (entry.isDirectory()) {
          size += getDirSizeBytes(fullPath)
        } else if (entry.isFile()) {
          const stats = fs.statSync(fullPath)
          size += stats.size
        }
      } catch (error) {
        // Skip entries we can't read
      }
    }
  } catch (error) {
    // Return 0 if we can't read
  }

  return size
}
