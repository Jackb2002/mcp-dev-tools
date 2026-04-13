/**
 * EF Core migration status
 */

import { Migration } from '../types'
import { getConfigManager } from '../config'
import { execSafe } from '../utils'

/**
 * Get EF Core migration status
 */
export async function getMigrationStatus(cwd?: string): Promise<{ pending: Migration[]; applied: Migration[] }> {
  const config = getConfigManager(cwd).getConfig()

  if (config.language !== 'dotnet') {
    return {
      pending: [],
      applied: []
    }
  }

  try {
    // Get list of all migrations
    const result = execSafe('dotnet ef migrations list', cwd || config.workingDir)

    if (result.exitCode !== 0) {
      return {
        pending: [],
        applied: []
      }
    }

    const migrations: Migration[] = []
    const lines = result.stdout.split('\n')

    for (const line of lines) {
      // EF output format: [timestamp] MigrationName
      // Applied migrations are marked
      const trimmed = line.trim()
      if (!trimmed) continue

      const isApplied = !trimmed.startsWith('*')
      const name = trimmed.replace(/^[\*\s]/, '').trim()

      if (name) {
        migrations.push({
          name,
          applied: isApplied
        })
      }
    }

    const applied = migrations.filter(m => m.applied)
    const pending = migrations.filter(m => !m.applied)

    return { pending, applied }
  } catch (error) {
    return {
      pending: [],
      applied: []
    }
  }
}
