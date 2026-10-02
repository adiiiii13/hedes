import { atom, map } from 'nanostores';
import {
  generate100Bots,
  type HiveBot,
  type SwarmCategory,
  type DebateMessage,
  type HiveMindState,
} from '~/engine/hive-mind';
import {
  DEFAULT_100_PERSONAS,
  type HumanPersona,
} from '~/engine/personifications';
import type { CouncilEvent } from '~/engine/real-council';
import { readNdjson } from '~/utils/ndjson';

export function loadSavedPersonas(): HumanPersona[] {
  if (typeof localStorage === 'undefined') return DEFAULT_100_PERSONAS;
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
if (typeof localStorage !== 'undefined') {
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
  successfulBotsCount: 0,
  failedBotsCount: 0,
  synthesisFallback: false,
  currentRound: 0,
  debateLogs: [],
  consensusSummary: null,
  selectedBotId: null,
  runId: null,
});

export const isHivePanelExpanded = atom<boolean>(false);

let activeSwarmAbortController: AbortController | null = null;
let lastSwarmPrompt = '';
let lastSwarmConfig: any = null;

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

export async function cancelHiveMindSwarm(): Promise<void> {
  if (activeSwarmAbortController) {
    activeSwarmAbortController.abort();
    activeSwarmAbortController = null;
  }
  const runId = hiveMindState.get().runId;
  if (runId) {
    try {
      await fetch('/api/local/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', runId }),
      });
    } catch {
      // Ignore network errors on best-effort cancel
    }
  }
  hiveMindState.setKey('phase', 'cancelled');
}

