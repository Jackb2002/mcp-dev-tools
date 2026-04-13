/**
 * Configuration management for dev-tools
 */

import * as fs from 'fs'
import * as path from 'path'
import { DevToolsConfig } from './types'

const CONFIG_FILENAME = 'dev-tools.config.json'
const CACHE_DIR_NAME = '.dev-tools'

export class ConfigManager {
  private config: DevToolsConfig | null = null
  private configPath: string
  private cacheDir: string

  constructor(workspaceRoot: string = process.cwd()) {
    this.configPath = path.join(workspaceRoot, CONFIG_FILENAME)
    this.cacheDir = path.join(this.getUserHome(), CACHE_DIR_NAME)
    this.ensureCacheDir()
  }

  /**
   * Load configuration from dev-tools.config.json
   */
  loadConfig(): DevToolsConfig {
    if (this.config) {
      return this.config
    }

    if (!fs.existsSync(this.configPath)) {
      throw new Error(
        `Configuration file not found: ${this.configPath}\n` +
        `Create a ${CONFIG_FILENAME} in your project root`
      )
    }

    const content = fs.readFileSync(this.configPath, 'utf-8')
    this.config = JSON.parse(content) as DevToolsConfig
    return this.config
  }

  /**
   * Get current configuration (load if needed)
   */
  getConfig(): DevToolsConfig {
    return this.config || this.loadConfig()
  }

  /**
   * Get cache directory path
   */
  getCacheDir(): string {
    return this.cacheDir
  }

  /**
   * Get path to a cache file
   */
  getCachePath(filename: string): string {
    return path.join(this.cacheDir, filename)
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  /**
   * Get user home directory (cross-platform)
   */
  private getUserHome(): string {
    return process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '~'
  }
}

// Singleton instance
let configManager: ConfigManager | null = null

export function getConfigManager(workspaceRoot?: string): ConfigManager {
  if (!configManager) {
    configManager = new ConfigManager(workspaceRoot)
  }
  return configManager
}
