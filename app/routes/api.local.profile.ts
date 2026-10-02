import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PROJECTS_BASE } from '~/utils/project-dir.server';
import { getStoragePaths } from '~/utils/runtime.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';

const PROFILE_FILE_PATH = path.join(getStoragePaths().settings, '.hedes_profile.json');
const LEGACY_PROFILE_FILE_PATH = path.join(PROJECTS_BASE, '.hedes_profile.json');

const DEFAULT_BACKEND_PROFILE = {
  name: 'Aditya',
  role: 'Software Architect & Builder',
  bio: 'Building autonomous, human-centered multi-agent intelligence tools.',
  perspective: 'Values high efficiency, intuitive user experience, robust architecture, and real-world accessibility. Prioritizes solutions that empower everyday humans and avoid elitist barriers.',
  preferences: 'TypeScript, modern clean UI, dark glassmorphism, instant feedback, offline resilience.',
  avatarColor: '#6366f1',
  initials: 'AD',
  techStack: 'React, TypeScript, Tailwind, Node.js',
  tone: 'Pragmatic & Architectural',
};

async function readProfileContent(): Promise<string> {
  try {
    return await fs.readFile(PROFILE_FILE_PATH, 'utf-8');
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return await fs.readFile(LEGACY_PROFILE_FILE_PATH, 'utf-8');
    }
    throw e;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  try {
    await fs.mkdir(getStoragePaths().settings, { recursive: true });
    const content = await readProfileContent();
    const profile = JSON.parse(content);
    return json({ ok: true, profile: { ...DEFAULT_BACKEND_PROFILE, ...profile } });
  } catch {
    return json({ ok: true, profile: DEFAULT_BACKEND_PROFILE });
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
    const settingsDir = getStoragePaths().settings;
    await fs.mkdir(settingsDir, { recursive: true });

    let existing = DEFAULT_BACKEND_PROFILE;
    try {
      const content = await readProfileContent();
      existing = { ...existing, ...JSON.parse(content) };
    } catch {}

    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    
    // Atomic write
    const tempFile = `${PROFILE_FILE_PATH}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(merged, null, 2), 'utf-8');
    await fs.rename(tempFile, PROFILE_FILE_PATH);

    return json({ ok: true, profile: merged });
  } catch (err: any) {
    console.error('Failed to save profile backend:', err);
    return json({ ok: false, error: err.message || 'Failed to save profile' }, { status: 500 });
  }
}
