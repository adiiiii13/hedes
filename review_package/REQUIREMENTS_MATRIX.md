# HEDES Requirements Traceability Matrix (Plan 0, Plan 2, Plan 3)

| Req ID | Subsystem | Requirement Description | Status | Implementation Module | Evidence & Test |
|---|---|---|---|---|---|
| **SEC-01** | Security | Loopback session token auth for all local API calls | **VERIFIED** | `app/utils/session-auth.server.ts` | `tests/security-session-auth.test.mjs` |
| **SEC-02** | Security | Project path traversal & boundary containment | **VERIFIED** | `app/utils/project-dir.server.ts` | `tests/project-dir.test.mjs` |
| **SEC-03** | Security | Secret exclusion from backups, prompts & exports | **VERIFIED** | `app/utils/backup.server.ts`, `diagnostic-logger.server.ts` | `tests/persistence-backup.test.mjs` |
| **SEC-04** | Security | Untrusted task data isolation in prompt context | **VERIFIED** | `app/engine/context-engine.ts` | `tests/plan3-task-quality-fixtures.test.mjs` |
| **STO-01** | Storage | Persistent project directory and storage stability | **VERIFIED** | `app/utils/runtime.server.ts` | `tests/runtime-storage.test.mjs` |
| **STO-02** | Storage | Checkpoint tracking, comparison, and restore | **VERIFIED** | `app/utils/checkpoints.server.ts` | `tests/checkpoint.test.mjs` |
| **STO-03** | Storage | Atomic file writes & backup conflict isolation | **VERIFIED** | `app/utils/backup.server.ts` | `tests/plan3-failure-scenarios.test.mjs` |
| **DIA-01** | Diagnostics | 5x5MB rotating local diagnostic logs | **VERIFIED** | `app/utils/diagnostic-logger.server.ts` | `tests/stage01-diagnostics-benchmark.test.mjs` |
| **RUN-01** | Runs | Durable run lifecycle, monotonic sequence, reconnect | **VERIFIED** | `app/utils/runs.server.ts` | `tests/stage02-durable-runs.test.mjs` |
| **RUN-02** | Runs | Orphaned running job recovery upon crash/restart | **VERIFIED** | `app/utils/runs.server.ts` | `tests/stage02-durable-runs.test.mjs` |
| **LLM-01** | Gateway | Shared rate limiter & token budget per account | **VERIFIED** | `app/llm/gateway.server.ts` | `tests/stage03-gateway.test.mjs` |
| **LLM-02** | Gateway | Normalized provider errors (401/403/429/500) | **VERIFIED** | `app/llm/gateway.server.ts` | `tests/stage03-gateway.test.mjs` |
| **COUNCIL-01** | Agents | Adaptive concurrency scaling (starts 2, scales to 8) | **VERIFIED** | `app/engine/real-council.ts` | `tests/stage04-faster-bots.test.mjs` |
| **COUNCIL-02** | Agents | Partial completion: 97 valid replies + 3 failed retained | **VERIFIED** | `app/engine/real-council.ts` | `tests/stage04-faster-bots.test.mjs` |
| **COUNCIL-03** | Agents | Hierarchical chunked synthesis without 240-char cut | **VERIFIED** | `app/engine/real-council.ts` | `tests/stage04-faster-bots.test.mjs` |
| **CTX-01** | Context | 5-tier priority selection (Explicit > Editor > Search > Dep > Proj) | **VERIFIED** | `app/engine/context-engine.ts` | `tests/stage05-context-explorer.test.mjs` |
| **CTX-02** | Explorer | 2 MB file safety guard with 128 KB bounded preview | **VERIFIED** | `app/routes/api.local.fs.ts` | `tests/stage05-context-explorer.test.mjs` |
| **MEM-01** | Memory | Provenance, revision, and preference conflict resolution | **VERIFIED** | `app/engine/memory.ts`, `memory.server.ts` | `tests/stage06-evidence-memory.test.mjs` |
| **MEM-02** | Memory | Obsidian Markdown export with YAML frontmatter | **VERIFIED** | `app/engine/memory.ts` | `tests/stage06-evidence-memory.test.mjs` |
| **SKL-01** | Skills | Zero-dependency YAML parser for multiline frontmatter | **VERIFIED** | `app/utils/yaml-parser.ts` | `tests/stage07-skills.test.mjs` |
| **SKL-02** | Skills | Draft skills quarantine, evaluation, and rollback | **VERIFIED** | `app/utils/skills.server.ts` | `tests/stage07-skills.test.mjs` |
| **EDT-01** | Editor | Proposed ChangeSets with baseline SHA-256 validation | **VERIFIED** | `app/utils/changesets.server.ts` | `tests/stage08-changesets.test.mjs` |
| **EDT-02** | Editor | Pre-apply checkpoints, conflict detection, and revert | **VERIFIED** | `app/utils/changesets.server.ts` | `tests/stage08-changesets.test.mjs` |
| **VOX-01** | Voice | Multilingual Whisper GGML catalog & checksum verification | **VERIFIED** | `app/utils/voice.server.ts` | `tests/stage09-offline-voice.test.mjs` |
| **VOX-02** | Voice | Offline Windows SAPI TTS and audio normalization | **VERIFIED** | `app/utils/voice.server.ts` | `tests/stage09-offline-voice.test.mjs` |
| **VOX-03** | Voice | Voice command authorization & preview readiness pipeline | **VERIFIED** | `app/utils/voice.server.ts` | `tests/stage09-offline-voice.test.mjs` |
| **STR-01** | Store | Curated catalog (MCP servers, skills, plugins) | **VERIFIED** | `app/utils/store.server.ts` | `tests/stage10-store-bridge.test.mjs` |
| **STR-02** | Store | Permission escalation detection & lifecycle rollback | **VERIFIED** | `app/utils/store.server.ts` | `tests/stage10-store-bridge.test.mjs` |
| **BRG-01** | Bridge | Ephemeral project-scoped VS Code companion session | **VERIFIED** | `app/utils/store.server.ts` | `tests/stage10-store-bridge.test.mjs` |
| **TSK-01** | Task Queue | One-time & recurring schedules with timezone support | **VERIFIED** | `app/utils/task-queue.server.ts` | `tests/stage11-task-queue.test.mjs` |
| **TSK-02** | Task Queue | Single catch-up run on restart & capability gating | **VERIFIED** | `app/utils/task-queue.server.ts` | `tests/stage11-task-queue.test.mjs` |
| **UI-01** | Interface | Accessible WCAG 2.2 AA Command Palette modal (`Ctrl+K`) | **VERIFIED** | `app/components/ui/CommandPalette.tsx` | Visual & keyboard navigable |
| **UI-02** | Interface | Preserved layout, transparency, navbar & Appearance | **VERIFIED** | Appearance store & CSS | Manual & CSS tokens |
| **WEB-01** | Runner | Website dev runner with self-preview prevention | **VERIFIED** | `app/utils/website-runner.server.ts` | `tests/checkpoint.test.mjs` |
| **PKG-01** | Release | Windows NSIS Setup installer & unpacked binary | **VERIFIED** | `dist/hedes-studio-1.0.0-win-x64-setup.exe` | Verified build & hash match |
| **AND-01** | Android | Physical device execution on hardware | **BLOCKED** | Termux runtime adapter | No USB/WiFi device connected |
| **PUB-01** | Release | Authenticode code-signing certificate for public release | **BLOCKED** | Windows signing pipeline | Legitimate certs absent |
