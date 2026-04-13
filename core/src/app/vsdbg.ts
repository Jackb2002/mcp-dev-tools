/**
 * vsdbg discovery — finds the .NET debug adapter installed by the C# VSCode extension
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as child_process from 'child_process'

// Returns the path to the vsdbg-ui binary, or null if not found.
// Search order:
//  1. ~/.vscode/extensions/ms-dotnettools.csharp-X.Y.Z/.debugger/<arch>/vsdbg-ui
//  2. /usr/local/share/dotnet/vsdbg/vsdbg-ui  (manual installs)
//  3. PATH lookup via `which vsdbg-ui`
export function findVsdbgPath(): string | null {
  // Resolve arch subfolder used by the C# extension
  const arch = resolveVsdbgArch()

  // 1. VSCode C# extension — the most common location on all platforms
  const extensionsDir = path.join(os.homedir(), '.vscode', 'extensions')
  if (fs.existsSync(extensionsDir)) {
    const entries = fs.readdirSync(extensionsDir)
    for (const entry of entries) {
      if (!entry.startsWith('ms-dotnettools.csharp-')) continue
      const candidate = path.join(extensionsDir, entry, '.debugger', arch, 'vsdbg-ui')
      if (fs.existsSync(candidate)) return candidate
    }
  }

  // 2. Manual / dotnet-script install
  const manualPath = path.join('/usr/local/share/dotnet/vsdbg', 'vsdbg-ui')
  if (fs.existsSync(manualPath)) return manualPath

  // 3. PATH fallback
  try {
    const result = child_process.execSync('which vsdbg-ui', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (result && fs.existsSync(result)) return result
  } catch {
    // not on PATH — that's fine
  }

  return null
}

/**
 * Maps Node's process.arch to the subfolder name used by the C# extension.
 */
function resolveVsdbgArch(): string {
  switch (process.arch) {
    case 'arm64': return 'arm64'
    case 'x64':   return 'x86_64'
    case 'ia32':  return 'x86'
    default:      return process.arch
  }
}
