import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PROJECTS_BASE } from '~/utils/project-dir.server';

const SETTINGS_FILE_PATH = path.join(PROJECTS_BASE, '.hedes_settings.json');

const DEFAULT_BACKEND_SETTINGS = {
  activeProvider: 'Groq',
  activeModel: 'llama-3.3-70b-versatile',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  terminalShellType: 'powershell',
  terminalFontSize: 12,
  terminalCursorStyle: 'bar',
  customSystemPrompt: '',
  apiKeys: {},
  customProviders: [],
};

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    await fs.mkdir(PROJECTS_BASE, { recursive: true });
    const content = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
    const settings = JSON.parse(content);
    return json({ ok: true, settings: { ...DEFAULT_BACKEND_SETTINGS, ...settings } });
  } catch {
    return json({ ok: true, settings: DEFAULT_BACKEND_SETTINGS });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const updates = await request.json();
    await fs.mkdir(PROJECTS_BASE, { recursive: true });

    let existing = DEFAULT_BACKEND_SETTINGS;
    try {
      const content = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
      existing = { ...existing, ...JSON.parse(content) };
    } catch {}

    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(merged, null, 2), 'utf-8');

    return json({ ok: true, settings: merged });
  } catch (err: any) {
    console.error('Failed to save settings backend:', err);
    return json({ ok: false, error: err.message || 'Failed to save settings' }, { status: 500 });
  }
}
