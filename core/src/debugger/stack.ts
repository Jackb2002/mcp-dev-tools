/**
 * Stack Frame and Thread Management
 * Handles stack traces, frames, and thread state
 */

import { StackFrame, Variable } from '../types'

export interface ThreadInfo {
  id: number
  name: string
  state: 'running' | 'stopped' | 'waiting'
}

export interface FrameContext {
  threadId: number
  frameId: number
  frame: StackFrame
  variables?: Variable[]
}

/**
 * Manages stack frames, threads, and debugging context
 */
export class StackManager {
  private threads: Map<number, ThreadInfo> = new Map()
  private frames: Map<number, StackFrame> = new Map() // frameId -> StackFrame
  private framesByThread: Map<number, number[]> = new Map() // threadId -> [frameIds]
  private currentThread: number | null = null
  private currentFrame: number | null = null

  addThread(id: number, name: string, state: 'running' | 'stopped' | 'waiting' = 'running'): void {
    this.threads.set(id, { id, name, state })
    this.framesByThread.set(id, [])
  }

  removeThread(id: number): void {
    this.threads.delete(id)
    const frameIds = this.framesByThread.get(id) || []
    frameIds.forEach((fid) => this.frames.delete(fid))
    this.framesByThread.delete(id)

    if (this.currentThread === id) {
      this.currentThread = null
    }
  }

  setThreadState(id: number, state: 'running' | 'stopped' | 'waiting'): void {
    const thread = this.threads.get(id)
    if (thread) {
      thread.state = state
    }
  }

  getThread(id: number): ThreadInfo | undefined {
    return this.threads.get(id)
  }

  getThreads(): ThreadInfo[] {
    return Array.from(this.threads.values())
  }

  addFrame(threadId: number, frame: StackFrame): void {
    this.frames.set(frame.id, frame)

    let frameIds = this.framesByThread.get(threadId)
    if (!frameIds) {
      frameIds = []
      this.framesByThread.set(threadId, frameIds)
    }
    frameIds.push(frame.id)
  }

  getFrame(id: number): StackFrame | undefined {
    return this.frames.get(id)
  }

  getFrames(threadId: number): StackFrame[] {
    const frameIds = this.framesByThread.get(threadId) || []
    return frameIds
      .map((id) => this.frames.get(id))
      .filter((f) => f !== undefined) as StackFrame[]
  }

  clearFrames(threadId: number): void {
    const frameIds = this.framesByThread.get(threadId) || []
    frameIds.forEach((fid) => this.frames.delete(fid))
    this.framesByThread.set(threadId, [])

    if (this.currentThread === threadId) {
      this.currentFrame = null
    }
  }

  setCurrentContext(threadId: number, frameId: number): void {
    if (this.threads.has(threadId) && this.frames.has(frameId)) {
      this.currentThread = threadId
      this.currentFrame = frameId
    }
  }

  getCurrentContext(): FrameContext | null {
    if (this.currentThread === null || this.currentFrame === null) {
      return null
    }

    const thread = this.threads.get(this.currentThread)
    const frame = this.frames.get(this.currentFrame)

    if (!thread || !frame) {
      return null
    }

    return {
      threadId: this.currentThread,
      frameId: this.currentFrame,
      frame
    }
  }

  getCurrentThreadId(): number | null {
    return this.currentThread
  }

  getCurrentFrameId(): number | null {
    return this.currentFrame
  }

  clear(): void {
    this.threads.clear()
    this.frames.clear()
    this.framesByThread.clear()
    this.currentThread = null
    this.currentFrame = null
  }
}
