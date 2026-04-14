/**
 * Shared TypeScript interfaces for dev-tools
 */

// Configuration
export interface DevToolsConfig {
  projectName: string
  workingDir: string
  language: 'dotnet' | 'python' | 'node' | 'go' | 'rust' | string
  appPort?: number
  appPort2?: number
  buildCommand?: string
  testCommand?: string
  logDir?: string
  debugLogFile?: string
  gitBaseBranch?: string
  debugger?: DebuggerConfig
}

export interface DebuggerConfig {
  enabled: boolean
  debugPort: number
  debugAdapter: 'netcore' | 'python' | 'node' | string
  enableHotReload?: boolean
  captureMemoryStats?: boolean
  captureProfilingData?: boolean
  sourceMapPath?: string
}

// Watchers
export type Unsubscribe = () => void
export interface WatcherCallback<T> {
  (data: T): void
}

// Git
export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  untracked: string[]
}

export interface GitDiff {
  added: string[]
  modified: string[]
  deleted: string[]
}

export interface CommitInfo {
  hash: string
  author: string
  message: string
  date: Date
}

// Logs
export interface TestResults {
  passed: number
  failed: number
  output: string
}

// Disk
export interface FileInfo {
  path: string
  size: string
  sizeBytes: number
}

export interface CleanupSuggestion {
  dir: string
  size: string
  action: string
}

// Build
export interface BuildInfo {
  timestamp: Date
  success: boolean
  duration: number // milliseconds
}

// App Health
export type HealthStatus = 'running' | 'stopped' | 'unknown'

export interface Health {
  running: boolean
  pid?: number
  uptime?: string
  memory?: string
  ports?: number[]
  _error?: string
}

// Database
export interface Migration {
  name: string
  applied: boolean
  appliedAt?: Date
}

export interface Table {
  name: string
  columns: Column[]
}

export interface Column {
  name: string
  type: string
  nullable: boolean
}

// Debugger
export interface Breakpoint {
  id: string
  file: string
  line: number
  verified: boolean
}

export interface StackFrame {
  id: number
  name: string
  file: string
  line: number
  column?: number
}

export interface Variable {
  name: string
  value: string
  type?: string
  variablesReference?: number
}

export interface EvaluationResult {
  value: string
  type?: string
  variablesReference?: number
}

export interface Watch {
  id: string
  expr: string
  value?: string
  type?: string
}

// .NET-specific
export interface TypeInfo {
  name: string
  baseType?: string
  genericArguments?: string[]
  members?: TypeMember[]
}

export interface TypeMember {
  name: string
  type: string
  isStatic: boolean
}

export interface AsyncInfo {
  taskState: string
  continuations?: string[]
}

export interface MemoryStats {
  totalHeapSize?: string
  totalHeap: number
  usedHeap: number
  objectCount?: number
  gen0: number
  gen1: number
  gen2: number
  loh: number
  totalObjects: number
  workingSet: number
  peakWorkingSet: number
  gcCollections?: { gen0: number; gen1: number; gen2: number }
}

export interface ObjectInspection {
  type: string
  address: string
  size: string
  fields: { [key: string]: string }
}

export interface MethodTiming {
  name: string
  totalTime: number
  callCount: number
  averageTime: number
}

export interface ProfileData {
  timestamp?: Date
  methodTimings: MethodTiming[]
  totalTime: number
  elapsedTime: number
  sampleCount: number
  methodCount: number
  totalAllocations: number
  totalExceptions: number
  topMethods: MethodTiming[]
  callChains: string[]
}

export interface CodeEdit {
  file: string
  startLine?: number
  endLine?: number
  newContent: string
  oldContent?: string
}
