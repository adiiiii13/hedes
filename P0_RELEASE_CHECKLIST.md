# HEDES production release gates

## Automated gate

Run `pnpm install --frozen-lockfile`, `pnpm audit --prod --audit-level low`, `npm run verify:release`, both Electron builds, `pnpm exec electron-builder --win --dir --publish never`, and `node scripts/p0-desktop-smoke.mjs`.

The Windows workflow performs these steps in a fresh hosted runner. Adding the workflow locally is not evidence that a hosted run passed. All test profiles are disposable and separate from the user's installed profile. The smoke test verifies actual approval UI and command execution in the packaged application.

## Signing and publication

Local developer builds may be unsigned. Public Windows releases must use `electron-builder.release.yml`, which fails if signing is unavailable. Supply the signing identity through the runner's secure credential mechanism; never commit a certificate or password. Verify the resulting installer with `node scripts/check-release-signing.mjs <installer.exe>`.

No signing certificate was available on the review machine. Signing, public publication and remote updater verification cannot be claimed complete until an actual trusted signing identity and release channel exist. The default build command does not publish. No repository content was uploaded by this task.

## Install, update and rollback

Before an update, close active model runs and terminals, export a full backup, and keep the previous verified installer. The backup intentionally excludes provider credentials and environment secrets. Credentials remain in the installed profile and must be re-entered when moving to a different machine.

On a clean Windows VM, install the signed candidate, create a project and settings, upgrade from the previous signed version, reopen that project, and verify both history and file hashes. To roll back, close HEDES, reinstall the previous verified installer, then restore the matching backup if a storage migration occurred. Do not downgrade a profile that a newer storage schema modified without restoring its matching backup.

Test cancelled downloads, invalid signatures, interrupted installation, and profile recovery on that VM. These are separate release gates; unit tests and local packaging do not prove them.

## AI quality

`scripts/p0-model-quality.mjs` calls a free local Ollama model through HEDES's actual HTTP routes. It records the model, timings, generated content, and deterministic checks. A small local model passing limited scenarios is not proof of broad coding quality or cloud-provider compatibility. Public quality claims must cite the exact scenarios and results.

## Approval boundary

Generated file edits, shell/website actions, deletion, restore and MCP invocation require an exact server-side approval. Approval records include the current app session, payload digest and expiry and are consumed once. Review UI shows file contents before/after; saved edits support conflict-aware undo.

This is an authorization boundary, not an OS sandbox. An approved shell command or MCP executable runs with the user's OS permissions. Do not describe it as container isolation.
