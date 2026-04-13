/**
 * Debug log tailing - app stderr/stdout
 */

import * as fs from 'fs'
import { getConfigManager } from '../config'
import { Unsubscribe, WatcherCallback } from '../types'
import { fileExists } from '../utils'

/**
 * Watch debug log file for new lines (tail -f behavior)
 */
export function watchDebugLog(callback: WatcherCallback<string>): Unsubscribe {
  const config = getConfigManager().getConfig()
  const debugLogFile = config.debugLogFile

  if (!debugLogFile || !fileExists(debugLogFile)) {
    console.warn(`Debug log file not configured or not found: ${debugLogFile}`)
    return () => {}
  }

  let lastPosition = 0

  // Initial read
  try {
    const content = fs.readFileSync(debugLogFile, 'utf-8')
    const lines = content.split('\n').filter((line: string) => line)
    lines.forEach(callback)
    lastPosition = content.length
  } catch (error) {
    console.error('Failed to read debug log:', error)
  }

  // Watch for changes
  const watcher = fs.watch(debugLogFile, (eventType) => {
    if (eventType === 'change') {
      try {
        const content = fs.readFileSync(debugLogFile, 'utf-8')
        const newContent = content.slice(lastPosition)
        lastPosition = content.length

        const newLines = newContent.split('\n').filter((line: string) => line)
        newLines.forEach(callback)
      } catch (error) {
        console.error('Failed to read debug log update:', error)
      }
    }
  })

  return () => {
    watcher.close()
  }
}
