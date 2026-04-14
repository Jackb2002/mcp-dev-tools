/**
 * Dev Tools Core Library
 * Shared development tools - logs, git, disk, build, app health, database
 */

// Configuration
export { ConfigManager, getConfigManager } from './config'
export type { DevToolsConfig, DebuggerConfig } from './types'

// Utilities
export * from './utils'

// Types
export type {
  Unsubscribe,
  WatcherCallback,
  GitStatus,
  GitDiff,
  CommitInfo,
  TestResults,
  FileInfo,
  CleanupSuggestion,
  BuildInfo,
  HealthStatus,
  Health,
  Migration,
  Table,
  Column,
  Breakpoint,
  StackFrame,
  Variable,
  EvaluationResult,
  Watch,
  TypeInfo,
  AsyncInfo,
  MemoryStats,
  ObjectInspection,
  MethodTiming,
  ProfileData,
  CodeEdit
} from './types'

// Logs
export { getBuildLog, watchDebugLog, getTestResults } from './logs'

// Git
export { getStatus, getDiff, getRecentCommits } from './git'

// Disk
export { getUsage, getLargeFiles, getCleanupSuggestions } from './disk'

// Build
export { trackBuild, getRecentBuilds } from './build'

// App
export { getHealth, watchHealth, findVsdbgPath, findDebugAdapter } from './app'
export type { DebugAdapterInfo } from './app'

// Database
export { getMigrationStatus, getSchemaSnapshot, updateSchemaSnapshot } from './db'

// Debugger
export {
  IDebugAdapter,
  BaseDebugAdapter,
  DAPDebugger,
  BreakpointManager,
  StackManager,
  WatchManager,
  Evaluator,
  LazyEvaluator
} from './debugger'
export type { ThreadInfo, FrameContext, WatchOptions, EvaluationContext } from './debugger'

// .NET debugger extensions
export {
  RoslynAnalyzer,
  MethodInspector,
  AsyncStateAnalyzer,
  TaskInspector,
  AsyncFlowAnalyzer,
  AwaiterState,
  LINQEvaluator,
  LINQQueryEvaluator,
  LINQStage,
  MemoryInspector,
  GCAnalyzer,
  MemoryTracker,
  HotReloadManager,
  EditAndContinueValidator,
  PerformanceProfiler,
  PerformanceAnalyzer
} from './debugger'
export type {
  RoslynTypeInfo,
  RoslynMember,
  RoslynMethod,
  RoslynParameter,
  RoslynAttribute,
  AsyncMethodState,
  Continuation,
  TaskInfo,
  LINQEnumerableInfo,
  ObjectReference,
  GCGenerationStats,
  HeapSnapshot,
  MemoryGrowth,
  HotReloadCapability,
  HotReloadChange,
  HotReloadSession,
  CallGraph,
  ExecutionSample,
  MethodStats
} from './debugger'
