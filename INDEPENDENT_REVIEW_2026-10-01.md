# HEDES independent review — 2026-10-01

## Decision

**Suitable for local user acceptance testing after the fixes below. Public production release remains blocked.**

Review build: **1.0.1**. Existing profile was backed up before installation to `C:\Users\adity\AppData\Local\Hedes Studio Recovery\review-2026-10-01\profile`. The desktop shortcut targets the stable installed executable, not a temporary build folder.

Installed executable SHA-256 matched the tested packaged executable; installed product version is 1.0.1.0. The installed app was launched for user testing. An attempted combined shortcut/old-installer cleanup command was rejected by automatic policy review with only “blocked by policy”; it was not retried as a deletion workaround. Older installer artifacts may therefore remain under the repository's dist folder.

Antigravity's three-plan completion claims are not fully supported by the implementation. Several tests validate fixtures or standalone helpers instead of the application workflow. Passing the suite is not proof that every planned feature is implemented.

Reviewed the desktop packaging/bootstrap, local API boundary, persistence, project file access, terminal/preview runner, AI adapters and live council route, durable runs, gateway, voice, backup/restore, memory/skills, MCP/plugin/store, task queue, and their test coverage. Existing UI structure was preserved.

## Fixed during this review

1. **Packaged startup crash:** Electron's npm installer shim was bundled into SSR, referencing undefined `__dirname`. Electron is now external to the server build. The packaged app was launched and exercised.
2. **Main-process crypto:** Node built-ins were incorrectly externalized as browser stubs. Main build now externalizes the full Node built-in list.
3. **Local API credentials:** The fetch interceptor attached session tokens to other localhost ports. It now attaches them only to the app's exact origin and `/api/` routes.
4. **Server request boundary:** API read loaders missing authentication were secured. Origin verification now checks the network Host as well as Origin; Remix's development adapter reconstructs the URL from Origin, so checking request.url alone was insufficient.
5. **Bootstrap/IPC:** Bootstrap is restricted to loopback requests and same-origin callers. Desktop and voice IPC reject subframes and origins different from the app renderer. Inherited session tokens are reused consistently.
6. **Project paths:** Directory listing and individual reads now reject sibling-prefix escapes and symbolic links. Metadata writes also validate the project boundary.
7. **Project saves:** File writes are atomic, serialized per target, return content revisions, and reject stale expected revisions with HTTP 409. Windows transient rename locks receive bounded retries. This is not yet a universal cross-process transaction mechanism.
8. **History revision restoration:** Disk revisions are returned to clients and restored on boot/project selection. New chats reset their revision. Reloading previously reset every revision to 1, causing legitimate saves to fail.
9. **Real council integration:** The live route now uses the provider gateway, adequate output tokens, readable specialist prompts, hierarchical synthesis, and durable events. It no longer truncates every reply to a tiny JSON fragment.
10. **Partial results:** 97 usable replies still produce a summary. Individual contributions and failed IDs remain available.
11. **Reconnect/retry:** Reconnecting to an existing council does not start another council. Explicit resume seeds successful contributions and invokes only missing bots. Aborted controllers are reset for an explicit resume.
12. **Durable saves:** Run IDs are validated, writes are serialized with unique temporary files, and events are persisted before subscribers display them. Persistence failures are not silently ignored.
13. **Gateway:** Live council calls share concurrency and retry handling; operations have a 120-second abort signal. Hard quota exhaustion is distinguished from transient rate limits and stops subsequent requests promptly.
14. **AI commands:** Generated commands/start/delete actions now wait for an **Approve and run** click on their displayed payload. A changed payload cannot reuse that approval. This is a UI gate; a complete server-side approval ledger and file-diff approval workflow are still outstanding.
15. **Website runner:** Projects with no dependencies can start without node_modules. Child processes no longer inherit session/provider secrets. The preview was tested with an actual child HTTP server and an editable URL.
16. **Terminal scope:** Generated terminal requests no longer enable arbitrary system cwd through the systemMode branch.
17. **Voice truthfulness:** Removed the fixed placeholder transcript. Configured whisper-cli is actually executed; test transcripts are explicitly marked `mock` and accepted only in test mode.
18. **Voice privacy:** Cloud transcription requires explicit opt-in and uses only the selected supported provider. No silent cloud fallback. Desktop speech defaults to Windows local recognition; transcripts remain drafts until sent. Mute now disables automatic speech.
19. **Whisper integrity:** Corrected tiny/base sizes and SHA-256 values against the official model repository. Previous values rejected genuine models.
20. **Scheduled task execution:** Tasks now execute their command in the project directory, capture actual stdout/stderr/exit status, and report failures. Previously they marked success without executing anything. Due-task recovery invokes the executor instead of fabricating catch-up runs.
21. **Backup validation:** Manifest hashes, file hashes, sizes, file count, missing/unlisted files and original ZIP paths are validated before commit. Destination symlinks are rejected. Commit failures roll back files already replaced.
22. **Store honesty:** Corrected MCP package names and Windows npx arguments. Installation no longer grants tools unconditionally or claims connection health from an enabled checkbox. Store skills are saved as real SKILL.md files; enable/disable/uninstall affect those files. Unimplemented diagnostic/fetch integrations return an actionable error instead of fake success.
23. **Learned skills:** Learned output is saved as a disabled draft for review, not silently enabled.
24. **Packaging:** Included bundled MCP/plugin files in the desktop package. Changed display label back to **100 Bots**.
25. **Tests:** Repaired nonexistent npm test targets and isolated every test run in a temporary profile. Voice/task fixtures no longer imply real inference/execution they did not perform. Added regressions exercising the actual atomic writer, tampered backups, origin checks, and a spawned website process.

