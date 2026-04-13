# Dev Tools MCP

A comprehensive development tools platform that provides real-time insights into your project via an MCP server.

**Features:**
- 📋 Build logs, test results, debug output
- 🌿 Git status, diffs, recent commits
- 💾 Disk usage analysis, large files, cleanup suggestions
- 🏥 App health monitoring (uptime, memory, ports)
- 🗄️ Database info (migrations, schema snapshots)
- 📊 Performance metrics (build times, query counts)
- 🐛 **Interactive debugging** - Set breakpoints, step code, inspect variables (.NET + multi-language DAP support)

## Project Structure

```
mcp-dev-tools/
├── core/              # Shared library (logs, git, disk, build, app, db, debugger)
├── mcp-server/        # MCP server (exposes core via resources & tools)
├── vs-extension/      # Visual Studio extension (future)
└── README.md
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

This installs workspaces for `core`, `mcp-server`, and `vs-extension`.

### 2. Create Configuration

Create a `dev-tools.config.json` in your project root:

```json
{
  "projectName": "MyProject",
  "workingDir": "/path/to/project",
  "language": "dotnet",
  "appPort": 5210,
  "appPort2": 7090,
  "buildCommand": "dotnet build",
  "testCommand": "dotnet test",
  "logDir": "logs",
  "debugLogFile": "/tmp/app.log",
  "gitBaseBranch": "main",
  "debugger": {
    "enabled": true,
    "debugPort": 5555,
    "debugAdapter": "netcore",
    "enableHotReload": true,
    "captureMemoryStats": true,
    "captureProfilingData": true
  }
}
```

### 3. Build

```bash
npm run build
```

Compiles TypeScript in all workspaces.

### 4. Run MCP Server

```bash
npm run dev -w mcp-server
```

The server listens on stdio and exposes resources like:
- `commsreporter://logs/build-latest`
- `commsreporter://git/status`
- `commsreporter://disk/usage`
- `commsreporter://app/health`
- `commsreporter://db/migrations`
- `commsreporter://debugger/breakpoints` (Phase 3)
- And more...

## Core Library API

### Logs
```typescript
await getBuildLog(lines?: number)
watchDebugLog(callback: (line: string) => void)
await getTestResults()
```

### Git
```typescript
await getStatus()
await getDiff(baseBranch?: string)
await getRecentCommits(count?: number)
```

### Disk
```typescript
await getUsage(path?: string)
await getLargeFiles(dir?: string, minSizeMB?: number)
await getCleanupSuggestions(dir?: string)
```

### Build
```typescript
trackBuild(success: boolean, duration: number)
await getRecentBuilds(count?: number)
```

### App
```typescript
await getHealth(appPort?: number)
watchHealth(callback: (status: HealthStatus) => void)
```

### Database
```typescript
await getMigrationStatus()
await getSchemaSnapshot()
```

### Debugger (Phase 3 - Coming Soon)
```typescript
// General (DAP-based, multi-language)
setBreakpoint(file, line)
stepOver() / stepInto() / stepOut()
getStackTrace()
getVariables(frameId)
evaluate(expression)
addWatch(expression)

// .NET-specific (rich features)
getTypeInfo(varName)
getAsyncState(frameId)
evaluateLINQ(query)
getHeapStats()
applyEdits(changes)
```

## Development Phases

- **Phase 1** ✅ Core Library (logs, git, disk, build, app, db)
- **Phase 2** ⏳ MCP Server (wire up resources)
- **Phase 3** ⏳ Debugger Integration (DAP + .NET-rich features)
- **Phase 4** ⏳ Polish (caching, watchers, error handling)
- **Phase 5** ⏳ VS Extension (later)

## Testing

```bash
npm run test -w core
```

## Architecture

### Layered Debugger Design
- **Tier 1 (DAP)**: Multi-language support via Debug Adapter Protocol
- **Tier 2 (Language Extensions)**: Optional enhancements (only if applicable)
- **Tier 3 (.NET Specific)**: Rich debugging - Roslyn integration, async debugging, LINQ eval, memory inspection, hot reload, profiling

## References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-python)
- [VSCode MCP](https://code.visualstudio.com/docs/extension/ml-extensions)
