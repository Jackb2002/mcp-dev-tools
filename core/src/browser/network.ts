/**
 * Browser network request capture via CDP
 */

import { withCDP } from './cdp'

export type RequestStatus = 'pending' | 'completed' | 'failed'

export interface NetworkRequest {
  requestId: string
  url: string
  method: string
  status?: number
  statusText?: string
  requestHeaders: Record<string, string>
  responseHeaders?: Record<string, string>
  requestBody?: string
  mimeType?: string
  encodedDataLength?: number
  timing?: {
    requestStartMs: number
    responseStartMs?: number
    responseEndMs?: number
    durationMs?: number
  }
  state: RequestStatus
  errorText?: string
  initiator?: string
  timestamp: number
}

/**
 * Capture network requests made during a window of time.
 * Connects, waits for the given duration, then returns collected requests.
 */
export async function captureNetworkRequests(
  port: number,
  options: { windowMs?: number; filterUrl?: string; limit?: number } = {}
): Promise<NetworkRequest[]> {
  const { windowMs = 2000, filterUrl, limit = 50 } = options

  return withCDP(port, async (client) => {
    const requestMap = new Map<string, NetworkRequest>()

    client.Network.on('requestWillBeSent', (params: any) => {
      const req = params.request
      requestMap.set(params.requestId, {
        requestId: params.requestId,
        url: req.url,
        method: req.method,
        requestHeaders: req.headers ?? {},
        requestBody: req.postData,
        state: 'pending',
        initiator: params.initiator?.type,
        timestamp: params.timestamp * 1000
      })
    })

    client.Network.on('responseReceived', (params: any) => {
      const entry = requestMap.get(params.requestId)
      if (!entry) return
      const resp = params.response
      entry.status = resp.status
      entry.statusText = resp.statusText
      entry.responseHeaders = resp.headers ?? {}
      entry.mimeType = resp.mimeType
      entry.timing = {
        requestStartMs: entry.timestamp,
        responseStartMs: params.timestamp * 1000
      }
    })

    client.Network.on('loadingFinished', (params: any) => {
      const entry = requestMap.get(params.requestId)
      if (!entry) return
      entry.state = 'completed'
      entry.encodedDataLength = params.encodedDataLength
      if (entry.timing) {
        entry.timing.responseEndMs = params.timestamp * 1000
        entry.timing.durationMs = entry.timing.responseEndMs - entry.timestamp
      }
    })

    client.Network.on('loadingFailed', (params: any) => {
      const entry = requestMap.get(params.requestId)
      if (!entry) return
      entry.state = 'failed'
      entry.errorText = params.errorText
    })

    await new Promise<void>(resolve => setTimeout(resolve, windowMs))

    let results = Array.from(requestMap.values())

    if (filterUrl) {
      results = results.filter(r => r.url.includes(filterUrl))
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => b.timestamp - a.timestamp)

    return results.slice(0, limit)
  })
}

/**
 * Get the most recent network requests without waiting — reads what CDP has buffered.
 */
export async function getRecentNetworkRequests(
  port: number,
  options: { filterUrl?: string; limit?: number } = {}
): Promise<NetworkRequest[]> {
  return captureNetworkRequests(port, { windowMs: 200, ...options })
}

/**
 * Find the network request most likely to correspond to the current ASP.NET
 * request being debugged. Matches by the app's base URL and recency.
 */
export async function findCorrelatedRequest(
  port: number,
  appBaseUrl: string,
  windowMs = 5000
): Promise<NetworkRequest | null> {
  const requests = await captureNetworkRequests(port, { windowMs, filterUrl: appBaseUrl, limit: 20 })

  // Prefer XHR/fetch over page navigations, then most recent
  const apiRequests = requests.filter(r =>
    r.initiator === 'fetch' || r.initiator === 'xmlhttprequest' || r.method !== 'GET'
  )

  return (apiRequests[0] ?? requests[0]) ?? null
}
