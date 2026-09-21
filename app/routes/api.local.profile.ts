import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PROJECTS_BASE } from '~/utils/project-dir.server';

const PROFILE_FILE_PATH = path.join(PROJECTS_BASE, '.hedes_profile.json');

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

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    await fs.mkdir(PROJECTS_BASE, { recursive: true });
    const content = await fs.readFile(PROFILE_FILE_PATH, 'utf-8');
    const profile = JSON.parse(content);
    return json({ ok: true, profile: { ...DEFAULT_BACKEND_PROFILE, ...profile } });
  } catch {
    return json({ ok: true, profile: DEFAULT_BACKEND_PROFILE });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const updates = await request.json();
    await fs.mkdir(PROJECTS_BASE, { recursive: true });

    let existing = DEFAULT_BACKEND_PROFILE;
    try {
      const content = await fs.readFile(PROFILE_FILE_PATH, 'utf-8');
      existing = { ...existing, ...JSON.parse(content) };
    } catch {}

    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await fs.writeFile(PROFILE_FILE_PATH, JSON.stringify(merged, null, 2), 'utf-8');

    return json({ ok: true, profile: merged });
  } catch (err: any) {
    console.error('Failed to save profile backend:', err);
    return json({ ok: false, error: err.message || 'Failed to save profile' }, { status: 500 });
  }
}
