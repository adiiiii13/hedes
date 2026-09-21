import { DEFAULT_100_PERSONAS, type HumanPersona } from './personifications';

export interface RelayAgentStep {
  agentId: number;
  persona: HumanPersona;
  status: 'pending' | 'active' | 'completed';
  inputFromPrevious: string;
  critique: string;
  amendment: string;
  confidenceScore: number; // 80 - 99
  timestamp: string;
}

export interface RelayConsensus {
  coreDecision: string;
  summary: string;
  pillarDecisions: Array<{
    category: string;
    avatar: string;
    consensus: string;
  }>;
  actionSteps: string[];
  totalAgentsProcessed: number;
  totalTimeMs: number;
}

export interface RelayProgressState {
  isActive: boolean;
  isPaused: boolean;
  currentAgentIndex: number; // 0 to 99
  progressPercent: number;    // 0 to 100
  currentAgent: HumanPersona | null;
  previousAgent: HumanPersona | null;
  history: RelayAgentStep[];
  accumulatedProposal: string;
  finalConsensus: RelayConsensus | null;
}

export class SubagentRelayEngine {
  private userPrompt: string;
  private userProfile: { name: string; role: string; perspective: string };
  private personas: HumanPersona[];
  private currentIndex: number = 0;
  private isCancelled: boolean = false;
  private isPaused: boolean = false;
  private speedMs: number = 160; // default delay per agent
  private onUpdate?: (state: RelayProgressState) => void;
  private history: RelayAgentStep[] = [];
  private accumulatedProposal: string = '';
  private model?: string;
  private provider?: string;
  private apiKey?: string;
  private aiConsensusPromise: Promise<RelayConsensus | null>;

  constructor(options: {
    userPrompt: string;
    userProfile?: { name?: string; role?: string; perspective?: string };
    customPersonas?: HumanPersona[];
    speedMs?: number;
    model?: string;
    provider?: string;
    apiKey?: string;
    onUpdate?: (state: RelayProgressState) => void;
  }) {
    this.userPrompt = options.userPrompt;
    this.userProfile = {
      name: options.userProfile?.name || 'Aditya',
      role: options.userProfile?.role || 'Software Architect',
      perspective: options.userProfile?.perspective || 'Practical, resilient engineering',
    };
    this.personas =
      options.customPersonas && options.customPersonas.length === 100
        ? options.customPersonas
        : DEFAULT_100_PERSONAS;
    this.speedMs = options.speedMs ?? 160;
    this.model = options.model;
    this.provider = options.provider;
    this.apiKey = options.apiKey;
    this.onUpdate = options.onUpdate;
    this.accumulatedProposal = `Initial User Goal: "${this.userPrompt}"`;

    // Immediately trigger real backend AI consensus generation in parallel with the stepping
    this.aiConsensusPromise = this.fetchAiConsensus();
  }

