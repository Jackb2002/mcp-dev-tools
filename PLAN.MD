# Dev Tools MCP - Project Plan

Generic MCP server + Visual Studio extension for real-time development insights.

## Overview

A shared development tools platform that provides:
- Build logs, test results, and debug output
- Git status, diffs, and branch info
- Disk usage analysis and cleanup suggestions
- App health monitoring (uptime, memory, ports)
- Database info (migrations, schema)
- Performance metrics (build times, query counts)

**Two integrations:**
1. **MCP Server** — Node.js service; used by VSCode, Claude, and other tools
2. **Visual Studio Extension** — Reads same data or calls core library

---

## Project Structure

```
comms-reporter-dev-tools/
├── README.md
├── .gitignore
├── package.json (root workspace)
│
├── core/                           # Shared logic library
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts               # Export public API
│   │   ├── config.ts              # Configuration, paths, watchers
│   │   ├── logs/
│   │   │   ├── index.ts
│   │   │   ├── build-log.ts       # Parse dotnet build output
│   │   │   ├── debug-log.ts       # Tail app stderr/stdout
│   │   │   └── test-log.ts        # Parse test results
│   │   ├── git/
│   │   │   ├── index.ts
│   │   │   ├── status.ts          # git status --porcelain
│   │   │   ├── branch.ts          # Current branch, tracking
│   │   │   └── diff.ts            # File changes since main
│   │   ├── disk/
│   │   │   ├── index.ts
│   │   │   ├── usage.ts           # du -sh by directory
│   │   │   ├── large-files.ts     # Find >100MB files
│   │   │   └── cleanup.ts         # Suggestions (bin/obj/publish)
│   │   ├── build/
│   │   │   ├── index.ts
│   │   │   ├── tracker.ts         # Track build duration, success rate
│   │   │   └── cache.ts           # Store recent builds in JSON
│   │   ├── app/
│   │   │   ├── index.ts
│   │   │   ├── health.ts          # Check if running, port, PID
│   │   │   └── ports.ts           # Monitor localhost:5210, 7090, etc
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   ├── migrations.ts      # EF Core migration status
│   │   │   └── schema.ts          # Cache schema snapshots
│   │   ├── debugger/              # Interactive debugging (general + .NET-rich)
│   │   │   ├── index.ts
│   │   │   ├── protocol/
│   │   │   │   ├── dap.ts         # DAP (Debug Adapter Protocol) - multi-language
│   │   │   │   └── adapter.ts     # Abstract adapter interface
│   │   │   ├── breakpoints.ts     # Set/clear breakpoints
│   │   │   ├── watch.ts           # Manage watch expressions
│   │   │   ├── stack.ts           # Stack frames and evaluation
│   │   │   ├── evaluate.ts        # Expression evaluation
│   │   │   │
│   │   │   └── dotnet/            # .NET-specific richness
│   │   │       ├── index.ts
│   │   │       ├── roslyn.ts      # Type info, IL inspection
│   │   │       ├── async.ts       # Async/await state machines
│   │   │       ├── linq.ts        # LINQ query inspection & eval
│   │   │       ├── memory.ts      # Memory/heap inspection, GC stats
│   │   │       ├── hot-reload.ts  # .NET hot reload integration
│   │   │       └── performance.ts # Profiling, method timings
│   │   ├── types.ts               # Shared TypeScript interfaces
│   │   └── utils.ts               # Helpers (file I/O, parsing, etc)
│   └── dist/                      # Compiled output
│
├── mcp-server/                    # VSCode MCP integration
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts               # MCP server entry point
│   │   ├── resources.ts           # Define MCP resources
│   │   └── tools.ts               # Define MCP tools (if needed)
│   └── dist/
│
├── vs-extension/                  # Visual Studio extension (future)
│   ├── package.json
│   ├── manifest.xml
│   ├── src/
│   │   ├── extension.ts
│   │   └── panels/
│   │       ├── build-log-panel.ts
│   │       ├── git-panel.ts
│   │       └── health-panel.ts
│   └── dist/
│
└── .vscode/
    ├── launch.json
    └── tasks.json
```

