# Hedes Studio Companion Extension for VS Code

This companion extension links your local VS Code or VSCodium editor directly to **Hedes Studio**.

## Features
- **Automatic Diagnostic Forwarding**: When you save a file in VS Code, compiler and linter diagnostics (TypeScript, Rust, Python, ESLint, etc.) are forwarded automatically to Hedes Studio's context engine.
- **Active Cursor & File Tracking**: Allows Hedes to know exactly what file and line you are currently working on.
- **Offline & Private**: Only speaks to your local machine (`http://127.0.0.1:4200/api/local/vscode`). No cloud telemetry or third-party tracking.

## Installation
1. Copy this `hedes-vscode` directory to your VS Code extensions folder:
   - Windows: `%USERPROFILE%\.vscode\extensions\hedes-companion`
   - Linux/macOS: `~/.vscode/extensions/hedes-companion`
2. Restart VS Code or reload the window (`Ctrl+Shift+P` -> `Developer: Reload Window`).
3. The status bar will show `Hedes (Connected)` when Hedes Studio is running.