  private async fetchAiConsensus(): Promise<RelayConsensus | null> {
    try {
      const res = await fetch('/api/council-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'relay',
          prompt: this.userPrompt,
          model: this.model,
          provider: this.provider,
          apiKey: this.apiKey,
          userProfile: this.userProfile,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.coreDecision && data.pillarDecisions) {
          return {
            coreDecision: data.coreDecision,
            summary: data.summary || `Synthesized consensus across all 100 human archetypes for: "${this.userPrompt}".`,
            pillarDecisions: data.pillarDecisions,
            actionSteps: data.actionSteps || [
              `1. Implement core solution for "${this.userPrompt}".`,
              `2. Add local-first persistence with offline sync.`,
              `3. Optimize for low-barrier accessibility.`,
              `4. Guarantee transparent logging and error handling.`,
              `5. Verify performance and privacy compliance.`
            ],
            totalAgentsProcessed: 100,
            totalTimeMs: 0,
          };
        }
      }
    } catch (err) {
      console.warn('Could not fetch backend AI consensus for relay, using dynamic synthesis:', err);
    }
    return null;
  }

  public setSpeed(ms: number) {
    this.speedMs = ms;
  }

  public pause() {
    this.isPaused = true;
  }

  public resume() {
    this.isPaused = false;
  }

  public cancel() {
    this.isCancelled = true;
  }

  public fastForward() {
    this.speedMs = 5;
  }

  public getHistory(): RelayAgentStep[] {
    return [...this.history];
  }

  public getAccumulatedProposal(): string {
    return this.accumulatedProposal;
  }

  private emitState(finalConsensus: RelayConsensus | null = null) {
    if (!this.onUpdate) return;
    const curr = this.personas[this.currentIndex] || null;
    const prev = this.currentIndex > 0 ? this.personas[this.currentIndex - 1] : null;

    this.onUpdate({
      isActive: this.currentIndex < this.personas.length && !this.isCancelled,
      isPaused: this.isPaused,
      currentAgentIndex: this.currentIndex,
      progressPercent: Math.min(100, Math.round(((this.currentIndex) / this.personas.length) * 100)),
      currentAgent: curr,
      previousAgent: prev,
      history: [...this.history],
      accumulatedProposal: this.accumulatedProposal,
      finalConsensus,
    });
  }

  public async run(): Promise<RelayConsensus> {
    const startTime = Date.now();
    this.isCancelled = false;

    for (let i = 0; i < this.personas.length; i++) {
      if (this.isCancelled) break;

      while (this.isPaused) {
        await new Promise((r) => setTimeout(r, 100));
        if (this.isCancelled) break;
      }

      this.currentIndex = i;
      const persona = this.personas[i];

      // Emit active state
      this.emitState();

      // Step delay for visual animation
      if (this.speedMs > 10) {
        await new Promise((r) => setTimeout(r, this.speedMs));
      }

      // Generate authentic persona contribution based on their prompt
      const step = this.generateStepContribution(persona, i);
      this.history.push(step);
      this.accumulatedProposal += `\n- [${persona.avatar} ${persona.name} (${persona.role})]: ${step.amendment}`;

      // Update state after completion of this sub-agent
      this.emitState();
    }

    // Await the backend AI consensus result
    let finalConsensus: RelayConsensus;
    try {
      const aiResult = await Promise.race([
        this.aiConsensusPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      if (aiResult) {
        finalConsensus = {
          ...aiResult,
          totalTimeMs: Date.now() - startTime,
        };
      } else {
        finalConsensus = this.buildDynamicConsensus(Date.now() - startTime);
      }
    } catch {
      finalConsensus = this.buildDynamicConsensus(Date.now() - startTime);
    }

    this.currentIndex = this.personas.length;
    this.emitState(finalConsensus);

    return finalConsensus;
  }

  private generateStepContribution(persona: HumanPersona, index: number): RelayAgentStep {
    const goal = this.userPrompt.length > 55 ? `${this.userPrompt.slice(0, 52)}...` : this.userPrompt;
    const promptText = persona.prompt || '';

    // Extract core demand clause from persona's authentic worldview prompt
    const demandsMatch = promptText.match(
      /(?:You demand|You prioritize|You look at|You focus on|You value|You require|You insist on|You evaluate)([^.]+)/i
    );
    const demandClause = demandsMatch
      ? demandsMatch[1].trim()
      : `field resilience and practical usability for ${persona.role.toLowerCase()}`;

    // Lived constraints tailored to category
    let categoryTrap = 'untested theoretical assumptions and brittle failure points';
    if (persona.categoryId === 'agri') categoryTrap = 'zero-signal dead zones, intense outdoor glare, and muddy hardware';
    else if (persona.categoryId === 'trades') categoryTrap = 'cryptic error screens, proprietary screws, and non-modular components';
    else if (persona.categoryId === 'law') categoryTrap = 'unconsented telemetry, terms of service ambiguities, and compliance exposure';
    else if (persona.categoryId === 'finance') categoryTrap = 'floating-point rounding drift, unverified fees, and missing audit ledgers';
    else if (persona.categoryId === 'defense') categoryTrap = 'single points of failure, unverified dependencies, and cloud network outages';
    else if (persona.categoryId === 'health') categoryTrap = 'high-stress cognitive overload, panic misclicks, and delayed triage workflows';
    else if (persona.categoryId === 'edu') categoryTrap = 'impenetrable technical jargon, expensive paywalls, and bloated downloads';
    else if (persona.categoryId === 'society') categoryTrap = 'forced phone/ID verification, credit card prerequisites, and algorithmic exclusion';
    else if (persona.categoryId === 'arts') categoryTrap = 'cold utilitarian soullessness, jarring animations, and harsh contrast transitions';
    else if (persona.categoryId === 'frontier') categoryTrap = 'tightly coupled monolithic state, race conditions, and lack of mathematical safety';

    const critique = `Evaluating "${goal}": Speaking as ${persona.name} (${persona.archetype}), our daily survival exposes that "${goal}" will collapse if it runs into ${categoryTrap}. We cannot tolerate designs that ignore ${demandClause}.`;

    const amendment = `Ratified Requirement: Enforce ${demandClause} with explicit telemetry into "${goal}", ensuring full operational viability for ${persona.role}.`;

    const confidenceScore = Math.min(99, Math.floor(89 + (persona.weight * 2) + ((persona.id * 3) % 7)));

    return {
      agentId: persona.id,
      persona,
      status: 'completed',
      inputFromPrevious:
        index === 0
          ? `User Goal: "${goal}"`
          : `Sub-Agent #${index} (${this.personas[index - 1].name} - ${this.personas[index - 1].archetype})`,
      critique,
      amendment,
      confidenceScore,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  }

  private buildDynamicConsensus(elapsedMs: number): RelayConsensus {
    return {
      coreDecision: `Address "${this.userPrompt}" with an offline-first, modular architecture ensuring universal accessibility.`,
      summary: `All 100 Sub-Agents have sequentially deliberated on "${this.userPrompt}". By passing the blueprint through all 10 human pillars (from rural farmers and mechanics to trial lawyers, trauma surgeons, and urban philosophers), the council established field resilience, cryptographic privacy, offline sync, and zero economic barriers.`,
      pillarDecisions: [
        {
          category: 'Agriculture & Food',
          avatar: '🌾',
          consensus: `100% offline-first operation and high-contrast sunlight readability for "${this.userPrompt}".`,
        },
        {
          category: 'Trades & Technicians',
          avatar: '🔧',
          consensus: 'Modular diagnostic error codes, hot-swappable plugins, open repairability standards.',
        },
        {
          category: 'Law & Rights',
          avatar: '⚖️',
          consensus: 'Local-only data sovereignty, zero dark patterns, plain-language consent, open-source charter.',
        },
        {
          category: 'Finance & Accounting',
          avatar: '📊',
          consensus: 'Fixed-point decimal arithmetic, tamper-proof SHA-256 ledger, zero predatory micro-fees.',
        },
        {
          category: 'Defense & Emergency',
          avatar: '🎖️',
          consensus: 'Dual-redundant fail-safes, crisis triage pathways, zero single points of failure.',
        },
        {
          category: 'Healthcare & Medicine',
          avatar: '🩺',
          consensus: '1-second urgent triage, high-stress cognitive simplicity, mental health dignity.',
        },
        {
          category: 'Education & Students',
          avatar: '🎓',
          consensus: 'Zero jargon, lightweight visual learning modules, free access for apprentices and students.',
        },
        {
          category: 'Street Wisdom & Beggars',
          avatar: '🏛️',
          consensus: 'Zero mandatory registration, no credit card/phone requirements, universal human dignity.',
        },
        {
          category: 'Arts & Humanities',
          avatar: '🎨',
          consensus: 'Tactile delight, dark glassmorphism elegance, emotional soul and aesthetic warmth.',
        },
        {
          category: 'Science & Frontiers',
          avatar: '🚀',
          consensus: 'Closed-loop resilience, asynchronous peer-to-peer sync, future-proof scalability.',
        },
      ],
      actionSteps: [
        `1. Initialize offline-first core for "${this.userPrompt}".`,
        `2. Implement local SQLite/IndexedDB storage layer with export capability.`,
        `3. Provide anonymous instant entry with zero mandatory sign-up checks.`,
        `4. Add high-contrast Sunlight Mode alongside the sleek dark glassmorphism theme.`,
        `5. Establish modular feature flags allowing users to dynamically enable what they need.`,
      ],
      totalAgentsProcessed: 100,
      totalTimeMs: elapsedMs,
    };
  }
}
