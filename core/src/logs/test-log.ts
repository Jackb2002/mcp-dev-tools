/**
 * Test results parsing
 */

import { TestResults } from '../types'
import { getConfigManager } from '../config'
import { execSafe } from '../utils'

/**
 * Get last test run result
 */
export async function getTestResults(cwd?: string): Promise<TestResults> {
  const config = getConfigManager(cwd).getConfig()

  if (!config.testCommand) {
    return {
      passed: 0,
      failed: 0,
      output: 'Test command not configured'
    }
  }

  try {
    // Run test command
    const result = execSafe(config.testCommand, cwd || config.workingDir)

    // Simple parsing - look for common test output patterns
    const output = result.stdout + result.stderr
    const lines = output.split('\n')

    let passed = 0
    let failed = 0

    for (const line of lines) {
      // Match patterns like "1 passed", "2 failed"
      const passedMatch = line.match(/(\d+)\s+passed/)
      const failedMatch = line.match(/(\d+)\s+failed/)

      if (passedMatch) passed = parseInt(passedMatch[1], 10)
      if (failedMatch) failed = parseInt(failedMatch[1], 10)
    }

    return {
      passed,
      failed,
      output: output.substring(0, 5000) // Truncate to 5000 chars
    }
  } catch (error) {
    return {
      passed: 0,
      failed: 0,
      output: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
