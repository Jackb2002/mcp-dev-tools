/**
 * .NET-specific Debugging - Memory and Heap Inspection
 * Analyzes memory usage, GC stats, and object references
 */

import { Variable, MemoryStats } from '../../types'

/**
 * Object reference information
 */
export interface ObjectReference {
  address: string
  type: string
  size: number
  isRootObject: boolean
  retainedSize: number
  referenceCount: number
  referencedBy: string[]
  references: string[]
}

/**
 * Generation information for GC stats
 */
export interface GCGenerationStats {
  generation: number
  collectionCount: number
  totalMemory: number
  liveObjectCount: number
  deadObjectCount: number
  promotedSize: number
}

/**
 * Detailed heap snapshot
 */
export interface HeapSnapshot {
  timestamp: number
  totalHeapSize: number
  usedHeapSize: number
  gen0Size: number
  gen1Size: number
  gen2Size: number
  largeObjectHeapSize: number
  totalObjectCount: number
  generations: GCGenerationStats[]
  topObjectsBySize: ObjectReference[]
  pinned: ObjectReference[]
}

/**
 * Inspects memory and heap information
 */
export class MemoryInspector {
  /**
   * Analyze variable for memory impact
   */
  static analyzeObjectSize(variable: Variable): ObjectReference {
    const size = this.estimateSize(variable)

    return {
      address: this.extractAddress(variable),
      type: variable.type || 'Unknown',
      size,
      isRootObject: true,
      retainedSize: size,
      referenceCount: 0,
      referencedBy: [],
      references: []
    }
  }

  /**
   * Get memory statistics for a debugged process
   */
  static getMemoryStats(): MemoryStats {
    // In a real implementation, this would query the debuggee's
    // runtime memory statistics via the debug adapter

    return {
      totalHeap: 0,
      usedHeap: 0,
      gen0: 0,
      gen1: 0,
      gen2: 0,
      loh: 0,
      totalObjects: 0,
      workingSet: 0,
      peakWorkingSet: 0
    }
  }

  /**
   * Estimate object size in bytes
   */
  private static estimateSize(variable: Variable): number {
    // Rough estimates based on type
    if (!variable.type) return 16 // Default object header

    if (variable.type.includes('int') || variable.type.includes('Int32')) return 4
    if (variable.type.includes('long') || variable.type.includes('Int64')) return 8
    if (variable.type.includes('double')) return 8
    if (variable.type.includes('bool')) return 1
    if (variable.type.includes('string')) {
      // String overhead + character count
      return 26 + (variable.value?.length || 0) * 2
    }
    if (variable.type.includes('[]')) {
      // Array: header + element size * count
      return 24 + (variable.value?.length || 0) * 8
    }
    if (variable.type.includes('List')) {
      // List: header + capacity
      return 24 + 16 + (variable.value?.length || 0) * 8
    }
    if (variable.type.includes('Dictionary')) {
      // Dictionary: header + buckets
      return 48 + (variable.value?.length || 0) * 16
    }

    // Default object size
    return 48
  }

  /**
   * Extract memory address from variable
   */
  private static extractAddress(variable: Variable): string {
    const match = variable.value?.match(/0x[0-9a-f]+/i)
    return match ? match[0] : '0x0'
  }
}

/**
 * Analyzes GC behavior and pressure
 */
export class GCAnalyzer {
  /**
   * Evaluate GC collection statistics
   */
  static analyzeCollectionStats(stats: GCGenerationStats[]): string[] {
    const analysis: string[] = []

    if (stats.length === 0) return analysis

    const gen2 = stats.find((s) => s.generation === 2)
    if (gen2 && gen2.collectionCount > 10) {
      analysis.push('High GC Gen 2 collection count - may indicate memory leak')
    }

    const totalAllocated = stats.reduce((sum, s) => sum + s.totalMemory, 0)
    const totalLive = stats.reduce((sum, s) => sum + s.liveObjectCount * 50, 0) // rough estimate

    const efficiency = totalLive / totalAllocated
    if (efficiency < 0.3) {
      analysis.push('Low heap efficiency - significant fragmentation or dead objects')
    }

    return analysis
  }

  /**
   * Suggest GC tuning recommendations
   */
  static recommendTuning(heapSnapshot: HeapSnapshot): string[] {
    const recommendations: string[] = []

    // Check for excessive Gen 2
    const totalGen = heapSnapshot.gen0Size + heapSnapshot.gen1Size + heapSnapshot.gen2Size
    const gen2Ratio = heapSnapshot.gen2Size / totalGen

    if (gen2Ratio > 0.7) {
      recommendations.push('Consider reducing allocation rate to reduce Gen 2 promotions')
    }

    // Check for LOH pressure
    if (heapSnapshot.largeObjectHeapSize > heapSnapshot.totalHeapSize * 0.2) {
      recommendations.push('Significant Large Object Heap usage - consider object pooling')
    }

    // Check for pinning
    if (heapSnapshot.pinned.length > 100) {
      recommendations.push('High number of pinned objects - may fragment heap')
    }

    return recommendations
  }

  /**
   * Find potential memory leaks
   */
  static findLeaks(objects: ObjectReference[]): ObjectReference[] {
    // Simple heuristic: objects with high retained size but no external references
    return objects
      .filter((obj) => {
        const retention = obj.retainedSize / (obj.size || 1)
        const popularity = obj.referencedBy.length

        // Likely leak: large retained size, low reference count
        return retention > 2 && popularity < 2 && obj.size > 1024
      })
      .sort((a, b) => b.retainedSize - a.retainedSize)
  }
}

/**
 * Tracks memory snapshots over time
 */
export class MemoryTracker {
  private snapshots: HeapSnapshot[] = []

  takeSnapshot(snapshot: HeapSnapshot): void {
    this.snapshots.push(snapshot)
  }

  getSnapshots(): HeapSnapshot[] {
    return this.snapshots
  }

  getGrowth(startIndex: number, endIndex: number): MemoryGrowth {
    const start = this.snapshots[startIndex]
    const end = this.snapshots[endIndex]

    if (!start || !end) {
      return { heapGrowth: 0, objectGrowth: 0, timeDelta: 0 }
    }

    return {
      heapGrowth: end.usedHeapSize - start.usedHeapSize,
      objectGrowth: end.totalObjectCount - start.totalObjectCount,
      timeDelta: end.timestamp - start.timestamp
    }
  }

  clear(): void {
    this.snapshots = []
  }
}

export interface MemoryGrowth {
  heapGrowth: number
  objectGrowth: number
  timeDelta: number
}
