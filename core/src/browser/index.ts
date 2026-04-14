/**
 * Browser module - CDP-based inspection of Chromium browsers
 * Requires the browser to be launched with --remote-debugging-port=<port>
 */

export { getConsoleEntries, evaluateInPage } from './console'
export type { ConsoleEntry, ConsoleLevel } from './console'

export { captureNetworkRequests, getRecentNetworkRequests, findCorrelatedRequest } from './network'
export type { NetworkRequest, RequestStatus } from './network'

export { getPageState, captureScreenshot, getStorageSnapshot, navigateTo } from './dom'
export type { PageState, StorageSnapshot } from './dom'
