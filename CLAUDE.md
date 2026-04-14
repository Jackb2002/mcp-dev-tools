# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Build all workspaces (core → mcp-server → vscode-extension → vs-extension)
npm run build

# Watch mode during development
npm run dev -w core          # Rebuild core on changes
npm run dev -w mcp-server    # Rebuild MCP server on changes

# Run the MCP server
npm start -w mcp-server

# Run tests (core only)
npm run test -w core

# Run a single test file
npx jest --testPathPattern=<pattern> -w core

# Lint
npm run lint

# Clean build artifacts
make clean
```

## Architecture

This is an **npm workspaces monorepo** with four packages:

### `core/` — Shared Library (`@dev-tools/core`)
The foundation. All data-fetching logic lives here. Modules:
- `git/` — `getStatus()`, `getDiff()`, `getRecentCommits()` via `simple-git`
- `logs/` — `getBuildLog()`, `watchDebugLog()`, `getTestResults()`
- `disk/` — `getUsage()`, `getLargeFiles()`, `getCleanupSuggestions()`
- `build/` — `trackBuild()`, `getRecentBuilds()` — persists to `~/.dev-tools/builds.json`
- `app/` — `getHealth()`, `watchHealth()`, `findDebugAdapter()` — checks if app is running on configured port
- `db/` — `getMigrationStatus()`, `getSchemaSnapshot()` — EF Core specific
- `debugger/` — `DAPDebugger`, `BreakpointManager`, `StackManager`, `WatchManager`, `Evaluator`

All public API is re-exported from `core/src/index.ts`.

### `mcp-server/` — MCP Server (`@dev-tools/mcp-server`)
Wraps `@dev-tools/core` and exposes it over the MCP protocol (stdio transport) using `@modelcontextprotocol/sdk`. Entry point: `mcp-server/src/index.ts`.

Key design patterns:
- Resources are cached in-memory with per-resource TTLs; stale-cache fallback on fetch failure (up to 2 retries, then returns `[STALE CACHE - FETCH FAILED]` + last known good value)
- File watchers on `.git/HEAD`, `.git/index`, and the debug log file immediately invalidate relevant cache entries
- **Debug Bridge**: Debugger tools do NOT connect to DAP directly. Instead they make HTTP calls to `localhost:7891`, which is served by the VS Code extension. This sidesteps macOS arm64 issues with `netcoredbg` and vsdbg licensing.

Resources use URIs under `commsreporter://` (e.g. `commsreporter://git/status`). The public-facing README lists them under `dev-tools://` — these are the same resources; only the scheme differs in the current implementation.

### `vscode-extension/` — VS Code Extension
Registers sidebar tree views (Git, Health, Builds) and runs the **Debug Bridge** HTTP server on port 7891. When a debug session is active in VS Code (`F5`), the bridge proxies DAP requests from the MCP server to `vscode.debug.activeDebugSession`. Tracks the currently stopped thread/frame via `vscode.debug.onDidReceiveDebugSessionCustomEvent`.

### `vs-extension/` — Visual Studio 2022 Extension
Placeholder/scaffold for a future native Visual Studio extension. Not yet functional.

## Configuration

The MCP server and extensions read `dev-tools.config.json` from the directory they are launched from (falls back to example defaults). Copy the example and edit for your project:

```bash
cp mcp-server/dev-tools.config.example.json mcp-server/dev-tools.config.json
```

Key fields: `workingDir`, `language` (`dotnet` enables EF Core + DAP .NET features), `appPort`, `buildCommand`, `testCommand`, `logDir`, `gitBaseBranch`, `debugger.enabled`.

## Adding a New Core Module

1. Create `core/src/<module>/index.ts` with public exports
2. Add types to `core/src/types.ts`
3. Export from `core/src/index.ts`
4. Register a resource in `mcp-server/src/index.ts` → `initializeResources()`

## Debugger Architecture

The debugger has two layers:
1. **DAP Foundation** (`core/src/debugger/`) — `DAPDebugger` implements the Debug Adapter Protocol for any language. `BreakpointManager`, `StackManager`, `WatchManager` manage state client-side.
2. **Bridge path (active)** — In practice, MCP tools call `bridgeCall()` → VS Code extension's HTTP server → `vscode.debug.activeDebugSession.customRequest()`. This is the working path; the direct DAP path in `DAPDebugger` is a fallback / future option.

.NET-specific rich features (Roslyn, async, LINQ, memory, hot reload, profiling) are defined in `core/src/debugger/dotnet/` but are not yet fully wired to the MCP server.
