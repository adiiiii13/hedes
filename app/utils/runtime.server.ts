import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type RuntimeMode = 'windows-desktop' | 'android-termux' | 'website-coming-soon';

export interface RuntimeCapabilities {
  runtime: RuntimeMode;
  localFiles: boolean;
  terminal: boolean;
  microphone: boolean;
  secureCredentialStorage: boolean;
  mcp: boolean;
  updates: boolean;
}

export interface StoragePaths {
  userData: string;
  projects: string;
  settings: string;
  vault: string;
  memory: string;
  skills: string;
  mcp: string;
  plugins: string;
  logs: string;
  backups: string;
  sessions: string;
}

export function getRuntimeMode(): RuntimeMode {
  if (process.env.HEDES_RUNTIME === 'android-termux') return 'android-termux';
  if (process.env.HEDES_RUNTIME === 'website-coming-soon') return 'website-coming-soon';
  if (process.env.HEDES_RUNTIME === 'windows-desktop') return 'windows-desktop';

  if (process.env.TERMUX_VERSION || process.platform === 'android') {
    return 'android-termux';
  }

  return 'windows-desktop';
}

export function getRuntimeCapabilities(mode: RuntimeMode = getRuntimeMode()): RuntimeCapabilities {
  switch (mode) {
    case 'windows-desktop':
      return {
        runtime: 'windows-desktop',
        localFiles: true,
        terminal: true,
        microphone: true,
        secureCredentialStorage: true,
        mcp: true,
        updates: true,
      };
    case 'android-termux':
      return {
        runtime: 'android-termux',
        localFiles: true,
        terminal: true,
        microphone: false,
        secureCredentialStorage: false,
        mcp: true,
        updates: false,
      };
    case 'website-coming-soon':
      return {
        runtime: 'website-coming-soon',
        localFiles: false,
        terminal: false,
        microphone: false,
        secureCredentialStorage: false,
        mcp: false,
        updates: false,
      };
  }
}

export function getDefaultUserDataDir(mode: RuntimeMode = getRuntimeMode()): string {
  if (process.env.HEDES_USER_DATA_DIR) {
    return path.resolve(process.env.HEDES_USER_DATA_DIR);
  }

  if (mode === 'android-termux') {
    const home = process.env.HOME || '/data/data/com.termux/files/home';
    return path.join(home, '.local', 'share', 'hedes-studio');
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : null);
    if (appData) {
      return path.join(appData, 'hedes-studio');
    }
  }

  const fallbackBase = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(fallbackBase, '.hedes-studio');
}

export function getStoragePaths(customUserData?: string): StoragePaths {
  const userData = customUserData ? path.resolve(customUserData) : getDefaultUserDataDir();
  return {
    userData,
    projects: path.join(userData, 'projects'),
    settings: path.join(userData, 'settings'),
    vault: path.join(userData, 'vault'),
    memory: path.join(userData, 'memory'),
    skills: path.join(userData, 'skills'),
    mcp: path.join(userData, 'mcp'),
    plugins: path.join(userData, 'plugins'),
    logs: path.join(userData, 'logs'),
    backups: path.join(userData, 'backups'),
    sessions: path.join(userData, 'sessions'),
  };
}

