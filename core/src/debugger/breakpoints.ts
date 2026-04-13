/**
 * Breakpoint Management
 * Handles storage, lookup, and filtering of breakpoints
 */

import { Breakpoint } from '../types'

export interface BreakpointQuery {
  file?: string
  line?: number
  verified?: boolean
}

/**
 * Manages breakpoint storage with querying and filtering
 */
export class BreakpointManager {
  private breakpoints: Map<string, Breakpoint> = new Map()
  private fileIndex: Map<string, Set<string>> = new Map() // file -> set of breakpoint ids

  add(breakpoint: Breakpoint): void {
    this.breakpoints.set(breakpoint.id, breakpoint)

    // Update file index
    if (!this.fileIndex.has(breakpoint.file)) {
      this.fileIndex.set(breakpoint.file, new Set())
    }
    this.fileIndex.get(breakpoint.file)!.add(breakpoint.id)
  }

  remove(id: string): boolean {
    const bp = this.breakpoints.get(id)
    if (!bp) return false

    this.breakpoints.delete(id)

    // Update file index
    const fileIds = this.fileIndex.get(bp.file)
    if (fileIds) {
      fileIds.delete(id)
      if (fileIds.size === 0) {
        this.fileIndex.delete(bp.file)
      }
    }

    return true
  }

  get(id: string): Breakpoint | undefined {
    return this.breakpoints.get(id)
  }

  getAll(): Breakpoint[] {
    return Array.from(this.breakpoints.values())
  }

  getByFile(file: string): Breakpoint[] {
    const ids = this.fileIndex.get(file)
    if (!ids) return []
    return Array.from(ids)
      .map((id) => this.breakpoints.get(id))
      .filter((bp) => bp !== undefined) as Breakpoint[]
  }

  query(q: BreakpointQuery): Breakpoint[] {
    let results = this.getAll()

    if (q.file) {
      results = results.filter((bp) => bp.file === q.file)
    }

    if (q.line !== undefined) {
      results = results.filter((bp) => bp.line === q.line)
    }

    if (q.verified !== undefined) {
      results = results.filter((bp) => bp.verified === q.verified)
    }

    return results
  }

  clear(): void {
    this.breakpoints.clear()
    this.fileIndex.clear()
  }

  size(): number {
    return this.breakpoints.size
  }
}
