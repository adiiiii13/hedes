import { DEFAULT_100_PERSONAS, type HumanPersona } from './personifications';
import { readNdjson } from '~/utils/ndjson';
import type { CouncilEvent } from './real-council';
import type { CustomProviderConfig } from '~/types/model';

export interface RelayAgentStep {
  agentId: number;
  persona: HumanPersona;
  status: 'pending' | 'active' | 'completed' | 'failed';
  inputFromPrevious: string;
  critique: string;
  amendment: string;
  timestamp: string;
}
export interface RelayConsensus {
  coreDecision: string;
  summary: string;
  pillarDecisions: Array<{ category: string; avatar: string; consensus: string }>;
  actionSteps: string[];
  totalAgentsProcessed: number;
  totalTimeMs: number;
}
export interface RelayProgressState {
  isActive: boolean;
  isPaused: boolean;
  currentAgentIndex: number;
  progressPercent: number;
  currentAgent: HumanPersona | null;
  previousAgent: HumanPersona | null;
  history: RelayAgentStep[];
  accumulatedProposal: string;
  finalConsensus: RelayConsensus | null;
  error?: string;
  warning?: string;
}

export class SubagentRelayEngine {
  private personas: HumanPersona[];
  private controller = new AbortController();
  private history: RelayAgentStep[] = [];
  private currentIndex = 0;
  private onUpdate?: (state: RelayProgressState) => void;
  private accumulatedProposal = '';
  private error = '';
  private warning = '';
  private finalConsensus: RelayConsensus | null = null;
  private options: { userPrompt: string; model?: string; provider?: string; apiKey?: string; customProviders?: CustomProviderConfig[]; ollamaBaseUrl?: string };
  constructor(options: {
    userPrompt: string;
    userProfile?: { name?: string; role?: string; perspective?: string };
    customPersonas?: HumanPersona[];
    speedMs?: number;
    model?: string;
    provider?: string;
    apiKey?: string;
    customProviders?: CustomProviderConfig[];
    ollamaBaseUrl?: string;
    onUpdate?: (state: RelayProgressState) => void;
  }) {
    this.options = options;
    this.personas = options.customPersonas?.length === 100 ? options.customPersonas : DEFAULT_100_PERSONAS;
    this.onUpdate = options.onUpdate;
  }
  public cancel() { this.controller.abort(); }
  public getHistory() { return [...this.history]; }
  public getAccumulatedProposal() { return this.accumulatedProposal; }
  private emit() {
    this.onUpdate?.({
      isActive: !this.controller.signal.aborted && !this.finalConsensus && !this.error,
      isPaused: false,
      currentAgentIndex: this.currentIndex,
      progressPercent: Math.round(this.history.length / this.personas.filter((p) => p.enabled !== false).length * 100) || 0,
      currentAgent: this.personas[this.currentIndex] || null,
      previousAgent: this.currentIndex > 0 ? this.personas[this.currentIndex - 1] : null,
      history: [...this.history],
      accumulatedProposal: this.accumulatedProposal,
      finalConsensus: this.finalConsensus,
      error: this.error,
      warning: this.warning,
    });
  }
  public async run(): Promise<RelayConsensus> {
    const started = Date.now();
    this.emit();
    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'relay', prompt: this.options.userPrompt, personas: this.personas, provider: this.options.provider, model: this.options.model, apiKey: this.options.apiKey, customProviders: this.options.customProviders, ollamaBaseUrl: this.options.ollamaBaseUrl }),
      signal: this.controller.signal,
    });
    if (!response.ok) throw new Error((await response.text()).slice(0, 500));
    await readNdjson<CouncilEvent>(response, (event) => {
      if (event.type === 'agent') {
        const persona = this.personas.find((p) => p.id === event.contribution.agentId);
        if (!persona) return;
        const previous = this.history.at(-1)?.amendment || this.options.userPrompt;
        this.history.push({ agentId: persona.id, persona, status: 'completed', inputFromPrevious: previous, critique: event.contribution.critique, amendment: event.contribution.recommendation, timestamp: new Date().toISOString() });
        this.accumulatedProposal = event.contribution.recommendation;
        this.currentIndex = this.personas.findIndex((p) => p.id === persona.id) + 1;
      } else if (event.type === 'agent_error') {
        const persona = this.personas.find((p) => p.id === event.agentId);
        if (persona) this.history.push({ agentId: persona.id, persona, status: 'failed', inputFromPrevious: this.accumulatedProposal, critique: event.error, amendment: '', timestamp: new Date().toISOString() });
        this.currentIndex = this.personas.findIndex((p) => p.id === event.agentId) + 1;
      } else if (event.type === 'complete') {
        if (event.completed !== event.total) this.warning = `${event.completed}/${event.total} bots replied. Summary uses successful replies.`;
        const categories = [...new Set(this.personas.map((p) => p.category))];
        this.finalConsensus = {
          coreDecision: event.consensus,
          summary: event.consensus,
          pillarDecisions: categories.map((category) => {
            const members = this.history.filter((step) => step.status === 'completed' && step.persona.category === category);
            return { category, avatar: members[0]?.persona.avatar || '•', consensus: members.map((step) => step.amendment).join(' ').slice(0, 1200) };
          }),
          actionSteps: event.contributions.slice(-10).map((item) => item.recommendation),
          totalAgentsProcessed: event.completed,
          totalTimeMs: Date.now() - started,
        };
      } else if (event.type === 'error') this.error = event.error;
      this.emit();
    });
    if (this.controller.signal.aborted) throw new Error('Relay cancelled');
    if (!this.finalConsensus) throw new Error(this.error || 'Relay ended without a verified result');
    return this.finalConsensus;
  }
}
