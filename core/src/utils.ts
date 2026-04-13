/**
 * Utility functions
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

/**
 * Execute a shell command and return output
 */
export function exec(command: string, cwd?: string): string {
  try {
    return execSync(command, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Command failed: ${command}\n${error.message}`)
    }
    throw error
  }
}

/**
 * Execute a shell command, returning output even if it fails
 */
export function execSafe(command: string, cwd?: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(command, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
    return { stdout, stderr: '', exitCode: 0 }
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const status = (error as any).status || 1
      return { stdout: '', stderr: error.message, exitCode: status }
    }
    return { stdout: '', stderr: String(error), exitCode: 1 }
  }
}

/**
 * Read file as string
 */
export function readFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  return fs.readFileSync(filePath, 'utf-8')
}

/**
 * Read file safely, return empty string if not found
 */
export function readFileSafe(filePath: string): string {
  try {
    return readFile(filePath)
  } catch {
    return ''
  }
}

/**
 * Write file
 */
export function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, content, 'utf-8')
}

/**
 * Write JSON file
 */
export function writeJSON(filePath: string, data: any): void {
  writeFile(filePath, JSON.stringify(data, null, 2))
}

/**
 * Read JSON file
 */
export function readJSON<T = any>(filePath: string): T {
  const content = readFile(filePath)
  return JSON.parse(content)
}

/**
 * Read JSON file safely
 */
export function readJSONSafe<T = any>(filePath: string, defaultValue: T): T {
  try {
    return readJSON<T>(filePath)
  } catch {
    return defaultValue
  }
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

/**
 * Get last N lines from a file
 */
export function getLastLines(filePath: string, count: number = 50): string[] {
  if (!fileExists(filePath)) {
    return []
  }
  const content = readFile(filePath)
  const lines = content.split('\n')
  return lines.slice(Math.max(0, lines.length - count))
}

/**
 * Format bytes as human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Parse command output as key-value pairs
 */
export function parseKeyValue(output: string, separator: string = '='): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = output.split('\n')
  for (const line of lines) {
    const [key, ...valueParts] = line.split(separator)
    if (key && valueParts.length > 0) {
      result[key.trim()] = valueParts.join(separator).trim()
    }
  }
  return result
}
