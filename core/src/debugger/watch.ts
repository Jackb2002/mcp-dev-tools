/**
 * Watch Expression Management
 * Handles storage and evaluation of watched expressions
 */

import { Watch } from '../types'

export interface WatchOptions {
  autoEvaluate?: boolean
  updateInterval?: number
}

/**
 * Manages watch expressions with evaluation results
 */
export class WatchManager {
  private watches: Map<string, Watch> = new Map()
  private watchCount = 0

  constructor(_options: WatchOptions = {}) {
    // Options available for future use (caching, update intervals, etc)
  }

  add(expression: string): Watch {
    const id = `watch-${++this.watchCount}`
    const watch: Watch = {
      id,
      expr: expression,
      value: '<pending>'
    }

    this.watches.set(id, watch)
    return watch
  }

  remove(id: string): boolean {
    return this.watches.delete(id)
  }

  get(id: string): Watch | undefined {
    return this.watches.get(id)
  }

  getAll(): Watch[] {
    return Array.from(this.watches.values())
  }

  update(id: string, value: string, type?: string): boolean {
    const watch = this.watches.get(id)
    if (!watch) return false

    watch.value = value
    if (type) {
      watch.type = type
    }

    return true
  }

  updateAll(evaluator: (expr: string) => Promise<string>): Promise<void> {
    const promises = Array.from(this.watches.values()).map(async (watch) => {
      try {
        const value = await evaluator(watch.expr)
        watch.value = value
      } catch (e) {
        watch.value = `<error: ${(e as Error).message}>`
        watch.type = 'error'
      }
    })

    return Promise.all(promises).then(() => {})
  }

  clear(): void {
    this.watches.clear()
    this.watchCount = 0
  }

  size(): number {
    return this.watches.size
  }
}
