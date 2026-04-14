/**
 * App health module - check if running, monitor ports
 */

export { getHealth, watchHealth } from './health'
export { findVsdbgPath, findDebugAdapter } from './vsdbg'
export type { DebugAdapterInfo } from './vsdbg'
