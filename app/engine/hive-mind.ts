import {
  DEFAULT_100_PERSONAS,
  PERSONA_CATEGORIES,
  type HumanPersona,
  type PersonaCategory,
} from './personifications';

export interface HiveBot {
  id: number;
  name: string;
  archetype: string;
  category: string;
  categoryId: string;
  role: string;
  avatar: string;
  color: string;
  status: 'idle' | 'analyzing' | 'debating' | 'consensus' | 'complete' | 'failed';
  thought?: string;
  vote?: string;
  enabled: boolean;
  weight: number;
}

export interface SwarmCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  leadBot: string;
  description: string;
  bots: HiveBot[];
}

export interface DebateMessage {
  id: string;
  botId: number;
  botName: string;
  archetype: string;
  category: string;
  avatar: string;
  text: string;
  round: number;
  timestamp: number;
}

export interface HiveMindState {
  isActive: boolean;
  phase: 'idle' | 'spawning' | 'analyzing' | 'debating' | 'consensus' | 'complete' | 'cancelled' | 'error';
  progress: number;
  activeBotsCount: number;
  totalBotsCount: number;
  successfulBotsCount: number;
  failedBotsCount: number;
  synthesisFallback: boolean;
  currentRound: number;
  debateLogs: DebateMessage[];
  consensusSummary: string | null;
  selectedBotId: number | null;
  runId: string | null;
}

export function generate100Bots(customPersonas?: HumanPersona[]): {
  categories: SwarmCategory[];
  allBots: HiveBot[];
} {
  const personas = customPersonas && customPersonas.length === 100 ? customPersonas : DEFAULT_100_PERSONAS;
  const categories: SwarmCategory[] = [];
  const allBots: HiveBot[] = [];

  for (const catDef of PERSONA_CATEGORIES) {
    const catPersonas = personas.filter((p) => p.categoryId === catDef.id);
    const categoryBots: HiveBot[] = catPersonas.map((p) => {
      const bot: HiveBot = {
        id: p.id,
        name: p.name,
        archetype: p.archetype,
        category: p.category,
        categoryId: p.categoryId,
        role: p.role,
        avatar: p.avatar,
        color: p.color,
        status: 'idle',
        thought: p.prompt,
        enabled: p.enabled !== false,
        weight: p.weight || 3,
      };
      allBots.push(bot);
      return bot;
    });

    categories.push({
      id: catDef.id,
      name: catDef.name,
      icon: catDef.icon,
      color: catDef.color,
      leadBot: categoryBots[0]?.name || catDef.name,
      description: catDef.description,
      bots: categoryBots,
    });
  }

  return { categories, allBots };
}
