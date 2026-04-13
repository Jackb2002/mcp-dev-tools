/**
 * Debug Adapter Protocol (DAP) Implementation
 * Provides multi-language debugging via standardized DAP protocol
 */

import { spawn, ChildProcess } from 'child_process'
import {
  Breakpoint,
  StackFrame,
  Variable,
  EvaluationResult,
  Watch,
  Unsubscribe,
  WatcherCallback
} from '../../types'
import { BaseDebugAdapter } from './adapter'

interface DAPRequest {
  seq: number
  type: 'request'
  command: string
  arguments?: Record<string, unknown>
}

interface DAPResponse {
  seq: number
  type: 'response'
  request_seq: number
  command: string
  success: boolean
  body?: Record<string, unknown>
}

interface DAPEvent {
  seq: number
  type: 'event'
  event: string
  body?: Record<string, unknown>
}

type DAPMessage = DAPRequest | DAPResponse | DAPEvent

/**
 * DAP client implementation for multi-language debugging
 * Launches a debug adapter (vscode-debug-adapter, netcore debugger, etc)
 * and communicates via the DAP protocol over stdin/stdout.
 *
 * Supports two adapter styles:
 *  - Node.js scripts (*.js)  → spawned as `node <adapterPath>`
 *  - Native binaries (vsdbg) → spawned directly as `<adapterPath> --interpreter=vscode`
 *
 * Supports two session styles controlled by launchConfig.request:
 *  - "launch"  → starts a new process
 *  - "attach"  → attaches to an existing process by PID
 */
export class DAPDebugger extends BaseDebugAdapter {
  private debugProcess: ChildProcess | null = null
  private messageId = 1
  private pendingRequests = new Map<number, (response: DAPResponse) => void>()
  private threadMap = new Map<number, string>() // threadId -> threadName
  private listeners: Map<string, Set<Function>> = new Map()

  constructor(
    private adapterPath: string,
    private launchConfig: Record<string, unknown>
  ) {
    super()
  }

  async start(): Promise<void> {
    await super.start()

    // Native binaries (e.g. vsdbg-ui) are spawned directly with --interpreter=vscode.
    // Node.js adapter scripts are spawned via `node`.
    const isNodeScript = this.adapterPath.endsWith('.js')
    const [cmd, args] = isNodeScript
      ? ['node', [this.adapterPath]]
      : [this.adapterPath, ['--interpreter=vscode']]

    this.debugProcess = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    if (!this.debugProcess.stdin || !this.debugProcess.stdout) {
      throw new Error('Failed to initialize debug adapter streams')
    }

    // Handle responses and events using proper Content-Length framing.
    // DAP spec says \r\n but vsdbg on macOS sends \n — handle both.
    this.debugProcess.stdout.setEncoding('utf-8')
    let buffer = ''

    this.debugProcess.stdout.on('data', (chunk: string) => {
      buffer += chunk

      while (true) {
        const headerMatch = buffer.match(/Content-Length: (\d+)\r?\n\r?\n/)
        if (!headerMatch) break

        const contentLength = parseInt(headerMatch[1], 10)
        const bodyStart = headerMatch.index! + headerMatch[0].length

        if (buffer.length < bodyStart + contentLength) break // wait for rest

        const body = buffer.substring(bodyStart, bodyStart + contentLength)
        buffer = buffer.substring(bodyStart + contentLength)

        try {
          const message = JSON.parse(body) as DAPMessage
          if (message.type === 'response') {
            this.handleResponse(message as DAPResponse)
          } else if (message.type === 'event') {
            this.handleEvent(message as DAPEvent)
          } else if (message.type === 'request') {
            this.handleIncomingRequest(message as DAPRequest)
          }
        } catch (e) {
          console.error('Failed to parse DAP message:', body, e)
        }
      }
    })

    // Handle adapter errors
    this.debugProcess.stderr?.on('data', (chunk: Buffer) => {
      console.error('Debug adapter error:', chunk.toString())
    })

    // Send initialize request — adapterID must be 'coreclr' for vsdbg
    await this.sendRequest('initialize', {
      adapterID: 'coreclr',
      clientID: 'dev-tools',
      clientName: 'Dev Tools',
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
      supportsVariableType: true,
      supportsVariablePaging: true,
      supportsRunInTerminalRequest: false,
      supportsMemoryReferences: true,
      supportsProgressReporting: true,
      supportsInvalidatedEvent: true
    })

    // Send launch or attach request based on launchConfig.request
    const sessionType = (this.launchConfig.request as string) === 'attach' ? 'attach' : 'launch'
    await this.sendRequest(sessionType, this.launchConfig)

    // Send configurationDone to signal end of setup. Some adapters return
    // success:false when another debugger is already attached — treat as
    // a non-fatal warning so the session stays usable for read operations.
    try {
      await this.sendRequest('configurationDone', {})
    } catch (e) {
      console.error('[DAP] configurationDone non-fatal:', (e as Error).message)
    }
  }

