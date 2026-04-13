/**
 * Schema snapshots - cache database schema
 */

import { Table } from '../types'
import { getConfigManager } from '../config'
import { readJSONSafe, writeJSON } from '../utils'

const SCHEMA_CACHE_FILE = 'schema-snapshot.json'

/**
 * Get cached schema snapshot
 */
export async function getSchemaSnapshot(): Promise<Record<string, Table[]>> {
  const cachePath = getConfigManager().getCachePath(SCHEMA_CACHE_FILE)
  return readJSONSafe<Record<string, Table[]>>(cachePath, {})
}

/**
 * Update schema snapshot cache
 */
export async function updateSchemaSnapshot(schema: Record<string, Table[]>): Promise<void> {
  const cachePath = getConfigManager().getCachePath(SCHEMA_CACHE_FILE)
  writeJSON(cachePath, schema)
}
