import { data as json, type ActionFunctionArgs } from 'react-router';
import { generateText } from 'ai';
import { providerRegistry } from '~/llm/registry';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { validateProjectId } from '~/utils/project-dir.server';
import { listMemory, upsertMemory } from '~/utils/memory.server';
import { listSkills, saveSkill } from '~/utils/skills.server';
import type { CustomProviderConfig } from '~/types/model';

function parseReview(text: string): { facts: Array<{ title: string; content: string; tags?: string[] }>; skill?: { name: string; description: string; instructions: string } } {
  const source = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(source);
  return { facts: Array.isArray(value.facts) ? value.facts.slice(0, 3) : [], skill: value.skill || undefined };
}

const secretPattern = /(?:sk-[a-zA-Z0-9_-]{16,}|gsk_[a-zA-Z0-9_-]{16,}|AIza[a-zA-Z0-9_-]{20,}|(?:api[_-]?key|password|token|secret)\s*[:=]\s*\S+)/gi;

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const body = await request.json();
    const projectId = validateProjectId(String(body.chatId || ''));
    const user = String(body.user || '').slice(0, 4000);
    const assistant = String(body.assistant || '').slice(0, 6000);
    const completedActions = Array.isArray(body.completedActions) ? body.completedActions.filter((value: unknown) => typeof value === 'string').slice(0, 30) as string[] : [];
    const failedActions = Number(body.failedActions || 0);
    if (!user || !assistant) return json({ factsAdded: 0, skillAdded: false, skipped: 'Empty turn' });
    const safeUser = user.replace(secretPattern, '[redacted]');
    const safeAssistant = assistant.replace(secretPattern, '[redacted]');
    const provider = String(body.provider || 'Ollama');
    const model = String(body.model || '');
    const customProviders: CustomProviderConfig[] = Array.isArray(body.customProviders) ? body.customProviders : [];
    const apiKey = String(body.apiKey || '') || ({
      groq: process.env.GROQ_API_KEY, openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY,
      google: process.env.GOOGLE_GENERATIVE_AI_API_KEY, openrouter: process.env.OPENROUTER_API_KEY,
    } as Record<string, string | undefined>)[provider.toLowerCase()];
    const languageModel = providerRegistry.getModel(provider, model, { apiKey, baseUrl: body.ollamaBaseUrl || body.baseUrl }, customProviders);
    const old = await listMemory(projectId);
    const review = await generateText({
      model: languageModel,
      system: 'Review one finished assistant turn for durable learning. Return ONLY JSON: {"facts":[{"title":"...","content":"...","tags":["..."]}],"skill":null or {"name":"lowercase-hyphenated","description":"...","instructions":"..."}}. Facts must be explicit user preferences or verified project facts from the given turn, not guesses, transient tasks, secrets, or claims of success without evidence. Maximum 3 concise facts. A skill is allowed only if completed actions show a reusable, concrete procedure and failedActions is zero; otherwise skill must be null. Skill instructions must be general steps grounded in the completed actions. Do not copy user source code or secrets. If nothing durable, return empty facts and null skill.',
      prompt: `User request:\n${safeUser}\n\nAssistant response:\n${safeAssistant}\n\nCompleted app actions:\n${completedActions.join('\n') || '(none)'}\nFailed actions: ${failedActions}\nExisting memory titles: ${old.map((item) => item.title).slice(-40).join('; ')}`,
      maxOutputTokens: 700,
      temperature: 0,
    });
    const parsed = parseReview(review.text);
    let factsAdded = 0;
    let rootId = old.find((item) => item.parentId === null && item.title === 'Learned from chats')?.id;
    for (const fact of parsed.facts) {
      const title = String(fact.title || '').trim().slice(0, 120);
      const content = String(fact.content || '').trim().slice(0, 600);
      secretPattern.lastIndex = 0;
      if (!title || !content || secretPattern.test(title + content)) continue;
      const existing = (await listMemory(projectId)).find((item) => item.title.toLowerCase() === title.toLowerCase());
      if (existing?.content === content) continue;
      if (!rootId) {
        const nodes = await upsertMemory(projectId, { title: 'Learned from chats', content: 'Durable facts reviewed after completed conversations.', tags: ['auto'], pinned: false });
        rootId = nodes.find((item) => item.title === 'Learned from chats')?.id;
      }
      await upsertMemory(projectId, { id: existing?.id, parentId: existing?.parentId || rootId || null, title, content, tags: ['auto-learned', ...(Array.isArray(fact.tags) ? fact.tags.slice(0, 4) : [])], pinned: false });
      factsAdded++;
    }
    let skillAdded = false;
    if (completedActions.length >= 2 && failedActions === 0 && parsed.skill) {
      const skill = parsed.skill;
      const installed = await listSkills();
      secretPattern.lastIndex = 0;
      if (!installed.some((item) => item.name === skill.name) && !secretPattern.test(JSON.stringify(skill))) {
        await saveSkill({ ...skill, status: 'draft', enabled: false, sourceRunId: String(body.runId || 'learning-review') });
        skillAdded = true;
      }
    }
    return json({ factsAdded, skillAdded });
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 400 });
  }
}