  // Handle reverse requests sent by vsdbg (e.g. the security handshake)
  private handleIncomingRequest(req: DAPRequest): void {
    if (req.command === 'handshake') {
      // vsdbg sends a Microsoft-specific security challenge during init.
      // For local stdio sessions the response value is not validated,
      // so respond with an empty string to unblock the adapter.
      this.sendHandshakeResponse(req.seq)
    }
  }

  private sendHandshakeResponse(requestSeq: number): void {
    const stdin = this.debugProcess?.stdin
    if (!stdin) return
    const body = JSON.stringify({
      seq: this.messageId++,
      type: 'response',
      request_seq: requestSeq,
      success: true,
      command: 'handshake',
      body: { value: '' }
    })
    stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }

  async stop(): Promise<void> {
    if (this.debugProcess) {
      await this.sendRequest('terminate', {})
      this.debugProcess.kill()
      this.debugProcess = null
    }
    await super.stop()
  }

  async setBreakpoint(file: string, line: number): Promise<Breakpoint> {
    const response = await this.sendRequest('setBreakpoints', {
      source: { path: file },
      breakpoints: [{ line }],
      sourceModified: false
    })

    const breakpoints = (response.body as any)?.breakpoints || []
    if (breakpoints.length === 0) {
      throw new Error(`Failed to set breakpoint at ${file}:${line}`)
    }

    const bp = breakpoints[0]
    const id = `${file}:${line}`
    const breakpoint: Breakpoint = {
      id,
      file,
      line: bp.line || line,
      verified: bp.verified || false
    }

    this.breakpoints.set(id, breakpoint)
    return breakpoint
  }

  async clearBreakpoint(id: string): Promise<void> {
    const bp = this.breakpoints.get(id)
    if (!bp) return

    await this.sendRequest('setBreakpoints', {
      source: { path: bp.file },
      breakpoints: [],
      sourceModified: false
    })

    this.breakpoints.delete(id)
  }

  async continue(): Promise<void> {
    await this.sendRequest('continue', {
      threadId: this.getMainThreadId()
    })
  }

  async pause(): Promise<void> {
    await this.sendRequest('pause', {
      threadId: this.getMainThreadId()
    })
  }

  async stepOver(): Promise<void> {
    await this.sendRequest('next', {
      threadId: this.getMainThreadId()
    })
  }

  async stepInto(): Promise<void> {
    await this.sendRequest('stepIn', {
      threadId: this.getMainThreadId()
    })
  }

  async stepOut(): Promise<void> {
    await this.sendRequest('stepOut', {
      threadId: this.getMainThreadId()
    })
  }

  async getStackTrace(threadId?: number): Promise<StackFrame[]> {
    threadId = threadId || this.getMainThreadId()

    const response = await this.sendRequest('stackTrace', {
      threadId,
      startFrame: 0,
      levels: 20
    })

    const frames = (response.body as any)?.stackFrames || []
    return frames.map((f: any) => ({
      id: f.id,
      name: f.name,
      file: f.source?.path || '',
      line: f.line || 0,
      column: f.column || 0
    }))
  }

