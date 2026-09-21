import { atom, map } from 'nanostores';

export interface UserProfile {
  name: string;
  role: string;
  bio: string;
  perspective: string;
  preferences: string;
  avatarColor: string;
  initials: string;
  avatarIcon?: string;
  techStack?: string;
  tone?: string;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  name: 'Aditya',
  role: 'Software Architect & Builder',
  bio: 'Building autonomous, human-centered multi-agent intelligence tools.',
  perspective: 'Values high efficiency, intuitive user experience, robust architecture, and real-world accessibility. Prioritizes solutions that empower everyday humans and avoid elitist barriers.',
  preferences: 'TypeScript, modern clean UI, dark glassmorphism, instant feedback, offline resilience.',
  avatarColor: '#6366f1',
  initials: 'AD',
  avatarIcon: 'code',
  techStack: 'React, TypeScript, Tailwind, Node.js',
  tone: 'Pragmatic & Architectural',
};

export const PERSPECTIVE_PRESETS = [
  {
    id: 'pragmatist',
    title: 'Practical Pragmatist',
    role: 'Full Stack Architect',
    perspective: 'Focuses on real-world reliability, minimal overhead, clear architecture, and zero unnecessary dependencies.',
    preferences: 'TypeScript, modern vanilla CSS / clean components, strict typing, automated tests.',
  },
  {
    id: 'field_worker',
    title: 'Field Worker & Operator',
    role: 'Operations & Field Specialist',
    perspective: 'Demands high-contrast readable layouts, offline-first syncing, resilient error handling under spotty networks, and single-tap operations.',
    preferences: 'Offline PWA, high contrast dark theme, big buttons, minimal bandwidth usage.',
  },
  {
    id: 'speed_prototyper',
    title: 'Rapid Prototyper',
    role: 'Product Engineer & Hacker',
    perspective: 'Prioritizes maximum development velocity, instant visual feedback, modern animations, and dynamic micro-interactions.',
    preferences: 'Vite, Fast Refresh, rich animations, glassmorphism, instant previews.',
  },
  {
    id: 'deep_systems',
    title: 'Deep Systems & AI Engineer',
    role: 'AI Systems Engineer',
    perspective: 'Deep focus on local LLM privacy, multi-agent consensus, token economics, latency monitoring, and modular model adapters.',
    preferences: 'Ollama local models, streaming NDJSON, fallback resilience, zero telemetry leaks.',
  },
  {
    id: 'accessibility',
    title: 'Accessibility & Universal Inclusion',
    role: 'Human-Centered UX Specialist',
    perspective: 'Ensures tools are usable by everyone regardless of technical background, physical abilities, screen size, or economic constraints.',
    preferences: 'Semantic HTML, ARIA compliance, keyboard navigability, high color contrast, clear language.',
  },
];

export const userProfileStore = map<UserProfile>(DEFAULT_USER_PROFILE);
export const isProfileOpen = atom<boolean>(false);
export const is100ChatOpen = atom<boolean>(false);
export const activePersonaForChat = atom<number | null>(null);
export const isProfileBackendSynced = atom<boolean>(false);

export function computeInitials(name: string): string {
  if (!name || !name.trim()) return 'DEV';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function loadUserProfile(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Instant load from localStorage
  try {
    const saved = localStorage.getItem('hedes_user_profile');
    if (saved) {
      const parsed = JSON.parse(saved);
      userProfileStore.set({
        ...DEFAULT_USER_PROFILE,
        ...parsed,
        initials: computeInitials(parsed.name || DEFAULT_USER_PROFILE.name),
      });
    }
  } catch (err) {
    console.error('Failed to load profile from localStorage:', err);
  }

  // 2. Fetch from backend and sync
  try {
    const res = await fetch('/api/local/profile');
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.profile) {
        userProfileStore.set({
          ...DEFAULT_USER_PROFILE,
          ...data.profile,
          initials: computeInitials(data.profile.name || DEFAULT_USER_PROFILE.name),
        });
        localStorage.setItem('hedes_user_profile', JSON.stringify(data.profile));
        isProfileBackendSynced.set(true);
      }
    }
  } catch (err) {
    console.warn('Profile backend sync offline, using local store:', err);
  }
}

export function saveUserProfile(updates: Partial<UserProfile>): void {
  const current = userProfileStore.get();
  const name = updates.name !== undefined ? updates.name : current.name;
  const updated: UserProfile = {
    ...current,
    ...updates,
    initials: computeInitials(name),
  };

  userProfileStore.set(updated);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('hedes_user_profile', JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to persist user profile:', err);
    }

    // Persist to backend
    fetch('/api/local/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          isProfileBackendSynced.set(true);
        }
      })
      .catch((err) => {
        console.warn('Failed to sync profile to backend:', err);
        isProfileBackendSynced.set(false);
      });
  }
}

export function resetUserProfile(): void {
  userProfileStore.set(DEFAULT_USER_PROFILE);
  if (typeof window !== 'undefined') {
    localStorage.setItem('hedes_user_profile', JSON.stringify(DEFAULT_USER_PROFILE));
    fetch('/api/local/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DEFAULT_USER_PROFILE),
    }).catch(() => {});
  }
}

export function exportProfileAsJson(): void {
  const profile = userProfileStore.get();
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hedes-profile-${(profile.name || 'user').toLowerCase().replace(/\s+/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importProfileFromJson(jsonText: string): boolean {
  try {
    const parsed = JSON.parse(jsonText);
    saveUserProfile(parsed);
    return true;
  } catch (err) {
    console.error('Failed to parse imported profile JSON:', err);
    return false;
  }
}

import {
  saveCouncilSession as dbSaveCouncilSession,
  listCouncilSessions as dbListCouncilSessions,
  deleteCouncilSession as dbDeleteCouncilSession,
  type CouncilSessionRecord,
} from '~/persistence/db';

export type { CouncilSessionRecord };
export const councilSessionsStore = atom<CouncilSessionRecord[]>([]);
export const activeCouncilSessionId = atom<string | null>(null);

export async function loadCouncilSessions(): Promise<CouncilSessionRecord[]> {
  if (typeof window === 'undefined') return [];

  try {
    const dbSessions = await dbListCouncilSessions();
    if (dbSessions && dbSessions.length > 0) {
      councilSessionsStore.set(dbSessions);
      return dbSessions;
    }

    const saved = localStorage.getItem('hedes_council_sessions');
    if (saved) {
      const parsed = JSON.parse(saved);
      councilSessionsStore.set(parsed);
      for (const s of parsed) {
        dbSaveCouncilSession(s).catch(() => {});
      }
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load council sessions:', err);
  }
  return [];
}

export async function persistCouncilSession(session: CouncilSessionRecord): Promise<void> {
  const current = councilSessionsStore.get();
  const existingIdx = current.findIndex((s) => s.id === session.id);
  let updated: CouncilSessionRecord[];

  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = session;
  } else {
    updated = [session, ...current];
  }

  councilSessionsStore.set(updated);
  activeCouncilSessionId.set(session.id);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('hedes_council_sessions', JSON.stringify(updated));
    } catch {}
    dbSaveCouncilSession(session).catch(() => {});
  }
}

export async function removeCouncilSession(id: string): Promise<void> {
  const current = councilSessionsStore.get();
  const updated = current.filter((s) => s.id !== id);
  councilSessionsStore.set(updated);

  if (activeCouncilSessionId.get() === id) {
    activeCouncilSessionId.set(null);
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('hedes_council_sessions', JSON.stringify(updated));
    } catch {}
    dbDeleteCouncilSession(id).catch(() => {});
  }
}