---

## Core Library API

Each module exports async functions and watchers:

### `logs/`
```typescript
// Get last N lines of build log
getBuildLog(lines?: number): Promise<string>

// Stream debug output (tail -f)
watchDebugLog(callback: (line: string) => void): Unsubscribe

// Last test run result
getTestResults(): Promise<{ passed: number; failed: number; output: string }>
```

### `git/`
```typescript
// Current status
getStatus(): Promise<{ branch: string; ahead: number; behind: number; untracked: string[] }>

// Changed files since main
getDiff(baseBranch?: string): Promise<{ added: string[]; modified: string[]; deleted: string[] }>

// Recent commits
getRecentCommits(count?: number): Promise<CommitInfo[]>
```

### `disk/`
```typescript
// Usage by directory
getUsage(path?: string): Promise<{ [dir: string]: string }>

// Large files (>100MB)
getLargeFiles(): Promise<FileInfo[]>

// Cleanup suggestions
getCleanupSuggestions(): Promise<{ dir: string; size: string; action: string }[]>
```

### `build/`
```typescript
// Track build duration and success
trackBuild(success: boolean, duration: number): void
getRecentBuilds(): Promise<BuildInfo[]>

// Cache to JSON: ~/.dev-tools/builds.json
```

### `app/`
```typescript
// Check if app is running
getHealth(): Promise<{ running: boolean; pid?: number; uptime?: string; memory?: string }>

// Watch for startup/shutdown
watchHealth(callback: (status: HealthStatus) => void): Unsubscribe
```

### `db/`
```typescript
// EF Core migration status
getMigrationStatus(): Promise<{ pending: Migration[]; applied: Migration[] }>

// Schema snapshot
getSchemaSnapshot(): Promise<{ [context: string]: Table[] }>
```

### `debugger/` (General + .NET-Rich)

**General API** (DAP-based, works with any language):
```typescript
interface IDebugSession {
  // Breakpoints
  setBreakpoint(file: string, line: number): Promise<Breakpoint>
  clearBreakpoint(id: string): Promise<void>
  getBreakpoints(): Promise<Breakpoint[]>
  
  // Execution control
  stepOver(): Promise<void>
  stepInto(): Promise<void>
  stepOut(): Promise<void>
  continue(): Promise<void>
  pause(): Promise<void>
  
  // Stack & variables
  getStackTrace(threadId?: number): Promise<StackFrame[]>
  getVariables(frameId: number): Promise<Variable[]>
  
  // Evaluation
  evaluate(expr: string, frameId?: number): Promise<EvaluationResult>
  addWatch(expr: string): Promise<Watch>
  removeWatch(id: string): Promise<void>
  getWatches(): Promise<Watch[]>
}
```

**Extended .NET API** (rich debugging features):
```typescript
interface DotNetDebugSession extends IDebugSession {
  // Type inspection (Roslyn)
  getTypeInfo(varName: string): Promise<TypeInfo>  // Generics, base types, members
  
  // Async debugging
  getAsyncState(frameId: number): Promise<AsyncInfo>  // Task state, continuations
  
  // LINQ evaluation
  evaluateLINQ(query: string): Promise<object[]>  // Execute LINQ in current context
  
  // Memory & GC
  getHeapStats(): Promise<MemoryStats>  // Object counts, sizes
  inspectObject(address: string): Promise<ObjectInspection>
  
  // Hot reload
  applyEdits(changes: CodeEdit[]): Promise<void>  // Apply code changes without restart
  
  // Performance profiling
  getProfileSnapshot(): Promise<ProfileData>
  getMethodTimings(): Promise<MethodTiming[]>
}

// Helper to create appropriate session
createDebugSession(config: DevToolsConfig): Promise<IDebugSession | DotNetDebugSession>
```

---

## MCP Server

Exposes core data as **resources** (read-only data files I can access) and **tools** (for interactive actions):

### Resources (Read-Only Data)

