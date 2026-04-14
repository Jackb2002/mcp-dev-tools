/**
 * CDP connection manager
 * Connects to a Chromium-based browser via chrome-remote-interface.
 * The browser must be launched with --remote-debugging-port=<port>.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CDP = require('chrome-remote-interface')

export type CDPClient = any

/**
 * Create a short-lived CDP client, run fn, then close.
 * Enables the Network, Console, Runtime, and Page domains before calling fn.
 */
export async function withCDP<T>(port: number, fn: (client: CDPClient) => Promise<T>): Promise<T> {
  const client: CDPClient = await CDP({ port })
  try {
    await Promise.all([
      client.Network.enable({ maxTotalBufferSize: 10 * 1024 * 1024, maxResourceBufferSize: 5 * 1024 * 1024 }),
      client.Console.enable(),
      client.Runtime.enable(),
      client.Page.enable()
    ])
    return await fn(client)
  } finally {
    await client.close().catch(() => {})
  }
}
