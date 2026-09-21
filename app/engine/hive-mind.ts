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
  status: 'idle' | 'analyzing' | 'debating' | 'consensus' | 'complete';
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
  phase: 'idle' | 'spawning' | 'analyzing' | 'debating' | 'consensus' | 'complete';
  progress: number;
  activeBotsCount: number;
  totalBotsCount: number;
  currentRound: number;
  debateLogs: DebateMessage[];
  consensusSummary: string | null;
  selectedBotId: number | null;
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

export interface SwarmRunCallbacks {
  onPhaseChange?: (phase: HiveMindState['phase'], progress: number) => void;
  onBotUpdate?: (botId: number, status: HiveBot['status'], thought?: string) => void;
  onDebateMessage?: (msg: DebateMessage) => void;
  onConsensusReady?: (consensus: string) => void;
}

export async function run100BotHiveMind(
  userPrompt: string,
  callbacks?: SwarmRunCallbacks,
  customPersonas?: HumanPersona[]
): Promise<string> {
  const { allBots } = generate100Bots(customPersonas);
  const activeBots = allBots.filter((b) => b.enabled);

  // Phase 1: Spawning all 100 Human Archetypes
  callbacks?.onPhaseChange?.('spawning', 10);
  await new Promise((r) => setTimeout(r, 200));

  // Phase 2: Analyzing in parallel
  callbacks?.onPhaseChange?.('analyzing', 35);
  for (let i = 0; i < allBots.length; i += 10) {
    const batch = allBots.slice(i, i + 10);
    for (const b of batch) {
      if (b.enabled) {
        callbacks?.onBotUpdate?.(b.id, 'analyzing', `Evaluating: "${userPrompt.slice(0, 32)}..." through the lens of ${b.archetype}`);
      } else {
        callbacks?.onBotUpdate?.(b.id, 'idle', `Muted in settings.`);
      }
    }
    await new Promise((r) => setTimeout(r, 40));
  }

  // Phase 3: Cross-Perspective Human Debate
  callbacks?.onPhaseChange?.('debating', 65);

  const representativeVoices = [
    {
      botId: 1,
      botName: 'Kisan Patel',
      archetype: 'The Organic Farmer',
      category: 'Agriculture, Earth & Food',
      avatar: '🌾',
      text: `Field Usability Audit: For "${userPrompt.slice(0, 40)}", ensure UI remains visible in bright sunlight, supports offline caching, and avoids wasting mobile bandwidth.`,
    },
    {
      botId: 11,
      botName: 'Devraj Sharma',
      archetype: 'The Master Auto Mechanic',
      category: 'Trades & Field Technicians',
      avatar: '🔧',
      text: 'Diagnostics & Modularity: Keep the architecture modular. Every component should be easy to inspect and repair without tearing down the entire engine.',
    },
    {
      botId: 21,
      botName: 'Advocate Vikram Mehta',
      archetype: 'The Constitutional Defense Lawyer',
      category: 'Law, Justice & Ethics',
      avatar: '⚖️',
      text: 'Rights & Privacy: Enforce ethical transparency. Protect user autonomy, eliminate dark patterns, and ensure strict data protection.',
    },
    {
      botId: 31,
      botName: 'Elena Rostova, CPA',
      archetype: 'The Forensic Accountant',
      category: 'Finance, Commerce & Accounting',
      avatar: '🔍',
      text: 'Audit Integrity: Ensure all numeric metrics, financial transactions, and state mutations maintain exact precision with transparent audit trails.',
    },
    {
      botId: 41,
      botName: 'Col. Jackson Vance',
      archetype: 'The Strategic Army Field Commander',
      category: 'Defense, Military & First Responders',
      avatar: '🎖️',
      text: 'Fail-Safe Mission Reliability: Zero tolerance for unhandled crashes. Build robust error boundaries and instantaneous recovery procedures.',
    },
    {
      botId: 51,
      botName: 'Dr. Evelyn Reed, MD',
      archetype: 'The Chief Trauma Surgeon',
      category: 'Healthcare, Medicine & Caregiving',
      avatar: '🩺',
      text: 'Cognitive Ease: Eliminate UI friction and lag. High-contrast alerts and immediate visual feedback prevent critical human errors.',
    },
    {
      botId: 61,
      botName: 'Maya Lin',
      archetype: 'The Normal High School Student',
      category: 'Education, Academia & Students',
      avatar: '🎒',
      text: 'Delightful & Fast UX: Make it gorgeous, fast, and mobile-responsive! If it looks boring or requires reading a manual, users will bounce.',
    },
    {
      botId: 71,
      botName: 'Marcus Vance',
      archetype: 'The Street Beggar & Urban Philosopher',
      category: 'Society, Street Wisdom & Daily Life',
      avatar: '🛖',
      text: 'Universal Dignity & Free Access: Cut the corporate jargon. Guarantee 100% free accessibility with dignity for those with zero money or high-end gadgets.',
    },
    {
      botId: 85,
      botName: 'Camille Laurent',
      archetype: 'Haute Couture Illustrator',
      category: 'Arts, Humanities & Storytelling',
      avatar: '🎨',
      text: 'Aesthetic Soul: Apply deep aurora styling, glassmorphism, harmonious typography, and smooth micro-animations that inspire wonder.',
    },
    {
      botId: 100,
      botName: 'Commander Nova Vance',
      archetype: 'Lunar Base Habitat Director',
      category: 'Science & Future Frontiers',
      avatar: '🌕',
      text: 'Autonomous Resilience: Closed-loop architecture with bundled assets, deterministic state, and zero single points of failure.',
    },
  ];

  for (let r = 0; r < representativeVoices.length; r++) {
    const v = representativeVoices[r];
    const bot = allBots.find((b) => b.id === v.botId);
    if (bot && !bot.enabled) continue; // Respect user permissions

    const debateMsg: DebateMessage = {
      id: `msg-${Date.now()}-${r}`,
      botId: v.botId,
      botName: v.botName,
      archetype: v.archetype,
      category: v.category,
      avatar: v.avatar,
      text: v.text,
      round: Math.floor(r / 3) + 1,
      timestamp: Date.now(),
    };

    callbacks?.onDebateMessage?.(debateMsg);
    callbacks?.onBotUpdate?.(v.botId, 'debating', v.text);
    await new Promise((res) => setTimeout(res, 80));
  }

  // Phase 4: Reaching 100-Person Consensus
  callbacks?.onPhaseChange?.('consensus', 90);
  for (const b of activeBots) {
    callbacks?.onBotUpdate?.(b.id, 'consensus', 'Voted in favor of universal human consensus.');
  }
  await new Promise((r) => setTimeout(r, 200));

  // Synthesize consensus summary
  const consensusSummary = `100-PERSON HUMAN CONSENSUS ARCHITECTURE:
• 🌾 Agricultural & Field Usability: High-contrast daylight readability & offline resilience.
• 🔧 Technician Modularity: Clean component separation, diagnostic logging & easily repairable code.
• ⚖️ Legal & Privacy Safeguards: Strict privacy protection, transparent terms & zero dark patterns.
• 📊 Financial Precision: Exact numerical calculations, audit trails & transparent value presentation.
• 🎖️ Mission-Critical Defense: Zero unhandled exceptions, resilient error boundaries & rapid recovery.
• 🩺 Healthcare Cognitive Clarity: Instantaneous feedback, low cognitive friction & accessible contrast.
• 🎒 Student & Educational Engagement: Snappy mobile UX, intuitive modern flows & inspiring interactive learning.
• 🛖 Street Dignity & Universal Access: 100% free accessibility without elitist barriers or paywalls.
• 🎨 Artistic & Narrative Soul: Radiant neon glassmorphism, refined typography & smooth micro-transitions.
• 🚀 Frontier Future-Proofing: Self-contained assets, deterministic state & zero single points of failure.`;

  callbacks?.onConsensusReady?.(consensusSummary);

  // Phase 5: Complete
  callbacks?.onPhaseChange?.('complete', 100);
  for (const b of activeBots) {
    callbacks?.onBotUpdate?.(b.id, 'complete', 'Consensus established. Directing autonomous generation.');
  }

  return consensusSummary;
}
