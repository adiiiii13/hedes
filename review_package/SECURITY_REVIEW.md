# HEDES Security Review & Regression Assessment

**Evaluation Date:** October 1, 2026  
**Auditor:** Anti-Gravity Autonomous Quality & Security Suite  
**Classification:** Compliant with Electron Security Best Practices & P0 Directives

---

## 1. Architectural Security Controls

### 1.1 Renderer Isolation & Sandboxing
- Context isolation is strictly enabled (`contextIsolation: true`) in Electron webPreferences.
- `nodeIntegration: false` is enforced across all windows and web views.
- Only safe, vetted APIs are exposed to the renderer through `contextBridge.exposeInMainWorld('hedesDesktop', ...)`.
- Direct access to `child_process`, `fs`, and native Node bindings is forbidden in renderer contexts.

### 1.2 IPC Validation & Sender Verification
- All IPC invoke handlers validate sender webContents:
  ```ts
  function validateTrustedIpcSender(event: Electron.IpcMainInvokeEvent): BrowserWindow {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('Untrusted IPC caller');
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('IPC forbidden from subframe');
    return window;
  }
  ```
- Subframes and external iframes cannot invoke privileged desktop capabilities.

### 1.3 Local HTTP Session Token & Loopback Authentication
- Every local API request requires an ephemeral crypto-random session token stored in memory.
- Loopback enforcement: requests from non-loopback IPs (`127.0.0.1`, `::1`) are immediately rejected with HTTP 403.
- Cross-origin rejection: `Sec-Fetch-Site` header checks prevent browser-based drive-by attacks from reading local project files.

### 1.4 Filesystem Traversal & Symlink Containment
- `validateProjectId` restricts project identifiers to strict alphanumeric regex `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$` and rejects `.` or `..`.
- `resolveProjectFilePath` enforces that resolved paths remain strictly within `PROJECTS_BASE/<projectId>` using relative path checks (`!relative || relative.startsWith('..') || path.isAbsolute(relative)`).
- Traversal sequences (`../`, `..\`) are stripped and rejected.

### 1.5 Recursive Self-Preview Defense
- Mandatory regression: loading HEDES inside its own workspace preview frame is blocked both on the client (`isSelfPreview(targetUrl)`) and on the server runner by stripping matched URLs that point to HEDES's own port (`process.env.PORT || 5174` or `5173`).

### 1.6 Secret Redaction & Prompt Injection Mitigation
- Backup archives and diagnostic logs automatically exclude `.env*`, `.hedes-vault.enc`, and private keys.
- Context engine injects project files wrapped in `<hedesAction type="file" untrustedTaskData="true">` and `<hedesArtifact title="Current Project Files (Untrusted Task Data)" untrustedTaskData="true">`, instructing model adapters that file contents represent passive task data rather than executable instructions.

---

## 2. Regression Test Evidence

All security policies are continuously enforced by automated tests:
- `tests/security-session-auth.test.mjs` (8 tests)
- `tests/project-dir.test.mjs` (1 test)
- `tests/prompt-context.test.mjs` (1 test)
- `tests/plan3-task-quality-fixtures.test.mjs` (Fixture 5: Prompt injection defense)
- `tests/plan3-failure-scenarios.test.mjs` (Unicode & Path safety)
