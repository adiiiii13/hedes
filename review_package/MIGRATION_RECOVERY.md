# HEDES Migration, Backup & Disaster Recovery Guide

---

## 1. Authoritative Storage Architecture

To guarantee that application updates or installer reinstalls never overwrite user work, HEDES isolates runtime executables from user data:

- **Executable Installation Directory:**
  `C:\Users\<user>\AppData\Local\Programs\Hedes Studio\` (Replaceable during upgrades).
- **Authoritative User Data Directory:**
  `C:\Users\<user>\AppData\Roaming\hedes-studio\` (Preserved across all uninstalls/updates).

### Directory Structure:
```text
%APPDATA%/hedes-studio/
├── projects/       # User project folders & source code
├── memory/         # Evidence-based tree memory & SQLite/JSON graph
├── skills/         # Installed & draft agent skills (SKILL.md)
├── store/          # Store catalog state & installed records
├── tasks/          # Persistent local task queue
├── changesets/     # AI proposed changesets & pre-apply checkpoints
├── logs/           # Rotating local diagnostics (5x5MB)
└── backups/        # Exported backup zip archives & staging
```

---

## 2. Backup & Restore Procedures

### 2.1 Generating a Full Backup
Backups are packaged using DEFLATE compression with manifest checksums:
```typescript
import { createFullBackupArchive } from '~/utils/backup.server';
const { archiveBuffer, manifest } = await createFullBackupArchive();
```
- **Manifest Hash:** SHA-256 of `manifest.json`.
- **Automatic Exclusions:**
  - Sensitive files (`.env*`, `.hedes-vault.enc`)
  - Dependency caches (`node_modules/`, `.git/`, `.vite/`, `dist/`, `build/`)
  - Massive individual files (> 50 MB)

### 2.2 Transactional Restoration
Restoration extracts files into an isolated temporary staging directory (`backups/restore-staging-<timestamp>/`), verifies every file's SHA-256 against `manifest.json`, and atomically promotes staged files to live paths only after complete validation:
```typescript
import { restoreFullBackupArchive } from '~/utils/backup.server';
const result = await restoreFullBackupArchive(archiveBuffer);
```
- **Path Traversal Rejection:** Any archive containing `../` or absolute drive roots is rejected with HTTP 400.
- **Corrupted Zip Defense:** Incomplete or corrupted archives throw descriptive errors without modifying active data.

---

## 3. Disaster Recovery & Rollback

### 3.1 AI ChangeSet Rollback
If an applied AI edit causes regressions or unexpected behavior, the ChangeSet can be selectively reverted:
```typescript
import { revertChangeSet } from '~/utils/changesets.server';
await revertChangeSet(changeSetId, projectId);
```
This restores files to their exact pre-apply checkpoint.

### 3.2 Skill Version Rollback
If an updated skill malfunctions:
```typescript
import { rollbackSkill } from '~/utils/skills.server';
await rollbackSkill(skillName, previousRevisionNumber);
```
Recorded historical versions are preserved in `.history/v<rev>.md`.