```typescript
// Logs & Build
// commsreporter://logs/build-latest
// commsreporter://logs/debug-tail
// commsreporter://logs/test-results

// Git
// commsreporter://git/status
// commsreporter://git/diff
// commsreporter://git/recent-commits

// Disk & Performance
// commsreporter://disk/usage
// commsreporter://build/recent
// commsreporter://app/health
// commsreporter://db/migrations

// Debugger (General)
// commsreporter://debugger/breakpoints
// commsreporter://debugger/stack
// commsreporter://debugger/variables?frameId=0
// commsreporter://debugger/watches
// commsreporter://debugger/evaluate?expr=varName

// Debugger (.NET-specific)
// commsreporter://debugger/dotnet/type-info?var=myObject
// commsreporter://debugger/dotnet/async-state?frameId=0
// commsreporter://debugger/dotnet/memory-stats
// commsreporter://debugger/dotnet/method-timings
// commsreporter://debugger/dotnet/linq?query=...
```

### Tools (Interactive Actions)

```typescript
// Debugger control
// tool: setBreakpoint(file, line)
// tool: clearBreakpoint(id)
// tool: stepOver() / stepInto() / stepOut()
// tool: continue() / pause()
// tool: addWatch(expression)
// tool: evaluate(expression, frameId)

// .NET-specific actions
// tool: applyHotReload(changes)
// tool: evaluateLINQ(query)
```

Each resource:
- Returns JSON or plain text
- Cached with TTL (e.g., 10 sec for health, 1 min for disk)
- Updated on file change watchers (git, logs, debugger breakpoint changes)
- Debugger resources reflect live debug session state

---

## Visual Studio Extension (Future)

Menu items → Run core functions → Display in side panel:
- Build log tail (live stream)
- Git status widget
- Disk usage breakdown chart
- App health card
- Migration status table

Could also:
- Hook into VS build events to auto-track builds
- Show git diffs in VS editor
- Offer quick cleanup commands

---

## Development Phases

### Phase 1: Core Library (Non-Debugger)
- [ ] Scaffold TypeScript project with monorepo
- [ ] Build log/git/disk/build/app/db modules
- [ ] Unit tests for each module
- [ ] Document API

### Phase 2: MCP Server
- [ ] Install MCP SDK
- [ ] Define resources for logs, git, disk, build, app, db
- [ ] Wire up core library
- [ ] Test with VSCode and Claude

### Phase 3: Debugger Integration (General + .NET-Rich)
- [ ] Implement DAP client and abstract adapter
- [ ] Build general debugger module: breakpoints, stack, evaluate, watches
- [ ] Wire general debugger to MCP server (resources + tools)
- [ ] Implement .NET-specific extensions:
  - [ ] Roslyn integration for type inspection
  - [ ] Async/await state machine debugging
  - [ ] LINQ query evaluation
  - [ ] Memory/heap inspection
  - [ ] Hot reload support
  - [ ] Performance profiling
- [ ] Test with running .NET processes

### Phase 4: Polish & Refinement
- [ ] Add caching/TTL for all resources
- [ ] File watchers for real-time updates (logs, git, breakpoints)
- [ ] Comprehensive error handling and fallbacks
- [ ] README with examples (especially debugger use cases)
- [ ] Multi-language testing (Python, Go, etc via DAP)

### Phase 5: VS Extension (later)
- [ ] Create VS extension skeleton
- [ ] Reuse core library (or call MCP server)
- [ ] Build UI panels (including debugger control)
- [ ] Package and publish

---

## Key Design Decisions

