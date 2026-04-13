/**
 * Debugger Module
 * Multi-language debugging with DAP base layer and language-specific extensions
 */

// Protocol
export { IDebugAdapter, BaseDebugAdapter } from './protocol/adapter'
export { DAPDebugger } from './protocol/dap'

// State management
export { BreakpointManager } from './breakpoints'
export { StackManager, type ThreadInfo, type FrameContext } from './stack'
export { WatchManager, type WatchOptions } from './watch'
export { Evaluator, LazyEvaluator, type EvaluationContext } from './evaluate'

// .NET-specific extensions
export * from './dotnet'

// Re-export types
export type { Breakpoint, StackFrame, Variable, EvaluationResult, Watch } from '../types'
