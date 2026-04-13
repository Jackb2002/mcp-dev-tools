/**
 * Build log parsing - dotnet build output
 */

import { getConfigManager } from '../config'
import { getLastLines, fileExists } from '../utils'

/**
 * Get last N lines of build log
 */
export async function getBuildLog(lines: number = 100, cwd?: string): Promise<string> {
  const config = getConfigManager(cwd).getConfig()

  if (!config.logDir) {
    return 'Build log directory not configured'
  }

  // Common paths for dotnet build logs
  const possiblePaths = [
    `${config.logDir}/build.log`,
    `${config.logDir}/latest.log`,
    `${config.workingDir}/build.log`
  ]

  for (const logPath of possiblePaths) {
    if (fileExists(logPath)) {
      const logLines = getLastLines(logPath, lines)
      return logLines.join('\n')
    }
  }

  return 'No build log found'
}
