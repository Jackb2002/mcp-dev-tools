# Project Structure

## Monorepo Layout

This is a **npm workspaces** monorepo with three main packages:

```
mcp-dev-tools/                     # Solution root
├── package.json                   # Workspace root config
├── core/                          # Core library
│   ├── package.json              # @dev-tools/core
│   ├── src/                      # Source code
│   │   ├── index.ts              # Public API
│   │   ├── config.ts             # Configuration manager
│   │   ├── types.ts              # TypeScript interfaces
│   │   ├── utils.ts              # Utility functions
│   │   ├── git/                  # Git module
│   │   ├── logs/                 # Logs module (build, debug, test)
│   │   ├── disk/                 # Disk module (usage, cleanup)
│   │   ├── build/                # Build tracking
│   │   ├── app/                  # App health monitoring
│   │   ├── db/                   # Database module (migrations, schema)
│   │   └── debugger/             # Debugger module (Phase 3)
│   └── dist/                     # Compiled JavaScript
│
├── mcp-server/                   # MCP Server
│   ├── package.json              # @dev-tools/mcp-server
│   ├── src/
│   │   ├── index.ts              # Server entry point
│   │   ├── resources.ts          # Resource definitions (TODO)
│   │   └── tools.ts              # Tool definitions (TODO)
│   └── dist/                     # Compiled JavaScript
│
├── vs-extension/                 # Visual Studio Extension (Phase 5)
│   └── package.json              # @dev-tools/vs-extension (placeholder)
│
├── .vscode/                      # VSCode workspace config
│   ├── tasks.json                # Build, test, dev tasks
│   ├── launch.json               # Debugger configurations
│   ├── settings.json             # Editor & TypeScript settings
│   └── extensions.json           # Recommended extensions
│
├── Makefile                      # Development shortcuts
├── .gitignore                    # Git ignore rules
├── README.md                     # Getting started guide
├── PLAN.md                       # Architecture & roadmap
├── STRUCTURE.md                  # This file
└── dev-tools.config.example.json # Configuration template
```

## Workspace Structure

### Core Library (`core/`)
- **Purpose**: Shared logic for all development tools
- **Language**: TypeScript
- **Exports**: `@dev-tools/core` npm package
- **Modules**:
  - `git/` - Git status, diffs, commits
  - `logs/` - Build, debug, test output
  - `disk/` - Disk usage and cleanup
  - `build/` - Build tracking and metrics
  - `app/` - App health monitoring
  - `db/` - Database migrations and schema
  - `debugger/` - Interactive debugging (Phase 3)

### MCP Server (`mcp-server/`)
- **Purpose**: Exposes core library via MCP protocol
- **Language**: TypeScript with @anthropic-ai/sdk
- **Exports**: Executable MCP server
- **Dependencies**: `@dev-tools/core`
- **Runs**: `npm start -w mcp-server`

### VS Extension (`vs-extension/`)
- **Purpose**: Visual Studio integration (future)
- **Language**: C# (VSIX)
- **Status**: Placeholder for Phase 5
- **Dependencies**: Can call core library or MCP server

## Development Workflow

### Building
```bash
# Build all workspaces
make build
# or
npm run build

# Incremental build (watch mode)
make dev-core
npm run dev -w core
```

### Running
```bash
# Start MCP server
make dev
npm start -w mcp-server

# Run tests
make test
npm run test -w core

# Lint
make lint
npm run lint
```

### Debugging
- **VSCode**: Press F5 to launch MCP Server with debugger attached
- **Tasks**: Ctrl+Shift+B to run build tasks

## Configuration

Each project that uses dev-tools needs `dev-tools.config.json`:

```json
{
  "projectName": "MyProject",
  "workingDir": "/path/to/project",
  "language": "dotnet",
  "appPort": 5210,
  "buildCommand": "dotnet build",
  "testCommand": "dotnet test",
  "logDir": "logs",
  "debugLogFile": "/tmp/app.log",
  "gitBaseBranch": "main",
  "debugger": {
    "enabled": true,
    "debugPort": 5555,
    "debugAdapter": "netcore"
  }
}
```

See `dev-tools.config.example.json` for a full example.

## File Structure Conventions

### TypeScript
- Source: `src/**/*.ts`
- Compiled: `dist/**/*.js`
- Tests: `src/**/*.test.ts`
- Config: `tsconfig.json`

### Modules
- Entry point: `src/module/index.ts`
- Implementation: `src/module/specific.ts`
- Tests: `src/module/*.test.ts`

### Exports
- All public API exported from `src/index.ts`
- Internal modules use relative imports
- Package exports via `package.json` `main` field

## Adding New Features

### New Module in Core
1. Create `core/src/newmodule/` directory
2. Add `index.ts` with public exports
3. Add implementation files (e.g., `specific.ts`)
4. Add types to `core/src/types.ts`
5. Export from `core/src/index.ts`
6. Add MCP resource in `mcp-server/src/index.ts`

### New Package
1. Create directory at root
2. Add `package.json` with name `@dev-tools/name`
3. Add to root `package.json` workspaces array
4. Add `tsconfig.json` and `src/` directory
5. Update root build scripts if needed

## Dependencies

### Core Library
- `simple-git` - Git operations
- Dev: TypeScript, Jest, ESLint

### MCP Server
- `@anthropic-ai/sdk` - MCP protocol
- `@dev-tools/core` - Local workspace
- Dev: TypeScript

### VS Extension
- None yet (placeholder)

## Known Limitations

- Disk operations use sync APIs (acceptable for tooling)
- Git operations via CLI (not programmatic)
- No real-time log streaming yet (Phase 3+)
- Debugger module not yet implemented (Phase 3)

## Next Steps

- [ ] Phase 2: Wire core to MCP server, test resources
- [ ] Phase 3: Implement debugger module (DAP + .NET)
- [ ] Phase 4: Add caching, watchers, error handling
- [ ] Phase 5: Build VS Extension UI
