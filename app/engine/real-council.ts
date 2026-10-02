import type { HumanPersona } from './personifications.ts';

export interface AgentContribution {
  agentId: number;
  critique: string;
  recommendation: string;
  raw: string;
}

export type CouncilMode = 'swarm' | 'relay';
export type CouncilScope = 'quick' | 'standard' | 'full';

export type CouncilEvent =
  | { type: 'start'; total: number; scope?: CouncilScope }
  | { type: 'agent'; completed: number; total: number; contribution: AgentContribution }
  | { type: 'agent_error'; completed: number; total: number; agentId: number; error: string }
  | {
      type: 'progress';
      requested: number;
      queued: number;
      running: number;
      succeeded: number;
      failed: number;
    }
  | { type: 'group_summary'; groupIndex: number; botIds: number[]; summary: string }
  | {
      type: 'complete';
      completed: number;
      total: number;
      contributions: AgentContribution[];
      consensus: string;
      failedBotIds?: number[];
      fallback?: boolean;
    }
  | { type: 'error'; completed: number; total: number; error: string };

export function parseAgentContribution(agentId: number, raw: string): AgentContribution {
  const clean = raw.trim().replace(/^```(?:json|text)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!clean || /^json\s*[:{[]?\s*$/i.test(clean)) throw new Error('Model returned no usable advice');
  try {
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed === 'object') {
      const critique = String(parsed.critique || parsed.issue || '').trim();
      const recommendation = String(parsed.recommendation || parsed.suggestion || '').trim();
      if (recommendation) return { agentId, critique: critique.slice(0, 1200), recommendation: recommendation.slice(0, 1600), raw: clean };
    }
  } catch { /* Plain text is preferred. */ }
  if (/^[\[{]/.test(clean) || clean.length < 12 || clean.split(/\s+/).length < 3) throw new Error('Model returned incomplete advice');
  const match = clean.match(/(?:^|\n)(?:issue|critique|risk)\s*:\s*([\s\S]*?)(?:\n(?:suggestion|recommendation|action)\s*:|$)([\s\S]*)/i);
  const critique = match ? match[1].trim() : '';
  const recommendation = match ? (match[2].trim() || critique) : clean;
  return { agentId, critique: critique.slice(0, 1200), recommendation: recommendation.slice(0, 1600), raw: clean };
}

/**
 * Run real council with adaptive concurrency scaling, failure isolation, and hierarchical chunked synthesis.
 */
export async function runRealCouncil(options: {
  personas: HumanPersona[];
  prompt: string;
  mode: CouncilMode;
  scope?: CouncilScope;
  hierarchicalSynthesis?: boolean;
  generate: (persona: HumanPersona, previous: string, signal?: AbortSignal) => Promise<string>;
  synthesize: (contributions: AgentContribution[], signal?: AbortSignal) => Promise<string>;
  emit: (event: CouncilEvent) => void;
  signal?: AbortSignal;
  maxConcurrency?: number;
  isLocalInference?: boolean;
  initialContributions?: AgentContribution[];
}): Promise<void> {
  const active = options.personas.filter((persona) => persona.enabled !== false);
  const total = active.length;
  const contributions: AgentContribution[] = (options.initialContributions || []).filter((item, index, all) =>
    active.some((persona) => persona.id === item.agentId) && all.findIndex((c) => c.agentId === item.agentId) === index);
  const pending = active.filter((persona) => !contributions.some((item) => item.agentId === persona.id));
  const failedBotIds: number[] = [];

  options.emit({ type: 'start', total, scope: options.scope || (total <= 12 ? 'quick' : total <= 24 ? 'standard' : 'full') });

  if (!total) {
    options.emit({ type: 'error', completed: 0, total, error: 'No agents are enabled.' });
    return;
  }

  // Adaptive concurrency controls
  const isLocal = options.isLocalInference ?? false;
  const maxCap = Math.max(1, Math.min(8, options.maxConcurrency ?? (isLocal ? 2 : 8)));
  let currentConcurrency = Math.min(total, maxCap, isLocal ? 1 : 2);
  let consecutiveSuccesses = 0;

  let queued = pending.length;
  let running = 0;
  let succeeded = contributions.length;
  let failed = 0;

  const emitProgress = () => {
    options.emit({
      type: 'progress',
      requested: total,
      queued,
      running,
      succeeded,
      failed,
    });
  };

  const runOne = async (persona: HumanPersona, previous: string) => {
    let lastError: Error | null = null;
    // Allow up to 1 corrective retry for empty/truncated answers
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = (await options.generate(persona, previous, options.signal)).trim();
        if (!response) throw new Error('Model returned an empty response');
        const contribution = parseAgentContribution(persona.id, response);
        contributions.push(contribution);
        succeeded++;
        consecutiveSuccesses++;

        // Scale concurrency up after 5 consecutive successes without throttling
        if (consecutiveSuccesses >= 5 && currentConcurrency < maxCap) {
          currentConcurrency++;
          consecutiveSuccesses = 0;
        }
        options.emit({ type: 'agent', completed: contributions.length, total, contribution });
        return;
      } catch (error: any) {
        lastError = error;
        // On rate limit or timeout, drop concurrency
        if (error.statusCode === 429 || /rate|quota|timeout/i.test(error.message)) {
          currentConcurrency = Math.max(1, Math.floor(currentConcurrency / 2));
          consecutiveSuccesses = 0;
        }
        if (!/Model returned/.test(error.message) || options.signal?.aborted) break;
      }
    }

    failed++;
    failedBotIds.push(persona.id);
    consecutiveSuccesses = 0;
    if (!options.signal?.aborted) {
      options.emit({
        type: 'agent_error',
        completed: contributions.length,
        total,
        agentId: persona.id,
        error: lastError?.message || 'Agent failed to generate response',
      });
    }
  };

  if (options.mode === 'relay') {
    for (const persona of pending) {
      if (options.signal?.aborted) return;
      queued--;
      running++;
      emitProgress();
      await runOne(persona, contributions.at(-1)?.recommendation || '');
      running--;
      emitProgress();
    }
  } else {
    // Dynamic Swarm Queue Worker
    let cursor = 0;
    const runWorker = async () => {
      while (!options.signal?.aborted && cursor < pending.length) {
        if (running >= currentConcurrency) {
          await new Promise((r) => setTimeout(r, 20));
          continue;
        }
        const persona = pending[cursor++];
        queued--;
        running++;
        emitProgress();
        await runOne(persona, '');
        running--;
        emitProgress();
      }
    };

    const workerPromises: Promise<void>[] = [];
    for (let i = 0; i < currentConcurrency; i++) {
      workerPromises.push(runWorker());
    }

    // Monitor dynamically if concurrency scaled up and more workers can be launched
    while (cursor < pending.length && !options.signal?.aborted) {
      if (workerPromises.length < currentConcurrency) {
        workerPromises.push(runWorker());
      }
      await new Promise((r) => setTimeout(r, 20));
    }

    await Promise.all(workerPromises);
  }

  if (options.signal?.aborted) return;

  if (!contributions.length) {
    options.emit({
      type: 'error',
      completed: 0,
      total,
      error: 'Every agent call failed. Check the model connection and rate limits.',
    });
    return;
  }

  // Synthesis: direct when input fits or hierarchical when explicitly requested/oversized
  try {
    let consensus = '';
    if (!options.hierarchicalSynthesis || contributions.length <= 20) {
      consensus = await options.synthesize(contributions, options.signal);
    } else {
      // Chunk into groups of 20
      const groupSize = 20;
      const groupSummaries: AgentContribution[] = [];

      for (let i = 0; i < contributions.length; i += groupSize) {
        const group = contributions.slice(i, i + groupSize);
        const groupBotIds = group.map((c) => c.agentId);
        const groupSummaryText = await options.synthesize(group, options.signal);
        options.emit({
          type: 'group_summary',
          groupIndex: Math.floor(i / groupSize) + 1,
          botIds: groupBotIds,
          summary: groupSummaryText,
        });

        groupSummaries.push({
          agentId: groupBotIds[0],
          critique: `Group ${Math.floor(i / groupSize) + 1} (${groupBotIds.length} specialists)`,
          recommendation: groupSummaryText,
          raw: groupSummaryText,
        });
      }

      // Final hierarchical synthesis across group summaries
      consensus = await options.synthesize(groupSummaries, options.signal);
    }

    if (!consensus.trim()) throw new Error('Synthesis returned an empty response');

    options.emit({
      type: 'complete',
      completed: contributions.length,
      total,
      contributions,
      consensus,
      failedBotIds: failedBotIds.length > 0 ? failedBotIds : undefined,
    });
  } catch (error) {
    if (options.signal?.aborted) return;
    const advice = contributions
      .slice(0, 15)
      .map((item) => `- **Bot #${item.agentId}:** ${item.recommendation}`)
      .join('\n');
    const consensus = `## Responses received\n${contributions.length} of ${total} bots gave usable advice. (Summary generation failed: ${(error as Error).message})\n\n## Direct specialist advice\n${advice}\n\nOpen individual replies to review all ${contributions.length} responses.`;
    options.emit({
      type: 'complete',
      completed: contributions.length,
      total,
      contributions,
      consensus,
      failedBotIds,
      fallback: true,
    });
  }
}
