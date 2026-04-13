/**
 * .NET debug adapter discovery
 * Prefers netcoredbg (MIT, no license restrictions) over vsdbg (MS-only).
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as child_process from 'child_process'

export interface DebugAdapterInfo {
  path: string
  kind: 'netcoredbg' | 'vsdbg'
}

// Returns the best available .NET DAP debug adapter, or null if none found.
// Search order:
//  1. netcoredbg in ~/bin/netcoredbg/netcoredbg  (user install)
//  2. netcoredbg in /usr/local/bin/netcoredbg/netcoredbg  (system install)
//  3. netcoredbg on PATH
//  4. vsdbg from VSCode C# extension  (license-restricted fallback)
export function findDebugAdapter(): DebugAdapterInfo | null {
  // --- netcoredbg (preferred — MIT licensed, no client restrictions) ---

  const netcoredbgCandidates = [
    path.join(os.homedir(), 'bin', 'netcoredbg', 'netcoredbg'),
    path.join('/usr/local/bin/netcoredbg', 'netcoredbg')
  ]
  for (const candidate of netcoredbgCandidates) {
    if (fs.existsSync(candidate)) return { path: candidate, kind: 'netcoredbg' }
  }
  try {
    const result = child_process.execSync('which netcoredbg', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (result && fs.existsSync(result)) return { path: result, kind: 'netcoredbg' }
  } catch { /* not on PATH */ }

  // --- vsdbg (fallback — requires MS VS Code client handshake) ---
  const vsdbgPath = findVsdbgPath()
  if (vsdbgPath) return { path: vsdbgPath, kind: 'vsdbg' }

  return null
}

// Legacy export kept for backwards compatibility
export function findVsdbgPath(): string | null {
  const arch = resolveVsdbgArch()

  const extensionsDir = path.join(os.homedir(), '.vscode', 'extensions')
  if (fs.existsSync(extensionsDir)) {
    const entries = fs.readdirSync(extensionsDir)
    for (const entry of entries) {
      if (!entry.startsWith('ms-dotnettools.csharp-')) continue
      const candidate = path.join(extensionsDir, entry, '.debugger', arch, 'vsdbg')
      if (fs.existsSync(candidate)) return candidate
    }
  }

  const manualPath = path.join('/usr/local/share/dotnet/vsdbg', 'vsdbg')
  if (fs.existsSync(manualPath)) return manualPath

  try {
    const result = child_process.execSync('which vsdbg', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (result && fs.existsSync(result)) return result
  } catch { /* not on PATH */ }

  return null
}

function resolveVsdbgArch(): string {
  switch (process.arch) {
    case 'arm64': return 'arm64'
    case 'x64':   return 'x86_64'
    case 'ia32':  return 'x86'
    default:      return process.arch
  }
}
