/**
 * Disk usage analysis - du -sh by directory, find large files
 */

import * as fs from 'fs'
import * as path from 'path'
import { FileInfo } from '../types'
import { exec, formatBytes } from '../utils'
import { getConfigManager } from '../config'

/**
 * Get disk usage by directory
 */
export async function getUsage(dir?: string): Promise<Record<string, string>> {
  const targetDir = dir || getConfigManager().getConfig().workingDir

  try {
    // On macOS/Linux: du -sh
    const output = exec(`du -sh ${targetDir}/*`, targetDir)
    const result: Record<string, string> = {}

    const lines = output.split('\n')
    for (const line of lines) {
      const parts = line.split('\t')
      if (parts.length === 2) {
        const size = parts[0].trim()
        const dirName = path.basename(parts[1].trim())
        result[dirName] = size
      }
    }

    return result
  } catch (error) {
    // Fallback: manual directory size calculation
    return calculateDirSize(targetDir)
  }
}

/**
 * Find large files (>100MB)
 */
export async function getLargeFiles(dir?: string, minSizeMB: number = 100): Promise<FileInfo[]> {
  const targetDir = dir || getConfigManager().getConfig().workingDir
  const minSizeBytes = minSizeMB * 1024 * 1024

  const largeFiles: FileInfo[] = []

  function walkDir(dirPath: string): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        // Skip common directories
        if (['.git', 'node_modules', 'bin', 'obj', '.vs'].includes(entry.name)) {
          continue
        }

        if (entry.isDirectory()) {
          walkDir(fullPath)
        } else if (entry.isFile()) {
          const stats = fs.statSync(fullPath)
          if (stats.size > minSizeBytes) {
            largeFiles.push({
              path: fullPath,
              size: formatBytes(stats.size),
              sizeBytes: stats.size
            })
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  walkDir(targetDir)
  return largeFiles.sort((a, b) => b.sizeBytes - a.sizeBytes)
}

/**
 * Calculate directory size recursively
 */
function calculateDirSize(dirPath: string): Record<string, string> {
  const result: Record<string, string> = {}

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      try {
        let sizeBytes = 0

        if (entry.isDirectory()) {
          sizeBytes = getDirSizeBytes(fullPath)
        } else if (entry.isFile()) {
          const stats = fs.statSync(fullPath)
          sizeBytes = stats.size
        }

        result[entry.name] = formatBytes(sizeBytes)
      } catch (error) {
        // Skip entries we can't read
      }
    }
  } catch (error) {
    // Return empty if we can't read the directory
  }

  return result
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
    // Return 0 if we can't read the directory
  }

  return size
}