export async function ensureStorageDirectories(paths: StoragePaths = getStoragePaths()): Promise<void> {
  const dirs = [
    paths.userData,
    paths.projects,
    paths.settings,
    paths.vault,
    paths.memory,
    paths.skills,
    paths.mcp,
    paths.plugins,
    paths.logs,
    paths.backups,
    paths.sessions,
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function hashFile(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

export interface MigrationRecord {
  source: string;
  destination: string;
  status: 'copied' | 'identical-skipped' | 'conflict-preserved';
  sourceHash: string | null;
  destHash: string | null;
  conflictPath?: string;
}

export interface MigrationManifest {
  version: number;
  migratedAt: number;
  records: MigrationRecord[];
}

export async function runStorageMigration(paths: StoragePaths = getStoragePaths()): Promise<MigrationManifest> {
  await ensureStorageDirectories(paths);

  const manifestPath = path.join(paths.userData, 'migration-manifest.json');
  const versionPath = path.join(paths.userData, 'migration-version.json');

  let currentVersion = 0;
  try {
    const raw = await fs.readFile(versionPath, 'utf8');
    const parsed = JSON.parse(raw);
    currentVersion = parsed.version || 0;
  } catch {}

  const CURRENT_MIGRATION_VERSION = 1;
  if (currentVersion >= CURRENT_MIGRATION_VERSION) {
    try {
      return JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    } catch {
      return { version: currentVersion, migratedAt: Date.now(), records: [] };
    }
  }

  const records: MigrationRecord[] = [];
  const candidateLegacyDirs: string[] = [
    path.resolve('projects'),
    path.resolve(process.cwd(), 'projects'),
  ];

  if (process.execPath) {
    candidateLegacyDirs.push(path.resolve(path.dirname(process.execPath), 'projects'));
  }

  const uniqueLegacyDirs = [...new Set(candidateLegacyDirs)].filter(
    (dir) => path.resolve(dir) !== path.resolve(paths.projects)
  );

  for (const legacyDir of uniqueLegacyDirs) {
    const entries = await fs.readdir(legacyDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const source = path.join(legacyDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.hedes-memory') {
          // Migrate memory files
          const memEntries = await fs.readdir(source, { withFileTypes: true }).catch(() => []);
          for (const m of memEntries) {
            if (!m.isFile() || !m.name.endsWith('.json')) continue;
            const srcFile = path.join(source, m.name);
            const dstFile = path.join(paths.memory, m.name);
            await migrateSingleFile(srcFile, dstFile, records);
          }
        } else if (entry.name === '.hedes-skills') {
          // Migrate skill directories
          const skillEntries = await fs.readdir(source, { withFileTypes: true }).catch(() => []);
          for (const s of skillEntries) {
            if (!s.isDirectory()) continue;
            const srcSkillDir = path.join(source, s.name);
            const dstSkillDir = path.join(paths.skills, s.name);
            await fs.mkdir(dstSkillDir, { recursive: true });
            const sFiles = await fs.readdir(srcSkillDir).catch(() => []);
            for (const sf of sFiles) {
              await migrateSingleFile(path.join(srcSkillDir, sf), path.join(dstSkillDir, sf), records);
            }
          }
        } else {
          // Normal project directory
          const dstProjectDir = path.join(paths.projects, entry.name);
          await migrateDirectory(source, dstProjectDir, records);
        }
      } else if (entry.isFile()) {
        if (entry.name === '.hedes_settings.json') {
          await migrateSingleFile(source, path.join(paths.settings, '.hedes_settings.json'), records);
        } else if (entry.name === '.hedes_profile.json') {
          await migrateSingleFile(source, path.join(paths.settings, '.hedes_profile.json'), records);
        } else if (entry.name === '.hedes-mcp.json') {
          await migrateSingleFile(source, path.join(paths.mcp, '.hedes-mcp.json'), records);
        }
      }
    }
  }

  // Also check workspace root loose files
  const rootFilesToMigrate = [
    { src: path.resolve('.hedes_settings.json'), dst: path.join(paths.settings, '.hedes_settings.json') },
    { src: path.resolve('.hedes_profile.json'), dst: path.join(paths.settings, '.hedes_profile.json') },
    { src: path.resolve('.hedes-mcp.json'), dst: path.join(paths.mcp, '.hedes-mcp.json') },
  ];

  for (const { src, dst } of rootFilesToMigrate) {
    if (path.resolve(src) !== path.resolve(dst)) {
      const stat = await fs.stat(src).catch(() => null);
      if (stat && stat.isFile()) {
        await migrateSingleFile(src, dst, records);
      }
    }
  }

  const manifest: MigrationManifest = {
    version: CURRENT_MIGRATION_VERSION,
    migratedAt: Date.now(),
    records,
  };

  const tempManifest = `${manifestPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempManifest, JSON.stringify(manifest, null, 2), 'utf8');
  await fs.rename(tempManifest, manifestPath);

  const tempVersion = `${versionPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempVersion, JSON.stringify({ version: CURRENT_MIGRATION_VERSION, migratedAt: Date.now() }, null, 2), 'utf8');
  await fs.rename(tempVersion, versionPath);

  return manifest;
}

async function migrateSingleFile(source: string, destination: string, records: MigrationRecord[]): Promise<void> {
  const srcHash = await hashFile(source);
  if (!srcHash) return;

  const destStat = await fs.stat(destination).catch(() => null);
  if (!destStat) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    records.push({
      source,
      destination,
      status: 'copied',
      sourceHash: srcHash,
      destHash: srcHash,
    });
    return;
  }

  const dstHash = await hashFile(destination);
  if (srcHash === dstHash) {
    records.push({
      source,
      destination,
      status: 'identical-skipped',
      sourceHash: srcHash,
      destHash: dstHash,
    });
    return;
  }

  // Conflict preservation: preserve existing destination, write source as legacy-conflict
  const parsed = path.parse(destination);
  const conflictFilename = `${parsed.name}.legacy-conflict-${Date.now()}${parsed.ext}`;
  const conflictPath = path.join(parsed.dir, conflictFilename);
  await fs.copyFile(source, conflictPath);

  records.push({
    source,
    destination,
    status: 'conflict-preserved',
    sourceHash: srcHash,
    destHash: dstHash,
    conflictPath,
  });
}

async function migrateDirectory(sourceDir: string, destDir: string, records: MigrationRecord[]): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const dstPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await migrateDirectory(srcPath, dstPath, records);
    } else if (entry.isFile()) {
      await migrateSingleFile(srcPath, dstPath, records);
    }
  }
}
