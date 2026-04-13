/**
 * Abstract Debug Adapter - defines interface for language-specific debuggers
 */

import {
  Breakpoint,
  StackFrame,
  Variable,
  EvaluationResult,
  Watch,
  Unsubscribe,
  WatcherCallback
} from '../../types'

/**
 * Abstract interface for debug adapters
 * Implementations: DAP (multi-language), .NET-specific, Python, etc.
 */
export interface IDebugAdapter {
  // Lifecycle
  start(): Promise<void>
  stop(): Promise<void>
  isRunning(): boolean

  // Breakpoints
  setBreakpoint(file: string, line: number): Promise<Breakpoint>
  clearBreakpoint(id: string): Promise<void>
  getBreakpoints(): Promise<Breakpoint[]>

  // Execution control
  continue(): Promise<void>
  pause(): Promise<void>
  stepOver(): Promise<void>
  stepInto(): Promise<void>
  stepOut(): Promise<void>

  // Stack and variables
  getStackTrace(threadId?: number): Promise<StackFrame[]>
  getVariables(frameId: number): Promise<Variable[]>

  // Evaluation
  evaluate(expr: string, frameId?: number): Promise<EvaluationResult>
  addWatch(expr: string): Promise<Watch>
  removeWatch(id: string): Promise<void>
  getWatches(): Promise<Watch[]>

  // Event listeners
  onBreakpoint(callback: WatcherCallback<StackFrame>): Unsubscribe
  onPaused(callback: WatcherCallback<StackFrame>): Unsubscribe
  onContinued(callback: () => void): Unsubscribe
  onTerminated(callback: () => void): Unsubscribe
}

/**
 * Base adapter implementation with common functionality
 */
export abstract class BaseDebugAdapter implements IDebugAdapter {
  protected running = false
  protected breakpoints: Map<string, Breakpoint> = new Map()
  protected watches: Map<string, Watch> = new Map()

  async start(): Promise<void> {
    this.running = true
  }

  async stop(): Promise<void> {
    this.running = false
  }

  isRunning(): boolean {
    return this.running
  }

  async getBreakpoints(): Promise<Breakpoint[]> {
    return Array.from(this.breakpoints.values())
  }

  async getWatches(): Promise<Watch[]> {
    return Array.from(this.watches.values())
  }

  abstract setBreakpoint(file: string, line: number): Promise<Breakpoint>
  abstract clearBreakpoint(id: string): Promise<void>
  abstract continue(): Promise<void>
  abstract pause(): Promise<void>
  abstract stepOver(): Promise<void>
  abstract stepInto(): Promise<void>
  abstract stepOut(): Promise<void>
  abstract getStackTrace(threadId?: number): Promise<StackFrame[]>
  abstract getVariables(frameId: number): Promise<Variable[]>
  abstract evaluate(expr: string, frameId?: number): Promise<EvaluationResult>
  abstract addWatch(expr: string): Promise<Watch>
  abstract removeWatch(id: string): Promise<void>
  abstract onBreakpoint(callback: WatcherCallback<StackFrame>): Unsubscribe
  abstract onPaused(callback: WatcherCallback<StackFrame>): Unsubscribe
  abstract onContinued(callback: () => void): Unsubscribe
  abstract onTerminated(callback: () => void): Unsubscribe
}
