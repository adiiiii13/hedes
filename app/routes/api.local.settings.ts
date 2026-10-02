import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PROJECTS_BASE } from '~/utils/project-dir.server';
import { getStoragePaths } from '~/utils/runtime.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';

const SETTINGS_FILE_PATH = path.join(getStoragePaths().settings, '.hedes_settings.json');
const LEGACY_SETTINGS_FILE_PATH = path.join(PROJECTS_BASE, '.hedes_settings.json');

const DEFAULT_BACKEND_SETTINGS = {
  activeProvider: 'Groq',
  activeModel: 'openai/gpt-oss-120b',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  terminalShellType: 'powershell',
  terminalFontSize: 12,
  terminalCursorStyle: 'bar',
  customSystemPrompt: '',
  customProviders: [],
};

async function readSettingsContent(): Promise<string> {
  try {
    return await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return await fs.readFile(LEGACY_SETTINGS_FILE_PATH, 'utf-8');
    }
    throw e;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  try {
    await fs.mkdir(getStoragePaths().settings, { recursive: true });
    const content = await readSettingsContent();
    const settings = JSON.parse(content);
    delete settings.apiKeys;
    return json({ ok: true, settings: { ...DEFAULT_BACKEND_SETTINGS, ...settings } });
  } catch {
    return json({ ok: true, settings: DEFAULT_BACKEND_SETTINGS });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const updates = await request.json();
    delete updates.apiKeys;
    const settingsDir = getStoragePaths().settings;
    await fs.mkdir(settingsDir, { recursive: true });

    let existing = DEFAULT_BACKEND_SETTINGS;
    try {
      const content = await readSettingsContent();
      existing = { ...existing, ...JSON.parse(content) };
    } catch {}

    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    delete (merged as typeof merged & { apiKeys?: unknown }).apiKeys;
    
    // Atomic write
    const tempFile = `${SETTINGS_FILE_PATH}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(merged, null, 2), 'utf-8');
    await fs.rename(tempFile, SETTINGS_FILE_PATH);

    return json({ ok: true, settings: merged });
  } catch (err: any) {
    console.error('Failed to save settings backend:', err);
    return json({ ok: false, error: err.message || 'Failed to save settings' }, { status: 500 });
  }
}
