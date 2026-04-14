/**
 * Browser console log capture via CDP
 */

import { withCDP } from './cdp'

export type ConsoleLevel = 'log' | 'info' | 'warning' | 'error' | 'debug'

export interface ConsoleEntry {
  level: ConsoleLevel
  text: string
  url?: string
  line?: number
  column?: number
  timestamp: number
  source: 'console-api' | 'javascript' | 'network' | 'other'
}

/**
 * Retrieve recent console entries from the active browser tab.
 * CDP Console.enable + Runtime lets us evaluate a snippet that reads
 * logged messages captured via a console proxy injected into the page,
 * but the simplest reliable approach is to get the current log via
 * Runtime.evaluate against window.__devToolsConsoleLog if we injected it,
 * falling back to the CDP Console message event buffer.
 *
 * For one-shot reads we connect, flush buffered messages, then disconnect.
 */
export async function getConsoleEntries(port: number, limit = 50): Promise<ConsoleEntry[]> {
  return withCDP(port, async (client) => {
    const entries: ConsoleEntry[] = []

    // Collect Console API messages (console.log/warn/error etc.)
    client.Console.on('messageAdded', (params: { message: { level: string; text: string; url?: string; line?: number; column?: number; source: string; timestamp?: number } }) => {
      const msg = params.message
      entries.push({
        level: mapConsoleLevel(msg.level),
        text: msg.text,
        url: msg.url,
        line: msg.line,
        column: msg.column,
        timestamp: msg.timestamp ?? Date.now(),
        source: mapSource(msg.source)
      })
    })

    // Also capture uncaught exceptions via Runtime
    client.Runtime.on('exceptionThrown', (params: { timestamp: number; exceptionDetails: { text?: string; exception?: { description?: string }; url?: string; lineNumber?: number; columnNumber?: number } }) => {
      const ex = params.exceptionDetails
      entries.push({
        level: 'error',
        text: ex.exception?.description ?? ex.text ?? 'Uncaught exception',
        url: ex.url,
        line: ex.lineNumber,
        column: ex.columnNumber,
        timestamp: params.timestamp,
        source: 'javascript'
      })
    })

    // Brief wait for buffered events to flush (CDP sends them on enable)
    await new Promise<void>(resolve => setTimeout(resolve, 300))

    return entries.slice(-limit)
  })
}

/**
 * Evaluate JavaScript in the current page context and return the result.
 */
export async function evaluateInPage(port: number, expression: string): Promise<{ result: string; type: string; error?: string }> {
  return withCDP(port, async (client) => {
    const response = await client.Runtime.evaluate({
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: false
    })

    if (response.exceptionDetails) {
      const ex = response.exceptionDetails
      return {
        result: '',
        type: 'error',
        error: ex.exception?.description ?? ex.text ?? 'Evaluation failed'
      }
    }

    const val = response.result
    const result = val.value !== undefined
      ? JSON.stringify(val.value)
      : val.description ?? String(val.value)

    return { result, type: val.type ?? 'undefined' }
  })
}

function mapConsoleLevel(level: string): ConsoleLevel {
  switch (level) {
    case 'warning': return 'warning'
    case 'error': return 'error'
    case 'debug': return 'debug'
    case 'info': return 'info'
    default: return 'log'
  }
}

function mapSource(source: string): ConsoleEntry['source'] {
  switch (source) {
    case 'console-api': return 'console-api'
    case 'javascript': return 'javascript'
    case 'network': return 'network'
    default: return 'other'
  }
}
