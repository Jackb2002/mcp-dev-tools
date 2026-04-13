/**
 * .NET-specific Debugging Extensions
 * Rich features for debugging .NET applications
 */

// Roslyn - Type inspection
export {
  RoslynAnalyzer,
  MethodInspector,
  type RoslynTypeInfo,
  type RoslynMember,
  type RoslynMethod,
  type RoslynParameter,
  type RoslynAttribute
} from './roslyn'

// Async - Async/await debugging
export {
  AsyncStateAnalyzer,
  TaskInspector,
  AsyncFlowAnalyzer,
  AwaiterState,
  type AsyncMethodState,
  type Continuation,
  type TaskInfo
} from './async'

// LINQ - Query evaluation
export {
  LINQEvaluator,
  LINQQueryEvaluator,
  LINQStage,
  type LINQEnumerableInfo
} from './linq'

// Memory - Heap inspection
export {
  MemoryInspector,
  GCAnalyzer,
  MemoryTracker,
  type ObjectReference,
  type GCGenerationStats,
  type HeapSnapshot,
  type MemoryGrowth
} from './memory'

// Hot Reload - Live editing
export {
  HotReloadManager,
  EditAndContinueValidator,
  type HotReloadCapability,
  type HotReloadChange,
  type HotReloadSession
} from './hot-reload'

// Performance - Profiling
export {
  PerformanceProfiler,
  PerformanceAnalyzer,
  type CallGraph,
  type ExecutionSample,
  type MethodStats
} from './performance'
