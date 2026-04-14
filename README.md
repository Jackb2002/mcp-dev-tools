# mcp-dev-tools

An MCP server and pair of IDE extensions that give Claude real-time visibility into your development environment — git status, build logs, app health, disk usage, database migrations, and a full .NET debugger integration.

## What's included

**MCP Server** — exposes 17 resources and 10 tools over stdio for use with Claude Code or any MCP-compatible client.

**VS Code Extension** — sidebar views for git, app health, and recent builds with auto-refresh.

**Visual Studio 2022 Extension** — tool windows for git, health, builds, disk, database, and debugger panels.

## Resources

| URI | Description | Cache TTL |
|-----|-------------|-----------|
| `dev-tools://git/status` | Branch, ahead/behind, untracked files | 30s |
| `dev-tools://git/diff` | Staged and unstaged changes | 30s |
| `dev-tools://git/recent-commits` | Last 20 commits | 30s |
| `dev-tools://app/health` | Running status, PID, memory, ports | 10s |
| `dev-tools://logs/build-latest` | Most recent build output | 10s |
| `dev-tools://logs/test-results` | Last test run output | 2 min |
| `dev-tools://build/recent` | Recent build history with durations | 30s |
| `dev-tools://disk/usage` | Directory sizes | 5 min |
| `dev-tools://disk/large-files` | Files over 100MB | 5 min |
| `dev-tools://disk/cleanup` | Cleanup suggestions | 5 min |
| `dev-tools://db/migrations` | Applied and pending EF Core migrations | 60s |
| `dev-tools://db/schema` | Database schema snapshot | 5 min |
| `dev-tools://debugger/status` | Debugger connection status | none |
| `dev-tools://debugger/breakpoints` | Active breakpoints | none |
| `dev-tools://debugger/stack` | Current call stack | none |
| `dev-tools://debugger/variables` | Variables in current frame | none |
| `dev-tools://debugger/watches` | Watch expressions | none |

## Tools

| Tool | Description |
|------|-------------|
| `debugger_attach` | Attach to a running .NET process |
| `debugger_set_breakpoint` | Set a breakpoint at file:line |
| `debugger_list_breakpoints` | List all active breakpoints |
| `debugger_clear_breakpoint` | Remove a breakpoint |
| `debugger_get_threads` | List active threads |
| `debugger_get_stack` | Get call stack for a thread |
| `debugger_get_variables` | Inspect variables in a stack frame |
| `debugger_evaluate` | Evaluate an expression in context |
| `debugger_get_loaded_sources` | List loaded source files |
| `debugger_reconnect` | Reconnect to the debug adapter |

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure

Copy the example config and edit it for your project:

```bash
cp mcp-server/dev-tools.config.example.json mcp-server/dev-tools.config.json
```

```json
{
  "projectName": "MyProject",
  "workingDir": "/path/to/your/project",
  "language": "dotnet",
  "appPort": 5000,
  "buildCommand": "dotnet build MyProject.slnx",
  "testCommand": "dotnet test",
  "logDir": "/path/to/your/project/logs",
  "debugLogFile": "/path/to/your/project/logs/debug.log",
  "gitBaseBranch": "main",
  "debugger": {
    "enabled": true,
    "debugPort": 5555,
    "debugAdapter": "netcore"
  }
}
```

### 3. Build

```bash
npm run build
```

### 4. Add to Claude Code

```bash
claude mcp add dev-tools node /path/to/mcp-dev-tools/mcp-server/dist/index.js
```

Restart Claude Code. The server will appear in your MCP panel with all resources and tools available.

## Project structure

```
mcp-dev-tools/
├── core/                   # Shared library
│   └── src/
│       ├── app/            # Health monitoring
│       ├── build/          # Build tracking
│       ├── db/             # Migration and schema status
│       ├── debugger/       # DAP client + .NET extensions
│       ├── disk/           # Disk usage analysis
│       ├── git/            # Git status, diff, commits
│       └── logs/           # Build and debug log parsing
├── mcp-server/             # MCP server (stdio transport)
├── vscode-extension/       # VS Code extension
└── vs-extension/           # Visual Studio 2022 extension
```

## Architecture

Resources are cached in memory with per-resource TTLs. File watchers on `.git/HEAD`, `.git/index`, and the debug log file invalidate the relevant cache entries immediately on change. On fetch failure, the server retries twice then falls back to the last known-good cached value with an error annotation.

The debugger module connects over DAP (Debug Adapter Protocol). For .NET it uses `netcoredbg` when available, falling back to `vsdbg`. Additional .NET-specific tooling covers async state inspection, LINQ evaluation, heap statistics, hot reload, and Roslyn-based code edits.

## Language support

The core resources (git, health, builds, disk, logs) work with any project. The following features are .NET-specific:

- EF Core migration status
- DAP attach via `netcoredbg`/`vsdbg`
- Async state and task inspection
- LINQ expression evaluation
- GC heap and generation statistics
- Hot reload via `dotnet watch`

## Requirements

- Node.js 18+
- .NET SDK (for .NET-specific features)
- `dotnet ef` CLI (for migration status)
- `netcoredbg` or `vsdbg` (for debugger attach)