  async getVariables(frameId: number): Promise<Variable[]> {
    const response = await this.sendRequest('scopes', {
      frameId
    })

    const scopes = (response.body as any)?.scopes || []
    if (scopes.length === 0) return []

    // Get variables from local scope
    const varsResponse = await this.sendRequest('variables', {
      variablesReference: scopes[0].variablesReference
    })

    const variables = (varsResponse.body as any)?.variables || []
    return variables.map((v: any) => ({
      name: v.name,
      value: v.value,
      type: v.type,
      variablesReference: v.variablesReference || 0
    }))
  }

  async evaluate(expr: string, frameId?: number): Promise<EvaluationResult> {
    const response = await this.sendRequest('evaluate', {
      expression: expr,
      frameId: frameId || 0,
      context: 'watch'
    })

    const body = response.body as any
    return {
      value: body.result,
      type: body.type,
      variablesReference: body.variablesReference || 0
    }
  }

  async addWatch(expr: string): Promise<Watch> {
    const id = `watch-${Date.now()}`
    const watch: Watch = {
      id,
      expr,
      value: '<pending>'
    }

    this.watches.set(id, watch)

    // Evaluate immediately
    try {
      const result = await this.evaluate(expr)
      watch.value = result.value
    } catch (e) {
      watch.value = '<error>'
    }

    return watch
  }

  async removeWatch(id: string): Promise<void> {
    this.watches.delete(id)
  }

  onBreakpoint(callback: WatcherCallback<StackFrame>): Unsubscribe {
    return this.addEventListener('stopped', (event: any) => {
      // Parse stopped event and get current stack frame
      if (event.reason === 'breakpoint') {
        // In a real implementation, fetch and pass actual stack frame
        callback({
          id: 0,
          name: '<breakpoint>',
          file: '',
          line: 0
        })
      }
    })
  }

  onPaused(callback: WatcherCallback<StackFrame>): Unsubscribe {
    return this.addEventListener('stopped', (_event: any) => {
      callback({
        id: 0,
        name: '<paused>',
        file: '',
        line: 0
      })
    })
  }

  onContinued(callback: () => void): Unsubscribe {
    return this.addEventListener('continued', callback)
  }

  onTerminated(callback: () => void): Unsubscribe {
    return this.addEventListener('terminated', callback)
  }

  // Private helpers

  private async sendRequest(
    command: string,
    args?: Record<string, unknown>
  ): Promise<DAPResponse> {
    const stdin = this.debugProcess?.stdin
    if (!stdin) {
      throw new Error('Debug adapter not running')
    }

    const seq = this.messageId++
    const message: DAPRequest = {
      seq,
      type: 'request',
      command,
      arguments: args
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(seq)
        reject(new Error(`DAP request ${command} timed out`))
      }, 5000)

      this.pendingRequests.set(seq, (response) => {
        clearTimeout(timeout)
        if (response.success) {
          resolve(response)
        } else {
          reject(new Error(`DAP request ${command} failed: ${JSON.stringify(response.body)}`))

        }
      })

      const content = JSON.stringify(message)
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`
      stdin.write(header + content)
    })
  }

  private handleResponse(response: DAPResponse): void {
    const handler = this.pendingRequests.get(response.request_seq)
    if (handler) {
      this.pendingRequests.delete(response.request_seq)
      handler(response)
    }
  }

  private handleEvent(event: DAPEvent): void {
    const listeners = this.listeners.get(event.event) || new Set()
    listeners.forEach((callback) => {
      try {
        callback(event.body)
      } catch (e) {
        console.error('Error in event listener:', e)
      }
    })
  }

  private addEventListener(
    eventName: string,
    callback: Function
  ): Unsubscribe {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set())
    }

    this.listeners.get(eventName)!.add(callback)

    return () => {
      const listeners = this.listeners.get(eventName)
      if (listeners) {
        listeners.delete(callback)
      }
    }
  }

  private getMainThreadId(): number {
    return this.threadMap.size > 0 ? Array.from(this.threadMap.keys())[0] : 1
  }
}
