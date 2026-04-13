# Phase 2: MCP Server Integration

## What's Implemented

### Resources Exposed

The MCP server exposes the following resources that Claude can read:

**Logs:**
- `commsreporter://logs/build-latest` - Last 100 lines of build log
- `commsreporter://logs/test-results` - Last test run results

**Git:**
- `commsreporter://git/status` - Current branch, ahead/behind, untracked files
- `commsreporter://git/diff` - Files changed since base branch
- `commsreporter://git/recent-commits` - Last 10 commits

**Disk:**
- `commsreporter://disk/usage` - Directory sizes in project
- `commsreporter://disk/large-files` - Files >100MB
- `commsreporter://disk/cleanup` - Cleanup suggestions (bin, obj, node_modules, etc)

**Build:**
- `commsreporter://build/recent` - Last 20 builds with duration and status

**App:**
- `commsreporter://app/health` - Running status, PID, memory, ports

**Database:**
- `commsreporter://db/migrations` - EF Core migration status (applied/pending)
- `commsreporter://db/schema` - Cached schema snapshot

### Server Features

- **Stdio Transport**: Connects via stdin/stdout for Claude integration
- **Error Handling**: Graceful error responses if resource fetch fails
- **Resource Metadata**: Each resource has name, description, MIME type
- **Core Library Integration**: All resources powered by core library modules

## Testing the Server

### Setup

1. Create a `dev-tools.config.json` in your project:

```json
{
  "projectName": "TestProject",
  "workingDir": "/path/to/your/project",
  "language": "dotnet",
  "appPort": 5210,
  "buildCommand": "dotnet build",
  "testCommand": "dotnet test",
  "logDir": "logs",
  "debugLogFile": "/tmp/app.log",
  "gitBaseBranch": "main"
}
```

2. Build the server:

```bash
npm run build
```

3. Start the server:

```bash
npm start -w mcp-server
```

You should see output like:
```
[MCP Server] Starting...
[MCP Server] Project: TestProject
[MCP Server] Language: dotnet
[MCP Server] Initialized 12 resources
[MCP Server] Connected and ready
[MCP Server] Serving 12 resources
```

### Test with Claude

Once the server is running and properly configured in VSCode/Claude settings, Claude can access resources like:

```
Claude: What's the current git status?
→ Reads commsreporter://git/status

Claude: Show me the recent commits
→ Reads commsreporter://git/recent-commits

Claude: What's the app health?
→ Reads commsreporter://app/health

Claude: How much disk is being used?
→ Reads commsreporter://disk/usage
```

## Implementation Details

### Server Architecture

```typescript
// MCP Server receives resource list request
ListResourcesRequest
  ↓
Server returns all 12 resources with URIs and metadata
  ↓
Claude selects which resources to read
  ↓
ReadResourceRequest(uri)
  ↓
Server fetches data from core library
  ↓
Returns ResourceContents with text/json data
```

### Error Handling

If a resource fetch fails (e.g., git not available), the server returns:
```json
{
  "contents": [{
    "uri": "commsreporter://git/status",
    "mimeType": "text/plain",
    "text": "Error fetching resource: command not found: git"
  }]
}
```

Claude can then inform the user rather than failing silently.

## Next Steps (Phase 3)

- Implement debugger module (DAP + .NET)
- Add debugger resources:
  - `commsreporter://debugger/breakpoints`
  - `commsreporter://debugger/stack`
  - `commsreporter://debugger/variables`
  - `.NET-specific: type-info, async-state, memory, linq, profiling`
- Add debugger tools (interactive actions):
  - `setBreakpoint(file, line)`
  - `stepOver() / stepInto() / stepOut()`
  - `addWatch(expression)`
  - `.NET-specific: applyHotReload(), evaluateLINQ()`

## Configuration

All resources are configurable via `dev-tools.config.json`:

- **gitBaseBranch** - Used for git diff comparisons (default: "main")
- **appPort** - Port to check for app health (default: 5210)
- **workingDir** - Root directory for disk usage/cleanup analysis
- **logDir** - Directory containing build logs
- **language** - Affects which resources are available (e.g., db migrations only for .NET)
- **debugLogFile** - Path to app debug output log

## Troubleshooting

### Server won't start

Check that `dev-tools.config.json` exists and is valid JSON.

### Resources return errors

- Ensure paths in config are correct
- Check that git/dotnet commands are available
- Verify file permissions

### Claude can't read resources

- Verify MCP server is running on stdio
- Check VSCode settings for proper MCP server configuration
- Restart Claude/VSCode after changing config

## Files Changed in Phase 2

- `mcp-server/package.json` - Updated MCP SDK dependency
- `mcp-server/src/index.ts` - Implemented full MCP server with all resources
- `PHASE2.md` - This file

## Commits

```
Phase 2: Implement MCP server resources and tools

- Update MCP SDK to @modelcontextprotocol/sdk
- Implement Server with ListResources and ReadResource handlers
- Wire all core library modules to MCP resources:
  * logs (build, test, debug)
  * git (status, diff, commits)
  * disk (usage, large files, cleanup)
  * build (recent builds)
  * app (health)
  * db (migrations, schema)
- Add error handling for resource fetch failures
- Total: 12 resources exposed to Claude
```
