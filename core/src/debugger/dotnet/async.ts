/**
 * .NET-specific Debugging - Async/Await State Machine
 * Inspects async method state, continuations, and Task information
 */

import { Variable } from '../../types'

/**
 * Awaiter states in async state machines
 */
export enum AwaiterState {
  NotStarted = 'NotStarted',
  Completed = 'Completed',
  Faulted = 'Faulted',
  Cancelled = 'Cancelled',
  Pending = 'Pending'
}

/**
 * Information about an async method's state machine
 */
export interface AsyncMethodState {
  methodName: string
  stateMachineType: string
  currentState: number
  humanReadableState: string
  stateName: string
  isCompleted: boolean
  isFaulted: boolean
  isCancelled: boolean

  // Current awaiter
  awaiterType?: string
  awaiterState: AwaiterState
  awaiterResult?: string

  // Exception if faulted
  exception?: {
    type: string
    message: string
    stackTrace: string
  }

  // Continuations
  pendingContinuations: Continuation[]
}

export interface Continuation {
  type: 'AwaitOnCompleted' | 'AwaitUnsafeOnCompleted' | 'OnCompleted'
  target?: string
  state?: string
}

/**
 * Task information for debugging async operations
 */
export interface TaskInfo {
  id: number
  status: 'Created' | 'WaitingForActivation' | 'WaitingToRun' | 'Running' | 'WaitingForChildrenToComplete' | 'Completed' | 'Canceled' | 'Faulted'
  isCompleted: boolean
  isCanceled: boolean
  isFaulted: boolean
  creationStackTrace?: string
  executingTaskScheduler?: string
  debugInfo?: string

  // Result if completed
  result?: string
  resultType?: string

  // Exception if faulted
  exception?: {
    type: string
    message: string
    innerException?: string
  }

  // Child tasks
  childTasks: number[]
}

/**
 * Analyzes async method state machines
 */
export class AsyncStateAnalyzer {
  /**
   * Extract async method state from a variable that's an async state machine
   */
  static getAsyncMethodState(variable: Variable): AsyncMethodState | null {
    if (!this.isAsyncStateMachine(variable.type)) {
      return null
    }

    // Parse state machine type to extract method name
    const methodMatch = variable.type?.match(/<(.+?)>/)
    const methodName = methodMatch?.[1] || variable.type || 'Unknown'

    return {
      methodName,
      stateMachineType: variable.type || '',
      currentState: 0,
      humanReadableState: 'Unknown',
      stateName: 'Unknown',
      isCompleted: false,
      isFaulted: false,
      isCancelled: false,
      awaiterState: AwaiterState.Pending,
      pendingContinuations: []
    }
  }

  /**
   * Get human-readable description of async state
   */
  static describeAsyncState(state: AsyncMethodState): string {
    const parts: string[] = [
      `Async ${state.methodName}`,
      `State: ${state.humanReadableState}`,
      `Awaiter: ${state.awaiterState}`
    ]

    if (state.exception) {
      parts.push(`Exception: ${state.exception.type}`)
    }

    if (state.pendingContinuations.length > 0) {
      parts.push(`${state.pendingContinuations.length} pending continuations`)
    }

    return parts.join(' | ')
  }

  /**
   * Check if a type is an async state machine
   */
  private static isAsyncStateMachine(type?: string): boolean {
    if (!type) return false
    return type.includes('<') && type.includes('>') && (type.includes('d__') || type.includes('StateMachine'))
  }
}

/**
 * Inspects Task and Task<T> objects
 */
export class TaskInspector {
  /**
   * Get task information from a Task variable
   */
  static getTaskInfo(variable: Variable): TaskInfo {
    const taskId = this.extractTaskId(variable)

    return {
      id: taskId,
      status: 'Created',
      isCompleted: variable.value?.includes('Completed') || false,
      isCanceled: variable.value?.includes('Canceled') || false,
      isFaulted: variable.value?.includes('Faulted') || false,
      childTasks: []
    }
  }

  /**
   * Get awaiter state from Task
   */
  static getAwaiterState(taskInfo: TaskInfo): AwaiterState {
    if (taskInfo.isFaulted) return AwaiterState.Faulted
    if (taskInfo.isCanceled) return AwaiterState.Cancelled
    if (taskInfo.isCompleted) return AwaiterState.Completed
    return AwaiterState.Pending
  }

  /**
   * Format task info for display
   */
  static formatTaskInfo(taskInfo: TaskInfo): string {
    return `Task #{taskInfo.id} - ${taskInfo.status}${
      taskInfo.exception ? ` (${taskInfo.exception.type})` : ''
    }`
  }

  /**
   * Extract task ID from variable
   */
  private static extractTaskId(variable: Variable): number {
    const match = variable.value?.match(/Task\s*#(\d+)/i)
    return match ? parseInt(match[1], 10) : 0
  }
}

/**
 * Helpers for understanding async flow
 */
export class AsyncFlowAnalyzer {
  /**
   * Determine if we're waiting for I/O
   */
  static isWaitingForIO(state: AsyncMethodState): boolean {
    const ioTypes = ['Task', 'HttpClient', 'NetworkStream', 'FileStream']
    return ioTypes.some((type) => state.awaiterType?.includes(type))
  }

  /**
   * Determine if we're in a blocking wait
   */
  static isBlockingWait(state: AsyncMethodState): boolean {
    return state.awaiterState === AwaiterState.Pending && !this.isWaitingForIO(state)
  }

  /**
   * Get advice for async state
   */
  static getAdvice(state: AsyncMethodState): string[] {
    const advice: string[] = []

    if (this.isWaitingForIO(state)) {
      advice.push('Waiting for I/O operation to complete')
    }

    if (state.pendingContinuations.length > 0) {
      advice.push(`${state.pendingContinuations.length} continuations waiting to run`)
    }

    if (state.isFaulted) {
      advice.push(`Exception: ${state.exception?.message}`)
    }

    if (state.isCancelled) {
      advice.push('Operation was cancelled')
    }

    return advice
  }
}