## Verification evidence

| Check | Result and limits |
| --- | --- |
| TypeScript and automated suite | 88/88 tests passed; see `output/review-release-verification.log`. Some inherited tests remain synthetic. |
| Real HTTP integration | Authenticated app routes reject unauthorized reads, different localhost origins and stale saves. Custom model discovery passed against a local HTTP fixture. |
| Council adapter integration | 97 valid contributions and summary; reconnect made zero extra model calls; resume invoked only 3 failed bots and completed 100/100. Fixture exercises real HTTP/provider adapters, **not model intelligence**. |
| Approval UI | Generated command remained awaiting approval; clicking the actual button executed PowerShell and produced the expected output. See `output/review-approval-results.log`. |
| Packaged desktop | Startup, PowerShell terminal, wallpaper asset, appearance persistence, history/files after reload, actual iframe preview and voice-page opening passed with zero page errors. See `output/review-desktop-results.json`. |
| Local Windows speech | System.Speech generated a 179,266-byte WAV; the installed recognizer transcribed “Hello.” One recognizer detected. **Physical microphone, full sentence accuracy, Hindi and Whisper inference were not verified.** |
| Dependencies | `pnpm audit --prod` reports 5 high, 5 moderate and 2 low advisories. Findings are recorded, not dismissed as fixed. npm audit was unavailable because this project uses pnpm-lock.yaml. |
| UI | Existing layout retained. Desktop appearance/history/preview controls tested. No full WCAG certification or device-wide mobile test claim. |

Evidence files: `output/review-http-results.json`, `output/review-desktop-results.json`, `output/review-sapi-results.json`, `output/review-dependency-audit-pnpm.json`, `output/playwright/review-packaged-desktop.png`.

## Remaining production blockers and plan gaps

### P0 / release safety

- Upgrade the obsolete Electron 33 runtime to a supported release and resolve dependency advisories with compatibility testing. Do not distribute this build publicly as security-certified.
- Complete server-side approval records scoped to run/project/payload; enforce them for shell, deletes and MCP mutations. The new client UI gate is not a sandbox.
- Route generated file changes through reviewable ChangeSets. Current ChangeSet helpers are not integrated into the main edit flow; file actions still write directly.
- Finish project-level save serialization and revision handling for simultaneous windows/processes and file editor callers. Atomic writes are present; universal conflict protection is not.
- Expand backup coverage to all authoritative settings, store/task/MCP/plugin data and browser appearance preferences. Add bounded ZIP inflation before allocation, restore locking and interruption recovery across process termination.
- Package signing is not configured. Updater publication, rollback and clean-machine installation still need release testing. No private repository publication occurred during this review.

### Plan 2 feature completion

- Gateway is integrated into the council; other AI routes still bypass it. RPM/TPM telemetry does not yet enforce configured account rate budgets.
- Durable backend replay/resume works. Frontend needs complete reconnect/retry controls, cancellation propagation and persisted run selection.
- Task executor works, but automatic scheduler startup/ticks and a complete task-management UI are not wired. Cancellation of a running child process and queue-wide concurrent mutations need stronger handling.
- Store helper routes exist; a complete native catalog UI, runtime health probes and a verified plugin permission/sandbox model remain unfinished.
- MCP is stdio only. Streamable HTTP/OAuth is not implemented. Recommended filesystem access still needs active-project-only scope. MCP calls require per-action authorization before production.
- VS Code launches externally. The proposed companion VSIX, real bridge endpoints and an integrated LSP diagnostic pipeline are not implemented. HEDES cannot claim support for every VS Code extension inside its own editor.
- Whisper model/runtime setup/download UX is incomplete. Browser recording produces WebM while local Whisper needs PCM WAV; desktop currently uses Windows speech for the local default. Hindi/offline Whisper needs actual installation and audio tests.
- Memory provenance/skills helpers exist, but automatic evidence validation, comprehensive retrieval tests and user review/promotion of learned drafts need end-to-end work. This is not model-weight self-training.
- Context indexing/lazy explorer helpers are not sufficient evidence of a virtualized, fully integrated large-project workflow.
- Android/Termux and hosted website parity are not independently verified. A responsive UI alone does not make desktop localhost terminal/preview work on a phone.

### Plan 3 evidence gaps

- Canned task-quality tests do not evaluate an actual LLM. Run the requested quality scenarios with a configured free local model before claiming model quality.
- Physical microphone, Hindi/English recognition accuracy, interruption/barge-in and offline voice model inference need real audio/device testing.
- Endurance tests, forced process-crash recovery, clean-machine install/update, mobile-device tests, real external MCP/plugin lifecycle and accessibility audit remain outstanding.
- The release verification script still means typecheck + Node tests; it must incorporate production build and meaningful packaged/E2E gates in CI before public release.

## References checked

- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron release support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
- [whisper.cpp CLI documentation](https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/README.md)
- [Official whisper.cpp GGML model metadata](https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/main?recursive=false&expand=true)
- MCP 0.6.2 package versions were verified through the npm registry.

The local model fixture and speech WAV contain only review test data. No billable model inference was used. Existing project source changes were preserved; no reset/clean or repository publication was performed.
