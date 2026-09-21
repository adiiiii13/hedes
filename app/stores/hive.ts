import { atom, map } from 'nanostores';
import {
  generate100Bots,
  run100BotHiveMind,
  type HiveBot,
  type SwarmCategory,
  type DebateMessage,
  type HiveMindState,
} from '~/engine/hive-mind';
import {
  DEFAULT_100_PERSONAS,
  type HumanPersona,
} from '~/engine/personifications';

export function loadSavedPersonas(): HumanPersona[] {
  if (typeof window === 'undefined') return DEFAULT_100_PERSONAS;
  try {
    const raw = localStorage.getItem('hedes_custom_personas');
    if (!raw) return DEFAULT_100_PERSONAS;
    const parsed = JSON.parse(raw) as HumanPersona[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_100_PERSONAS;

    // Merge default with parsed to preserve full 100 personas and structural stability
    return DEFAULT_100_PERSONAS.map((def) => {
      const saved = parsed.find((p) => p.id === def.id);
      return saved ? { ...def, ...saved } : def;
    });
  } catch (err) {
    console.error('Failed to load custom personas from localStorage', err);
    return DEFAULT_100_PERSONAS;
  }
}

export function persistPersonas(personas: HumanPersona[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('hedes_custom_personas', JSON.stringify(personas));
  } catch (err) {
    console.error('Failed to save custom personas', err);
  }
}

export const humanPersonasStore = atom<HumanPersona[]>(DEFAULT_100_PERSONAS);

// Initialize personas from storage on client load
if (typeof window !== 'undefined') {
  const loaded = loadSavedPersonas();
  humanPersonasStore.set(loaded);
}

const initialData = generate100Bots(DEFAULT_100_PERSONAS);

export const hiveMindBots = atom<HiveBot[]>(initialData.allBots);
export const hiveMindCategories = atom<SwarmCategory[]>(initialData.categories);

export const hiveMindState = map<HiveMindState>({
  isActive: false,
  phase: 'idle',
  progress: 0,
  activeBotsCount: 100,
  totalBotsCount: 100,
  currentRound: 0,
  debateLogs: [],
  consensusSummary: null,
  selectedBotId: null,
});

export const isHivePanelExpanded = atom<boolean>(false);

export function updatePersona(id: number, updates: Partial<HumanPersona>) {
  const current = [...humanPersonasStore.get()];
  const idx = current.findIndex((p) => p.id === id);
  if (idx !== -1) {
    current[idx] = { ...current[idx], ...updates };
    humanPersonasStore.set(current);
    persistPersonas(current);

    // Sync swarm bots
    const updated = generate100Bots(current);
    hiveMindBots.set(updated.allBots);
    hiveMindCategories.set(updated.categories);
  }
}

export function togglePersonaPermission(id: number) {
  const current = [...humanPersonasStore.get()];
  const persona = current.find((p) => p.id === id);
  if (persona) {
    updatePersona(id, { enabled: !persona.enabled });
  }
}

export function resetPersona(id: number) {
  const def = DEFAULT_100_PERSONAS.find((p) => p.id === id);
  if (def) {
    updatePersona(id, {
      prompt: def.prompt,
      enabled: def.enabled,
      weight: def.weight,
      terms: def.terms,
    });
  }
}

export function resetAllPersonas() {
  humanPersonasStore.set(DEFAULT_100_PERSONAS);
  persistPersonas(DEFAULT_100_PERSONAS);
  const updated = generate100Bots(DEFAULT_100_PERSONAS);
  hiveMindBots.set(updated.allBots);
  hiveMindCategories.set(updated.categories);
}

export async function triggerHiveMindSwarm(prompt: string): Promise<string> {
  const personas = humanPersonasStore.get();
  const fresh = generate100Bots(personas);
  hiveMindBots.set(fresh.allBots);
  hiveMindCategories.set(fresh.categories);

  const activeCount = personas.filter((p) => p.enabled !== false).length;

  hiveMindState.set({
    isActive: true,
    phase: 'spawning',
    progress: 5,
    activeBotsCount: activeCount,
    totalBotsCount: 100,
    currentRound: 1,
    debateLogs: [],
    consensusSummary: null,
    selectedBotId: null,
  });

  isHivePanelExpanded.set(true);

  const consensus = await run100BotHiveMind(
    prompt,
    {
      onPhaseChange(phase, progress) {
        hiveMindState.setKey('phase', phase);
        hiveMindState.setKey('progress', progress);
      },
      onBotUpdate(botId, status, thought) {
        const current = [...hiveMindBots.get()];
        const idx = current.findIndex((b) => b.id === botId);
        if (idx !== -1) {
          current[idx] = { ...current[idx], status, thought };
          hiveMindBots.set(current);
        }
      },
      onDebateMessage(msg) {
        hiveMindState.setKey('debateLogs', [...hiveMindState.get().debateLogs, msg]);
        hiveMindState.setKey('currentRound', msg.round);
      },
      onConsensusReady(summary) {
        hiveMindState.setKey('consensusSummary', summary);
      },
    },
    personas
  );

  return consensus;
}

export function selectBot(id: number | null) {
  hiveMindState.setKey('selectedBotId', id);
}

export function toggleHivePanel() {
  isHivePanelExpanded.set(!isHivePanelExpanded.get());
}
