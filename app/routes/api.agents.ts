import { type ActionFunctionArgs } from 'react-router';
import { generateText } from 'ai';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { runRealCouncil, type AgentContribution, type CouncilEvent } from '~/engine/real-council';
import type { HumanPersona } from '~/engine/personifications';
import type { CustomProviderConfig } from '~/types/model';
import { executeWithGateway } from '~/llm/gateway.server';
import { validateProjectId } from '~/utils/project-dir.server';
import { getOrCreateDurableRun, emitRunEvent, updateRunStatus } from '~/utils/runs.server';

const terminalStatuses = new Set(['completed', 'completed-with-failures', 'failed', 'cancelled', 'interrupted']);

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let body: any;
  try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
  const prompt = String(body.prompt || '').trim();
  const provider = String(body.provider || DEFAULT_PROVIDER);
  const model = String(body.model || DEFAULT_MODEL);
  const mode = body.mode === 'relay' ? 'relay' : 'swarm';
  let personas: HumanPersona[] = body.personas;
  const customProviders: CustomProviderConfig[] = Array.isArray(body.customProviders) ? body.customProviders : [];
  if (!prompt || prompt.length > 12000 || !Array.isArray(personas) || personas.length !== 100 ||
      personas.some((p) => !p || !Number.isInteger(p.id) || p.id < 1 || p.id > 100 || typeof p.prompt !== 'string' || p.prompt.length > 1500) ||
      new Set(personas.map((p) => p.id)).size !== 100) {
    return new Response('A prompt and 100 valid persona definitions are required', { status: 400 });
  }
  const scope = body.scope === 'quick' ? 'quick' : body.scope === 'standard' ? 'standard' : 'full';
  const limit = scope === 'quick' ? 12 : scope === 'standard' ? 24 : 100;
  personas = personas.map((p, i) => ({ ...p, enabled: p.enabled !== false && i < limit }));
  let identity;
  try {
    identity = await getOrCreateDurableRun({
      runId: body.runId, idempotencyKey: body.idempotencyKey,
      projectId: validateProjectId(String(body.projectId || body.chatId || 'default-project')),
      chatId: validateProjectId(String(body.chatId || body.projectId || 'default-chat')),
      type: mode === 'relay' ? 'relay' : 'council', provider, model,
      requestSnapshot: { prompt, mode, scope, personas: personas.map((p) => ({ id: p.id, prompt: p.prompt, enabled: p.enabled })) },
    });
  } catch (error) { return new Response((error as Error).message, { status: 400 }); }
  const { run, isExisting, handle } = identity;
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: any) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(JSON.stringify({ ...event, runId: run.runId }) + '\n')); }
        catch { closed = true; }
      };
      const close = () => { if (!closed) { closed = true; try { controller.close(); } catch {} } unsubscribe(); };
      const subscriber = (event: any) => {
        send({ ...event.payload, seq: event.seq });
        if (['complete', 'error'].includes(event.type) || (event.type === 'status-change' && terminalStatuses.has(event.payload.status))) close();
      };
      for (const event of run.events) send({ ...event.payload, seq: event.seq });
      if (isExisting && (!body.resume || !terminalStatuses.has(run.status))) {
        if (terminalStatuses.has(run.status)) { close(); return; }
        handle.subscribers.add(subscriber);
        unsubscribe = () => handle.subscribers.delete(subscriber);
        return;
      }
      handle.subscribers.add(subscriber);
      unsubscribe = () => handle.subscribers.delete(subscriber);
      let eventQueue = Promise.resolve();
      if (isExisting && body.resume) handle.abortController = new AbortController();
      const signal = handle.abortController.signal;
      const emit = (event: CouncilEvent) => {
        eventQueue = eventQueue.then(async () => {
          await emitRunEvent(run.runId, event.type, event);
          if (event.type === 'complete') await updateRunStatus(run.runId,
            event.completed === event.total ? 'completed' : 'completed-with-failures', undefined,
            { contributions: event.contributions, result: event.consensus, fallback: event.fallback });
          if (event.type === 'error') await updateRunStatus(run.runId, 'failed', event.error);
        });
      };
      const generate = (system: string, input: string, maxOutputTokens: number) => executeWithGateway({
        provider, model, credentialId: body.credentialId, explicitApiKey: body.apiKey,
        baseUrl: body.ollamaBaseUrl || body.baseUrl, customProviders, signal,
        reservedOutputTokens: maxOutputTokens, estimatedInputTokens: Math.ceil((system.length + input.length) / 3),
        operation: async (languageModel, abortSignal) => (await generateText({
          model: languageModel, system, prompt: input, maxOutputTokens, temperature: 0.35, abortSignal, maxRetries: 0,
        })).text,
      });
      const seeds = new Map<number, AgentContribution>();
      if (isExisting && body.resume) {
        for (const event of run.events) if (event.type === 'agent') seeds.set(event.payload.contribution.agentId, event.payload.contribution);
      }
      void (async () => {
        try {
          await updateRunStatus(run.runId, 'running');
          await runRealCouncil({
            personas, prompt, mode, scope, signal, emit, hierarchicalSynthesis: true,
            initialContributions: [...seeds.values()],
            isLocalInference: /ollama/i.test(provider) || /localhost|127\.0\.0\.1/.test(body.baseUrl || body.ollamaBaseUrl || customProviders.find((p) => p.id === provider)?.baseUrl || ''),
            maxConcurrency: /groq/i.test(provider) ? 2 : customProviders.length ? 4 : 8,
            generate: (persona, previous) => generate(
              `You are an AI specialist: ${persona.name}, ${persona.archetype}, ${persona.role}. ${persona.prompt}. Give relevant advice in 2-4 complete sentences. Write plain prose, no JSON. Explain your concrete recommendation. Never claim unperformed verification.`,
              `Task: ${prompt}\n${previous ? `Previous advice: ${previous}` : ''}`, 512),
            synthesize: (contributions) => generate(
              'Synthesize the supplied specialist advice into a useful answer to the original task. Preserve important disagreements and agent IDs. Give best approach, reasons, risks and next steps. Group summaries represent multiple agents; do not invent vote counts or claim executed tests.',
              `Task: ${prompt}\nEnabled bots: ${personas.filter((p) => p.enabled).length}\nAdvice:\n${contributions.map((c) => `Bot/group #${c.agentId} ${c.critique}: ${c.recommendation}`).join('\n')}`, 1800),
          });
          await eventQueue;
          if (signal.aborted) await updateRunStatus(run.runId, 'cancelled');
        } catch (error) {
          await updateRunStatus(run.runId, signal.aborted ? 'cancelled' : 'failed', (error as Error).message).catch(() => undefined);
          send({ type: 'error', completed: 0, total: personas.filter((p) => p.enabled).length, error: (error as Error).message });
        } finally { close(); }
      })();
    },
    cancel() { unsubscribe(); },
  });
  return new Response(stream, { headers: {
    'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Hedes-Run-Id': run.runId,
  } });
}