1. **Core as library** — Reusable; can be called from MCP server, VS extension, CLI, etc.
2. **File-based storage** — Logs, cache, snapshots live in `~/.dev-tools/` (Mac/Linux) or `%AppData%\dev-tools\` (Windows)
3. **Async API** — All I/O is async; watchers are optional
4. **Zero external services** — All data is local; no API calls needed
5. **Graceful degradation** — Missing data (e.g., app not running) doesn't crash; returns null/empty
6. **Workspace-agnostic** — Works for any project; configurable via `dev-tools.config.json` in project root
7. **Layered debugger** — DAP base layer handles any language; .NET adds opt-in richness (type inspection, async debugging, LINQ eval, memory, hot reload, profiling)

---

## Debugger Architecture

The debugger module is designed as **tiered capabilities**:

### Tier 1: DAP Foundation (General, Multi-Language)
- Via Debug Adapter Protocol (VSCode standard)
- Works with any DAP-compatible language: C#, Python, Go, Rust, Node.js, etc.
- **Capabilities**: breakpoints, stack traces, variable inspection, expression evaluation, watches, step control
- **Entry point**: `debugger/protocol/dap.ts` + language-specific adapters

### Tier 2: Language Extensions (Optional Richness)
- Detect language from config; if .NET, layer on extra capabilities
- **No impact on general DAP users**; enhancements are additive
- **If not .NET**: General API still works fully

### Tier 3: .NET-Specific Rich Features
Built on .NET debugger capabilities and libraries:
- **Roslyn integration** → Type info, IL inspection, source navigation
- **Async debugging** → Inspect async state machines, task chains
- **LINQ evaluation** → Execute and inspect LINQ queries in the current context
- **Memory inspection** → Heap stats, object inspection, GC analysis
- **Hot reload** → Apply code changes without restarting
- **Performance profiling** → Method timings, per-frame execution time

### Auto-Detection & Initialization

```typescript
// dev-tools detects language from config or project structure
const debugSession = await createDebugSession(config)

// Automatically picks:
// - DotNetDebugSession if config.language === 'dotnet'
// - DAPSession(Python) if config.language === 'python'
// - etc.
```

### MCP Integration
- **General resources** (`debugger/breakpoints`, `debugger/stack`, etc.) available for all languages
- **.NET-only resources** (`debugger/dotnet/type-info`, `debugger/dotnet/memory-stats`) only available when `.NET is detected`
- **Claude adapts** — uses available resources; no error if .NET features not present

---

## Configuration

Each project root can have `dev-tools.config.json`:

```json
{
  "projectName": "CommsReporter",
  "workingDir": "/Users/jack/Documents/EmailTools",
  "language": "dotnet",
  "appPort": 5210,
  "appPort2": 7090,
  "buildCommand": "dotnet build",
  "testCommand": "dotnet test",
  "logDir": "CommsReporter/Logs",
  "debugLogFile": "/tmp/debug.log",
  "gitBaseBranch": "master",
  
  "debugger": {
    "enabled": true,
    "debugPort": 5555,
    "debugAdapter": "netcore",
    "enableHotReload": true,
    "captureMemoryStats": true,
    "captureProfilingData": true,
    "sourceMapPath": "bin/Debug/net8.0"
  }
}
```

---

## Next Steps

1. Create new repo: `comms-reporter-dev-tools`
2. Initialize root `package.json` with workspaces
3. Scaffold `core/` with TypeScript
4. Start with simplest modules: `git/status`, `logs/build`
5. Test locally before wiring to MCP

---

## References

- MCP SDK: https://github.com/anthropics/mcp
- MCP Specification: https://spec.modelcontextprotocol.io/
- VS Code MCP: https://code.visualstudio.com/docs/extension/ml-extensions
- VS Extension Guide: https://learn.microsoft.com/en-us/visualstudio/extensibility/

---

## Questions for New Session

When starting fresh:
- "I'm building a generic dev tools MCP with integrated debugging (DAP + .NET-rich features). Help me scaffold the project."
- "Start with core library Phase 1 and Phase 2 (non-debugger modules), then we'll add Phase 3 (debugger integration)"
- "Build the debugger module — DAP base layer + .NET enhancements (Roslyn, async debugging, LINQ, memory, hot reload, profiling)"
- "Wire debugger resources & tools to the MCP server so Claude can set breakpoints, inspect variables, evaluate expressions, etc."
- "Test the debugger with a real .NET process running — verify breakpoints, watches, and .NET-specific features work"