export async function triggerHiveMindSwarm(
  prompt: string,
  config: {
    provider: string;
    model: string;
    chatId?: string;
    projectId?: string;
    apiKey?: string;
    customProviders?: unknown[];
    ollamaBaseUrl?: string;
    signal?: AbortSignal;
    resumeRunId?: string;
  }
): Promise<string> {
  const personas = humanPersonasStore.get();
  lastSwarmPrompt = prompt;
  lastSwarmConfig = config;

  if (activeSwarmAbortController) {
    activeSwarmAbortController.abort();
  }
  activeSwarmAbortController = new AbortController();
  const effectiveSignal = config.signal
    ? AbortSignal.any([config.signal, activeSwarmAbortController.signal])
    : activeSwarmAbortController.signal;

  const isResuming = Boolean(config.resumeRunId);
  const activeCount = personas.filter((p) => p.enabled !== false).length;

  if (!isResuming) {
    const fresh = generate100Bots(personas);
    hiveMindBots.set(fresh.allBots);
    hiveMindCategories.set(fresh.categories);

    hiveMindState.set({
      isActive: true,
      phase: 'spawning',
      progress: 5,
      activeBotsCount: activeCount,
      totalBotsCount: 100,
      successfulBotsCount: 0,
      failedBotsCount: 0,
      synthesisFallback: false,
      currentRound: 1,
      debateLogs: [],
      consensusSummary: null,
      selectedBotId: null,
      runId: null,
    });
  } else {
    hiveMindState.setKey('phase', 'analyzing');
    hiveMindState.setKey('isActive', true);
  }

  isHivePanelExpanded.set(true);

  const response = await fetch('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: effectiveSignal,
    body: JSON.stringify({
      prompt,
      mode: 'swarm',
      personas,
      chatId: config.chatId,
      projectId: config.projectId || config.chatId,
      idempotencyKey: isResuming ? undefined : crypto.randomUUID(),
      runId: config.resumeRunId,
      resume: isResuming,
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      customProviders: config.customProviders,
      ollamaBaseUrl: config.ollamaBaseUrl,
    }),
  }).catch((error) => {
    if (effectiveSignal.aborted) {
      hiveMindState.setKey('phase', 'cancelled');
    } else {
      hiveMindState.setKey('phase', 'error');
    }
    throw error;
  });

  if (!response.ok) {
    hiveMindState.setKey('phase', 'error');
    throw new Error((await response.text()).slice(0, 500));
  }

  let consensus = '';
  let runError = '';
  let successful = 0;

  await readNdjson<CouncilEvent & { runId?: string }>(response, (event) => {
    if (event.runId && !hiveMindState.get().runId) {
      hiveMindState.setKey('runId', event.runId);
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem('hedes_active_swarm_run', event.runId); } catch {}
      }
    }
    if (event.type === 'start') {
      hiveMindState.setKey('phase', 'analyzing');
      hiveMindState.setKey('totalBotsCount', event.total);
    }
    if (event.type === 'agent' || event.type === 'agent_error') {
      const current = [...hiveMindBots.get()];
      const botId = event.type === 'agent' ? event.contribution.agentId : event.agentId;
      const idx = current.findIndex((bot) => bot.id === botId);
      if (idx >= 0) {
        current[idx] = {
          ...current[idx],
          status: event.type === 'agent' ? 'complete' : 'failed',
          thought: event.type === 'agent' ? event.contribution.recommendation : event.error,
        };
      }
      hiveMindBots.set(current);
      const doneCount = current.filter((bot) => bot.status === 'complete' || bot.status === 'failed').length;
      hiveMindState.setKey('progress', Math.round((doneCount / Math.max(event.total, 1)) * 100));
      hiveMindState.setKey('successfulBotsCount', current.filter((bot) => bot.status === 'complete').length);
      hiveMindState.setKey('failedBotsCount', current.filter((bot) => bot.status === 'failed').length);

      if (event.type === 'agent') {
        successful = event.completed;
        const persona = personas.find((item) => item.id === event.contribution.agentId);
        if (persona) {
          const logs = hiveMindState.get().debateLogs;
          if (!logs.some((l) => l.botId === persona.id)) {
            hiveMindState.setKey('debateLogs', [
              ...logs,
              {
                id: `agent-${persona.id}-${Date.now()}`,
                botId: persona.id,
                botName: persona.name,
                archetype: persona.archetype,
                category: persona.category,
                avatar: persona.avatar,
                text: `${event.contribution.critique}\nRecommendation: ${event.contribution.recommendation}`,
                round: 1,
                timestamp: Date.now(),
              },
            ]);
          }
        }
      }
    }
    if (event.type === 'complete') {
      consensus = event.consensus;
      hiveMindState.setKey('consensusSummary', event.consensus);
      hiveMindState.setKey('synthesisFallback', !!event.fallback);
      hiveMindState.setKey('phase', 'complete');
      if (typeof localStorage !== 'undefined') {
        try { localStorage.removeItem('hedes_active_swarm_run'); } catch {}
      }
    }
    if (event.type === 'error') {
      runError = event.error;
      hiveMindState.setKey('phase', 'error');
    }
  }).catch((error) => {
    if (effectiveSignal.aborted) {
      hiveMindState.setKey('phase', 'cancelled');
    } else {
      hiveMindState.setKey('phase', 'error');
    }
    throw error;
  });

  if (runError) throw new Error(runError);
  if (!consensus) {
    if (effectiveSignal.aborted) {
      return '';
    }
    hiveMindState.setKey('phase', 'error');
    throw new Error(`No usable final response. ${successful}/${activeCount} bots responded.`);
  }
  hiveMindState.setKey('progress', 100);
  return consensus;
}

export async function retryFailedBots(): Promise<string> {
  const currentRunId = hiveMindState.get().runId;
  if (!lastSwarmPrompt || !lastSwarmConfig) {
    throw new Error('No previous swarm session to retry');
  }
  // Reset failed bots in UI to analyzing
  const current = [...hiveMindBots.get()];
  for (let i = 0; i < current.length; i++) {
    if (current[i].status === 'failed') {
      current[i] = { ...current[i], status: 'idle', thought: undefined };
    }
  }
  hiveMindBots.set(current);
  hiveMindState.setKey('failedBotsCount', 0);

  return triggerHiveMindSwarm(lastSwarmPrompt, {
    ...lastSwarmConfig,
    resumeRunId: currentRunId || undefined,
  });
}

export async function reconnectHiveMindSwarm(runId: string, prompt: string, config: any): Promise<string> {
  return triggerHiveMindSwarm(prompt, {
    ...config,
    resumeRunId: runId,
  });
}

export function selectBot(id: number | null) {
  hiveMindState.setKey('selectedBotId', id);
}

export function toggleHivePanel() {
  isHivePanelExpanded.set(!isHivePanelExpanded.get());
}
