/**
 * App health - check if running, get port info
 */

import * as net from 'net'
import { Health, HealthStatus, Unsubscribe, WatcherCallback } from '../types'
import { getConfigManager } from '../config'
import { execSafe, formatBytes } from '../utils'

/**
 * Check if a port is open (app is running)
 */
function isPortOpen(port: number, timeout: number = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, 'localhost')
    socket.setTimeout(timeout)

    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })

    socket.on('error', () => {
      resolve(false)
    })
  })
}

/**
 * Get app health status
 */
export async function getHealth(appPort?: number): Promise<Health> {
  const config = getConfigManager().getConfig()
  const port = appPort || config.appPort

  if (!port) {
    return {
      running: false
    }
  }

  const portOpen = await isPortOpen(port)

  if (!portOpen) {
    return {
      running: false
    }
  }

  // Try to get process info
  let pid: number | undefined
  let uptime: string | undefined
  let memory: string | undefined
  let error: string | undefined

  try {
    // macOS/Linux: lsof -i :PORT
    const output = execSafe(`lsof -i :${port}`, undefined)
    if (output.exitCode === 0) {
      const lines = output.stdout.split('\n')
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/)
        if (parts.length > 1) {
          pid = parseInt(parts[1], 10)
        }
      }
    }
  } catch (err) {
    // Fallback - just mark as running but record error
    error = `Failed to get PID: ${(err as Error).message}`
  }

  // Try to get memory usage
  if (pid) {
    try {
      const psOutput = execSafe(`ps -o pid,rss,etime ${pid}`, undefined)
      if (psOutput.exitCode === 0) {
        const lines = psOutput.stdout.split('\n')
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/).filter(p => p)
          if (parts.length >= 2) {
            memory = formatBytes(parseInt(parts[1], 10) * 1024)
          }
          if (parts.length >= 3) {
            uptime = parts[2]
          }
        }
      }
    } catch (err) {
      // Ignore process info retrieval errors - app is still running
    }
  }

  return {
    running: true,
    pid,
    uptime,
    memory,
    ports: [port],
    ...(error && { _error: error })
  }
}

/**
 * Watch app health status
 */
export function watchHealth(callback: WatcherCallback<HealthStatus>, interval: number = 5000): Unsubscribe {
  let lastStatus: HealthStatus = 'unknown'

  async function check(): Promise<void> {
    const health = await getHealth()
    const newStatus: HealthStatus = health.running ? 'running' : 'stopped'

    if (newStatus !== lastStatus) {
      lastStatus = newStatus
      callback(newStatus)
    }
  }

  // Initial check
  check()

  // Periodic check
  const timer = setInterval(check, interval)

  return () => {
    clearInterval(timer)
  }
}
