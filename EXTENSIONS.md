# Development Tools Extensions

This project provides two IDE extensions for real-time development insights: **VS Code** and **Visual Studio 2022**.

---

## VS Code Extension (`vscode-extension/`)

A modern, web-based extension for VS Code with sidebar views and command palette integration.

### Features

- **Git Status View** — Current branch, ahead/behind commits, untracked files
- **App Health View** — Running status, PID, memory usage, port bindings
- **Recent Builds View** — Last 20 builds with duration and success status
- **Commands** for quick access:
  - `devTools.showGitPanel` — Git Status panel
  - `devTools.showHealthPanel` — App Health panel
  - `devTools.showBuildPanel` — Recent Builds panel
  - `devTools.showDiskPanel` — Disk Usage panel
  - `devTools.showDatabasePanel` — Database Info panel

### Installation

```bash
cd vscode-extension
npm install
npm run build
vsce package
```

Then drag the `.vsix` file into VS Code, or:
```bash
code --install-extension dev-tools-vscode-0.1.0.vsix
```

### Architecture

- **src/extension.ts** — Main entry point, registers commands and tree views
- **Tree providers** — Git, Health, Build panels that auto-refresh
- **Watchers** — Listens to file changes and re-triggers refreshes

### Auto-refresh

- Git status updates when `.git/HEAD` or `.git/index` change
- App health polls every 5 seconds
- Disk/build info updates every 30 seconds

---

## Visual Studio Extension (`vs-extension/`)

A native Visual Studio 2022 extension with tool windows and command integrations.

### Features

- **Tool Windows** for:
  - Git Status
  - App Health  
  - Recent Builds
  - Disk Usage
  - Database Migrations
  - Debugger (breakpoints, stack, watches, async state, LINQ eval)
  
- **Commands** in VS menus:
  - Dev Tools → Show Git Status
  - Dev Tools → Show App Health
  - etc.

### Installation (Development)

```bash
cd vs-extension
npm install
npm run build
```

Then open Visual Studio and load the extension from the repo directory.

### Installation (Distribution)

Build the VSIX package:
```bash
npm run package
```

Then in Visual Studio:
- **Extensions** → **Manage Extensions** → **Search for "Development Tools"** → Install

Or drag the `.vsix` file into VS.

### Architecture

- **src/extension.ts** — Node.js bridge that coordinates with VS UI layer
- **source.extension.vsixmanifest** — VS manifest declaring tool windows and commands
- **VS UI Layer** (C# XAML) — Implemented as separate VS project files (future)

### Tool Windows

Each tool window is a native VS control that:
- Calls the bridge module to fetch data
- Refreshes on file change events
- Displays data in a grid, tree, or text format

---

## Shared Core Library

Both extensions use `@dev-tools/core` for:
- Git status, diffs, commits
- Build log parsing and tracking
- Disk usage analysis
- App health monitoring
- Database migration status
- Debugger integration (breakpoints, watches, evaluation)

---

## Development

### Build Both

```bash
npm run build          # Builds core, mcp-server, vscode-extension, vs-extension
```

### Test VS Code

```bash
cd vscode-extension
npm run dev            # Watch mode
# In VS Code: Press F5 to launch Extension Development Host
```

### Test Visual Studio

```bash
cd vs-extension
npm run build
# Open VS → Extensions → Manage Extensions → search "dev-tools"
```

---

## Configuration

Both extensions read from `dev-tools.config.json` in the workspace root:

```json
{
  "projectName": "MyProject",
  "workingDir": "/Users/me/projects/MyProject",
  "language": "dotnet",
  "appPort": 5210,
  "debugger": {
    "enabled": true,
    "debugPort": 5555
  }
}
```

---

## Roadmap

- [ ] **Phase 5A** (Current): Scaffold both extensions
- [ ] **Phase 5B**: Implement VS Code panels (TypeScript/webviews)
- [ ] **Phase 5C**: Implement VS tool windows (C# XAML components)
- [ ] **Phase 5D**: Wire debugger panels (breakpoints, stack, watches)
- [ ] **Phase 6**: Test with real .NET project
- [ ] **Phase 7**: Publish to marketplace (VS Code Extensions, VS Gallery)

---

## References

- **VS Code Extension API**: https://code.visualstudio.com/api
- **Visual Studio 2022 Extensibility**: https://learn.microsoft.com/en-us/visualstudio/extensibility/
- **VSIX Manifest**: https://learn.microsoft.com/en-us/visualstudio/extensibility/extension-schema-reference

