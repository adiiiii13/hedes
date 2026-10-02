# HEDES Test Execution Report

**Date of Execution:** October 1, 2026  
**Node.js Runtime:** v24.14.1 (Native ESM `--experimental-strip-types`)  
**Package Manager:** npm 11.11.0 / pnpm-lockfile pinned  
**Total Tests:** 84  
**Passed:** 84  
**Failed:** 0  
**Skipped:** 0  
**Consecutive Clean Runs:** 3 (without retries)

---

## 1. Primary Release Verification Command

```powershell
npm run verify:release
```

Execution Pipeline:
1. `npm run typecheck` (`tsc`): 0 errors across entire workspace.
2. `npm run test` (`node --experimental-strip-types --test tests/*.test.mjs`): 84 passing tests in ~1.5 seconds.

---

## 2. Test Suite Breakdown

### Core Security & Persistence (25 Tests)
- `tests/checkpoint.test.mjs`: Project checkpointing, file snapshot diffing, and restoration.
- `tests/project-dir.test.mjs`: Path normalization, directory traversal rejection (`..`), and boundary enforcement.
- `tests/memory.test.mjs`: Tree cycle rejection, relevance ranking, and parent context preservation.
- `tests/prompt-context.test.mjs`: Secret exclusion from context buffer and bounded file sizes.
- `tests/history-cleanup.test.mjs`: Generated file bodies pruned from assistant history.
- `tests/custom-models.test.mjs`: Model URL formatting, endpoint validation, and duplicate scanning.
- `tests/persistence-backup.test.mjs`: Full backup creation, manifest hashing, secret exclusion, and transactional restore.
- `tests/hive-relay.test.mjs`: Persona call dispatch, error capture, and 97-bot summary preservation.
- `tests/runtime-storage.test.mjs`: Storage path stability across working directories and idempotent migrations.
- `tests/security-session-auth.test.mjs`: Loopback validation, cross-origin rejection, and token verification.

### Plan 2 Feature Stages (34 Tests)
- `tests/stage01-diagnostics-benchmark.test.mjs`: 5x5MB rotating logger, secret redaction, and 10k-file benchmarks.
- `tests/stage02-durable-runs.test.mjs`: Durable run states, monotonic events, reload idempotency, and restart recovery.
- `tests/stage03-gateway.test.mjs`: Shared rate limiter, account token budgets, exponential backoff, and error mapping.
- `tests/stage04-faster-bots.test.mjs`: Adaptive concurrency scaling (43.7% faster), partial completion, and hierarchical synthesis.
- `tests/stage05-context-explorer.test.mjs`: 5-tier context priority ranking, 2 MB safety guard, and 128 KB bounded preview.
- `tests/stage06-evidence-memory.test.mjs`: Provenance tracking, preference conflict resolution, and Obsidian export.
- `tests/stage07-skills.test.mjs`: Zero-dependency YAML parser, draft skill quarantine, and version rollback.
- `tests/stage08-changesets.test.mjs`: Proposed ChangeSets, baseline hash validation, pre-apply checkpoints, and revert.
- `tests/stage09-offline-voice.test.mjs`: Multilingual Whisper models, offline SAPI TTS, and voice command approval pipeline.
- `tests/stage10-store-bridge.test.mjs`: Curated store catalog, permission escalation checks, and VS Code bridge tokens.
- `tests/stage11-task-queue.test.mjs`: Scheduled local tasks, approval gating, and single catch-up on restart.

### Plan 3 Integration & Fault Injection (25 Tests)
- `tests/plan3-task-quality-fixtures.test.mjs`: Defect diagnosis, executable fix with ChangeSets, prompt injection defense, and evidence verification.
- `tests/plan3-voice-edge-cases.test.mjs`: Missing model recovery, silence detection, Hindi/English language tags, and cancellation.
- `tests/plan3-mcp-plugin-bridge-lifecycle.test.mjs`: MCP/Plugin lifecycle, unapproved permission rejection, and bridge session expiration.
- `tests/plan3-failure-scenarios.test.mjs`: Stale revision conflict rejection, corrupted backup rejection, atomic write safety, and Unicode path normalization.

---

## 3. Triple Consecutive Run Logs

All tests passed cleanly on Run 1 (1565 ms), Run 2 (1573 ms), and Run 3 (1682 ms) with zero failures and zero retries.
