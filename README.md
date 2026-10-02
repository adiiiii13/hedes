# HEDES Studio — Autonomous Multi-Agent AI Engineering Environment

> **Architected by Aditya Routh**  
> **Release Target:** v1.1.0 Production Ready  
> **Supported Platforms:** Windows 10/11 Desktop (x64) · Android Local Execution (Termux) · Web  
> **Verification Status:** 25 / 25 Automated Test Suites Passing (100% Green) · `tsc --noEmit` Clean  

---

## ⚡ Overview

**Hedes Studio** is a sovereign, local-first, multi-agent AI development environment. It pairs local project execution with high-concurrency swarm intelligence, offline speech synthesis/transcription, sandboxed tool protocols, and cryptographic backend authorization gates.

Whether powered entirely offline by **Ollama / Whisper.cpp** or connected to cloud providers (Groq, Anthropic, Google Gemini, OpenAI, DeepSeek, xAI), Hedes operates with zero cloud lock-in and zero mandatory paid services.

---

## 🚀 Key Systems & Architecture

### 1. 100-Bot Council & Swarm Intelligence
- **Hierarchical Discipline Synthesis:** Parallel personas analyze complex engineering tasks across architecture, security, performance, and UX without truncating recommendations.
- **Swarm Lifecycle Controls:**
  - **Cancel Swarm:** Instantly terminate ongoing agent swarms via live `AbortController`.
  - **Retry Failed Bots:** If rate limits or transient network failures affect a subset of the swarm, retry *only* the failed bots without rerunning successful ones.
  - **Session Reconnect:** Rehydrate and stream ongoing agent runs across page refreshes.
- **Unified Gateway Concurrency:** Concurrency tokens and account rate limits are shared across workspace chat, council chat, and background tasks—preventing provider `429 Too Many Requests` errors.

### 2. Voice Assistant (Hindi & English + Offline Whisper)
- **Local Voice Pipeline:** Captures raw microphone audio, converting it to 16kHz mono 16-bit PCM WAV.
- **Dual Language Support:** Native toggling between Hindi (`hi`) and English (`en`). Transcription parameters and speech synthesis voices dynamically adapt.
- **Offline Whisper Model Installer:** In-app downloader for official `ggml-tiny` and `ggml-base` whisper.cpp models with mandatory SHA-256 integrity verification.
- **Instant Barge-in Interruption:** Assistant speech synthesizer aborts immediately when microphone input begins or user speech volume is detected.

### 3. Model Context Protocol (MCP) & Native Plugins
- **SSE / HTTP Remote Transport:** Connect remote MCP servers over HTTP/HTTPS with custom authentication headers alongside standard `stdio`.
- **Active Project File Isolation:** Filesystem MCP servers are strictly confined to the directory of the active project (`PROJECTS_BASE/<projectId>`), blocking host filesystem traversal.
- **Live Health Diagnostics:** Interactive ping check in Settings measuring real-time latency (ms), tool discovery counts, and socket health.

### 4. VS Code Companion Extension & Bridge
- **Zero-Dependency Bridge:** Packaged under `extensions/hedes-vscode/`.
- **Live Diagnostics Ingestion:** Forwards compiler errors, ESLint diagnostics, and TypeScript warnings directly into Hedes Studio via loopback `/api/local/vscode`.
- **Active Document Sync:** Keeps open editor tabs and cursor positions in sync for seamless context handoffs.

### 5. Memory & Evaluated Learned Skills
- **Evidence-Based Memory:** Tracks memory provenance (user prompt, tool result, file verification) and automatically supersedes contradictory user preferences.
- **Learned Skills Review & Promotion:** When AI agents detect recurring workflows, they propose draft skills (`status: 'draft'`, `enabled: false`). Developers review and click **Promote** in Settings to activate them for production prompts.

### 6. Scheduled Task Queue & Background Daemon
- **Background Scheduler:** Runs a 30-second automated ticker in the Electron main process with automatic missed-task catchup and interrupted run recovery.
- **Subprocess-Level Cancellation:** Running tasks map to child process handles and terminate instantly upon `SIGTERM` cancellation.
- **Task Management UI:** Dedicated Settings panel to schedule, approve, execute, and monitor recurring or one-time developer scripts.

### 7. Zero-Trust Security & Safe AI Edits
- **Host Isolation:** Loopback origin validation, ephemeral server session tokens, and strict `Content-Security-Policy` restricting script execution to loopback origins.
- **Server Authority Gates:** Shell commands, destructive file operations, and MCP client actions cannot execute via client requests alone—they require cryptographic SHA-256 approval proposals.
- **ChangeSet Diff Engine:** AI code generation produces unified diffs with pre-apply snapshot checkpoints, atomic conflict detection, and instant one-click rollback.

### 8. Multi-Platform Support
- **Windows Desktop:** Native Windows 10/11 x64 desktop app with NSIS per-user installer and DPAPI hardware-grade encrypted vault.
- **Android Termux:** Electron-free Node.js backend (`android/server.mjs`) paired with a Python PTY bridge (`android/termux-pty.py`) for genuine local terminal execution on mobile hardware.
- **Web Preview:** High-performance static web experience (`website/index.html`) with cyberpunk glassmorphism and local mock execution.

---

## 🛠️ Quick Start

### Windows Desktop (Recommended)

```powershell
# 1. Install dependencies
pnpm install

# 2. Run in Electron dev mode
pnpm run electron:dev

# Or launch directly with the Windows launcher script:
.\launch-hedes-desktop.bat
```

### Android Local Terminal (Termux)

```bash
# 1. Inside Termux on Android, run setup:
bash android/setup-termux.sh

# 2. Start the local server:
node android/server.mjs

# 3. Open http://localhost:5174 in your mobile browser
```

### VS Code Companion Setup

1. Open VS Code.
2. Load the companion extension from `extensions/hedes-vscode`.
3. Diagnostics and active file context will automatically stream into Hedes Studio.

---

## 🧪 Verification & Testing

Every system component is backed by automated tests:

```powershell
# Run the complete test suite (25 suites, 100% isolated profiles)
npm test

# Full production release verification (TypeScript + Tests)
npm run verify:release
```

### Verified Test Suites:
```
✔ checkpoints.test.mjs                      ✔ stage01-diagnostics-benchmark.test.mjs
✔ core.test.mjs                             ✔ stage02-durable-runs.test.mjs
✔ custom-models.test.mjs                    ✔ stage03-gateway.test.mjs
✔ p0-production.test.mjs                    ✔ stage04-faster-bots.test.mjs
✔ p1-production-features.test.mjs           ✔ stage05-context-explorer.test.mjs
✔ persistence-backup.test.mjs               ✔ stage06-evidence-memory.test.mjs
✔ plan3-failure-scenarios.test.mjs          ✔ stage07-skills.test.mjs
✔ plan3-mcp-plugin-bridge-lifecycle.test.mjs ✔ stage08-changesets.test.mjs
✔ plan3-task-quality-fixtures.test.mjs      ✔ stage09-offline-voice.test.mjs
✔ plan3-voice-edge-cases.test.mjs           ✔ stage10-store-bridge.test.mjs
✔ real-council.test.mjs                     ✔ stage11-task-queue.test.mjs
✔ review-regressions.test.mjs               ✔ runtime-storage.test.mjs
✔ security-session-auth.test.mjs
```

---

## 📄 License & Attribution

Designed and engineered by **Aditya Routh**. Built for developers who demand high-velocity AI assistance with uncompromising host security and complete local sovereignty.
