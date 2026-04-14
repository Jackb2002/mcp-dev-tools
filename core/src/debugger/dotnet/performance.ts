/**
 * .NET-specific Debugging - Performance Profiling
 * Tracks method timing, call stacks, and performance metrics
 */

import { StackFrame, ProfileData, MethodTiming } from '../../types'

/**
 * Enhanced profiling data with call graph
 */
export interface CallGraph {
  totalTime: number
  callCount: number
  children: Map<string, CallGraph>
  parent?: string
  selfTime: number
}

/**
 * Execution sample for profiling
 */
export interface ExecutionSample {
  timestamp: number
  threadId: number
  callStack: StackFrame[]
  duration: number // milliseconds since last sample
}

/**
 * Method performance statistics
 */
export interface MethodStats {
  name: string
  totalTime: number
  callCount: number
  averageTime: number
  minTime: number
  maxTime: number
  allocations: number
  exceptions: number
}

/**
 * Collects performance data during debugging
 */
export class PerformanceProfiler {
  private samples: ExecutionSample[] = []
  private methodStats: Map<string, MethodStats> = new Map()
  private callGraphs: Map<string, CallGraph> = new Map()
  private isRecording = false
  private startTime = 0

  /**
   * Start performance profiling
   */
  startProfiling(): void {
    this.isRecording = true
    this.startTime = Date.now()
    this.samples = []
    this.methodStats.clear()
    this.callGraphs.clear()
  }

  /**
   * Record an execution sample
   */
  recordSample(threadId: number, callStack: StackFrame[], duration: number): void {
    if (!this.isRecording) return

    const sample: ExecutionSample = {
      timestamp: Date.now(),
      threadId,
      callStack,
      duration
    }

    this.samples.push(sample)
    this.updateStats(callStack, duration)
    this.updateCallGraph(callStack, duration)
  }

  /**
   * Stop profiling and get results
   */
  stopProfiling(): ProfileData {
    this.isRecording = false

    const elapsedTime = Date.now() - this.startTime

    // Calculate totals
    let totalTime = 0
    let totalAllocations = 0
    let totalExceptions = 0

    for (const stats of this.methodStats.values()) {
      totalTime += stats.totalTime
      totalAllocations += stats.allocations
      totalExceptions += stats.exceptions
    }

    const methodTimings = this.convertToMethodTimings(Array.from(this.methodStats.values()))

    return {
      elapsedTime,
      totalTime,
      sampleCount: this.samples.length,
      methodCount: this.methodStats.size,
      totalAllocations,
      totalExceptions,
      methodTimings,
      topMethods: this.getTopMethods(5),
      callChains: this.getHotPaths(5)
    }
  }

  /**
   * Get methods by execution time
   */
  private getTopMethods(count: number): MethodTiming[] {
    return this.convertToMethodTimings(
      Array.from(this.methodStats.values())
        .sort((a, b) => b.totalTime - a.totalTime)
        .slice(0, count)
    )
  }

  /**
   * Convert MethodStats to MethodTiming
   */
  private convertToMethodTimings(stats: MethodStats[]): MethodTiming[] {
    return stats.map((s) => ({
      name: s.name,
      totalTime: s.totalTime,
      callCount: s.callCount,
      averageTime: s.averageTime
    }))
  }

  /**
   * Get hottest call chains
   */
  private getHotPaths(count: number): string[] {
    const paths: Map<string, number> = new Map()

    for (const sample of this.samples) {
      const path = sample.callStack.map((f) => f.name).join(' -> ')
      paths.set(path, (paths.get(path) || 0) + sample.duration)
    }

    return Array.from(paths.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([path]) => path)
  }

  /**
   * Update method statistics from sample
   */
  private updateStats(callStack: StackFrame[], duration: number): void {
    for (const frame of callStack) {
      const stats = this.methodStats.get(frame.name) || {
        name: frame.name,
        totalTime: 0,
        callCount: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        allocations: 0,
        exceptions: 0
      }

      stats.totalTime += duration
      stats.callCount++
      stats.averageTime = stats.totalTime / stats.callCount
      stats.minTime = Math.min(stats.minTime, duration)
      stats.maxTime = Math.max(stats.maxTime, duration)

      this.methodStats.set(frame.name, stats)
    }
  }

  /**
   * Update call graph from sample
   */
  private updateCallGraph(callStack: StackFrame[], duration: number): void {
    if (callStack.length === 0) return

    const root = callStack[0].name

    let graph = this.callGraphs.get(root)
    if (!graph) {
      graph = {
        totalTime: 0,
        callCount: 0,
        children: new Map(),
        selfTime: 0
      }
      this.callGraphs.set(root, graph)
    }

    graph.totalTime += duration
    graph.callCount++

    // Traverse call stack and build graph
    let current = graph
    for (let i = 1; i < callStack.length; i++) {
      const name = callStack[i].name

      if (!current.children.has(name)) {
        current.children.set(name, {
          totalTime: 0,
          callCount: 0,
          children: new Map(),
          parent: callStack[i - 1].name,
          selfTime: 0
        })
      }

      const child = current.children.get(name)!
      child.totalTime += duration
      child.callCount++
      current = child
    }

    // Self time is time in leaf node
    current.selfTime += duration
  }

  /**
   * Get profiling results
   */
  getResults(): ProfileData {
    if (this.isRecording) {
      return this.stopProfiling()
    }

    return {
      elapsedTime: 0,
      totalTime: 0,
      sampleCount: this.samples.length,
      methodCount: this.methodStats.size,
      totalAllocations: 0,
      totalExceptions: 0,
      methodTimings: [],
      topMethods: [],
      callChains: []
    }
  }
}

/**
 * Analyzes performance data for bottlenecks and recommendations
 */
export class PerformanceAnalyzer {
  /**
   * Identify performance bottlenecks
   */
  static findBottlenecks(profileData: ProfileData): string[] {
    const bottlenecks: string[] = []

    // Time spent in top methods
    if (profileData.topMethods.length > 0) {
      const topMethod = profileData.topMethods[0]
      const percentage = (topMethod.totalTime / profileData.totalTime) * 100

      if (percentage > 50) {
        bottlenecks.push(
          `${topMethod.name} consumes ${percentage.toFixed(1)}% of execution time`
        )
      }
    }

    // High call frequency
    const highCallMethods = profileData.methodTimings.filter((m) => m.callCount > 10000)
    if (highCallMethods.length > 0) {
      bottlenecks.push(
        `${highCallMethods.length} methods called >10,000 times - consider caching`
      )
    }

    // Memory allocations
    if (profileData.totalAllocations > 1000000) {
      bottlenecks.push('High allocation rate - consider object pooling or allocation optimization')
    }

    // Exceptions
    if (profileData.totalExceptions > 0) {
      bottlenecks.push(
        `${profileData.totalExceptions} exceptions thrown - check error handling patterns`
      )
    }

    return bottlenecks
  }

  /**
   * Get optimization recommendations
   */
  static getRecommendations(profileData: ProfileData): string[] {
    const recommendations: string[] = []

    // Method-specific optimization
    for (const method of profileData.topMethods) {
      if (method.callCount > 1000) {
        recommendations.push(`Cache results of ${method.name} - called ${method.callCount} times`)
      }

      if (method.averageTime > 10) {
        recommendations.push(`${method.name} is slow (avg: ${method.averageTime.toFixed(1)}ms) - consider optimization`)
      }
    }

    // Allocation optimization
    const allocRate = profileData.totalAllocations / profileData.elapsedTime
    if (allocRate > 1000) {
      recommendations.push('High allocation rate - profile heap allocations with memory profiler')
    }

    return recommendations
  }
}
