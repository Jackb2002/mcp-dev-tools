/**
 * Browser page state and DOM inspection via CDP
 */

import { withCDP } from './cdp'

export interface PageState {
  url: string
  title: string
  readyState: string
  viewport: { width: number; height: number }
  screenshotBase64?: string
}

export interface StorageSnapshot {
  localStorage: Record<string, string>
  sessionStorage: Record<string, string>
  cookies: Array<{ name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean }>
}

/**
 * Get the current page URL, title, and ready state.
 */
export async function getPageState(port: number, includeScreenshot = false): Promise<PageState> {
  return withCDP(port, async (client) => {
    const [urlResult, titleResult, readyResult, viewportResult] = await Promise.all([
      client.Runtime.evaluate({ expression: 'window.location.href', returnByValue: true }),
      client.Runtime.evaluate({ expression: 'document.title', returnByValue: true }),
      client.Runtime.evaluate({ expression: 'document.readyState', returnByValue: true }),
      client.Runtime.evaluate({
        expression: 'JSON.stringify({ width: window.innerWidth, height: window.innerHeight })',
        returnByValue: true
      })
    ])

    const state: PageState = {
      url: String(urlResult.result.value ?? ''),
      title: String(titleResult.result.value ?? ''),
      readyState: String(readyResult.result.value ?? 'unknown'),
      viewport: safeParseJSON(viewportResult.result.value, { width: 0, height: 0 })
    }

    if (includeScreenshot) {
      const shot = await client.Page.captureScreenshot({ format: 'png', quality: 80 })
      state.screenshotBase64 = shot.data
    }

    return state
  })
}

/**
 * Capture a screenshot of the current page as a base64-encoded PNG.
 */
export async function captureScreenshot(port: number): Promise<string> {
  return withCDP(port, async (client) => {
    const result = await client.Page.captureScreenshot({ format: 'png' })
    return result.data
  })
}

/**
 * Snapshot localStorage, sessionStorage, and cookies for the current origin.
 */
export async function getStorageSnapshot(port: number): Promise<StorageSnapshot> {
  return withCDP(port, async (client) => {
    const [lsResult, ssResult] = await Promise.all([
      client.Runtime.evaluate({
        expression: 'JSON.stringify(Object.fromEntries(Object.entries(localStorage)))',
        returnByValue: true
      }),
      client.Runtime.evaluate({
        expression: 'JSON.stringify(Object.fromEntries(Object.entries(sessionStorage)))',
        returnByValue: true
      })
    ])

    const cookiesResult = await client.Network.getCookies({})

    return {
      localStorage: safeParseJSON(lsResult.result.value, {}),
      sessionStorage: safeParseJSON(ssResult.result.value, {}),
      cookies: (cookiesResult.cookies ?? []).map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly
      }))
    }
  })
}

/**
 * Navigate the browser to a URL.
 */
export async function navigateTo(port: number, url: string): Promise<{ navigated: boolean; finalUrl: string }> {
  return withCDP(port, async (client) => {
    const result = await client.Page.navigate({ url })
    // Wait briefly for navigation to settle
    await new Promise<void>(resolve => setTimeout(resolve, 500))
    const urlResult = await client.Runtime.evaluate({ expression: 'window.location.href', returnByValue: true })
    return {
      navigated: !result.errorText,
      finalUrl: String(urlResult.result.value ?? url)
    }
  })
}

function safeParseJSON<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
