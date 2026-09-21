import { type ActionFunctionArgs } from '@remix-run/node';
import { generateText } from 'ai';
import { providerRegistry } from '~/llm/registry';
import { HUMAN_PERSONAS_100, type HumanPersona } from '~/engine/personifications';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';

const DEFAULT_FALLBACK_GROQ_KEY = process.env.GROQ_API_KEY || '';

function resolveServerApiKey(provider: string, clientKey?: string): string | undefined {
  if (clientKey && clientKey.trim()) return clientKey.trim();

  const p = provider.toLowerCase();
  if (p === 'groq') return process.env.GROQ_API_KEY || DEFAULT_FALLBACK_GROQ_KEY;
  if (p === 'grok' || p === 'xai') return process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (p === 'openai') return process.env.OPENAI_API_KEY;
  if (p === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (p === 'google') return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (p === 'openrouter') return process.env.OPENROUTER_API_KEY;
  if (p.includes('deepseek')) return process.env.DEEPSEEK_API_KEY;
  if (p.includes('mistral')) return process.env.MISTRAL_API_KEY;
  if (p.includes('together')) return process.env.TOGETHER_API_KEY;

  return undefined;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json();
    const {
      mode = 'assembly', // 'assembly' | 'direct'
      personaId,
      messages = [],
      userProfile = {
        name: 'Aditya',
        role: 'Software Architect & Builder',
        perspective: 'Values practical, intuitive, resilient engineering.',
      },
      model = DEFAULT_MODEL,
      provider = DEFAULT_PROVIDER,
      apiKey,
      customProviders = [],
      ollamaBaseUrl,
      baseUrl,
    } = body;

    let targetProvider = provider;
    let targetModel = model;
    let resolvedApiKey = resolveServerApiKey(provider, apiKey);
    const isOllama = targetProvider.toLowerCase().includes('ollama');

    // If provider is unknown/unsupported (e.g. omni/antigravity) or has no API key and isn't Ollama, route to Groq
    if (
      (!isOllama && !resolvedApiKey) ||
      targetProvider.toLowerCase() === 'omni' ||
      targetProvider.toLowerCase() === 'antigravity'
    ) {
      targetProvider = 'Groq';
      targetModel = 'openai/gpt-oss-120b';
      resolvedApiKey = DEFAULT_FALLBACK_GROQ_KEY;
    }

      // ── 1. Direct 1-on-1 Consultation Mode ──────────────────────────────────
    if (mode === 'direct' && personaId !== undefined) {
      const persona =
        HUMAN_PERSONAS_100.find((p: HumanPersona) => p.id === personaId) || HUMAN_PERSONAS_100[0];

      const systemPrompt = `You are ${persona.name}, ${persona.archetype} (${persona.role}) from the category "${persona.category}".
Avatar: ${persona.avatar}
Your Core Human Persona & Worldview:
"${persona.prompt}"

You are engaged in a direct 1-on-1 consultation with ${userProfile.name}, who is a ${userProfile.role}.
Their Human Perspective:
"${userProfile.perspective || 'Focuses on building impactful, durable tools.'}"

INSTRUCTIONS FOR YOUR RESPONSE:
1. Stay 100% in character as ${persona.name}. Speak with the authentic voice, trade terminology, everyday realities, and practical concerns of your profession and lived experience.
2. Address ${userProfile.name} respectfully as an equal human partner.
3. Bring your unique viewpoint to bear on their questions or dilemmas. Give concrete, REAL-WORLD EXAMPLES from your trade or life. If their ideas neglect the ground reality of your field (e.g. soil conditions, legal liabilities, street accessibility, server outages, emergency room triage, accounting precision), explain why and offer practical alternatives.
4. Format your response cleanly with clear paragraphs, bold highlights, and authentic human warmth.
5. Do NOT break character or sound like a generic AI assistant.`;

      // Filter messages to valid user/assistant turns
      const validMessages = (messages || [])
        .filter((m: any) => m.content && typeof m.content === 'string' && m.content.trim())
        .map((m: any) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content.trim(),
        }));

      // Ensure at least one user message
      if (validMessages.length === 0 || validMessages[validMessages.length - 1].role !== 'user') {
        validMessages.push({ role: 'user', content: 'Hello, please share your thoughts from your perspective.' });
      }

      try {
        const languageModel = providerRegistry.getModel(
          targetProvider,
          targetModel,
          { apiKey: resolvedApiKey, baseUrl: ollamaBaseUrl || baseUrl },
          customProviders
        );

        const { text } = await generateText({
          model: languageModel,
          system: systemPrompt,
          messages: validMessages,
          temperature: 0.7,
        });

        return new Response(text, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      } catch (err) {
        console.warn('Primary model failed in 1-on-1, falling back to Groq 120B:', err);
        try {
          const fallbackModel = providerRegistry.getModel('Groq', 'openai/gpt-oss-120b', {
            apiKey: DEFAULT_FALLBACK_GROQ_KEY,
          });
          const { text } = await generateText({
            model: fallbackModel,
            system: systemPrompt,
            messages: validMessages,
            temperature: 0.7,
          });
          return new Response(text, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        } catch (err2) {
          return generateDirectPersonaFallback(persona, userProfile, validMessages);
        }
      }
    }

    // ── 2. 100-Subagent Sequential Relay Mode ────────────────────────────────
    if (mode === 'relay') {
      const userGoal = messages[messages.length - 1]?.content || body.prompt || 'Our initiative';
      const relaySystemPrompt = `You are the Master Synthesis Engine for the 100-Human Council.
The user ${userProfile.name} (${userProfile.role}) has submitted this goal/challenge:
"${userGoal}"

Analyze this goal through all 10 foundational human pillars:
1. Agriculture & Food (🌾)
2. Trades & Mechanics (🔧)
3. Law & Rights (⚖️)
4. Finance & Accounting (📊)
5. Defense & Emergency (🎖️)
6. Healthcare & Medicine (🩺)
7. Education & Students (🎓)
8. Street Wisdom & Urban Life (🏛️)
9. Arts & Humanities (🎨)
10. Science & Frontiers (🚀)

Respond in VALID JSON format with NO markdown fences, matching this structure:
{
  "coreDecision": "A 1-2 sentence definitive core verdict specifically addressing '${userGoal}'.",
  "summary": "A 3-4 sentence comprehensive synthesis balancing the needs of rural workers, technicians, vulnerable citizens, legal compliance, and technological durability.",
  "pillarDecisions": [
    { "category": "Agriculture & Food", "avatar": "🌾", "consensus": "Specific recommendation for '${userGoal}' from the farming lens." },
    { "category": "Trades & Technicians", "avatar": "🔧", "consensus": "Specific diagnostic and modularity recommendation." },
    { "category": "Law & Rights", "avatar": "⚖️", "consensus": "Specific user sovereignty and compliance recommendation." },
    { "category": "Finance & Accounting", "avatar": "📊", "consensus": "Specific financial precision and cost transparency recommendation." },
    { "category": "Defense & Emergency", "avatar": "🎖️", "consensus": "Specific redundancy and fail-safe recommendation." },
    { "category": "Healthcare & Medicine", "avatar": "🩺", "consensus": "Specific cognitive simplicity and urgent-path recommendation." },
    { "category": "Education & Students", "avatar": "🎓", "consensus": "Specific jargon-free accessibility recommendation." },
    { "category": "Street Wisdom & Beggars", "avatar": "🏛️", "consensus": "Specific zero-barrier, dignity-first recommendation." },
    { "category": "Arts & Humanities", "avatar": "🎨", "consensus": "Specific emotional resonance and aesthetic warmth recommendation." },
    { "category": "Science & Frontiers", "avatar": "🚀", "consensus": "Specific future-proof scalability recommendation." }
  ],
  "actionSteps": [
    "1. Immediate architectural step.",
    "2. Security & privacy step.",
    "3. Offline & field usability step.",
    "4. Cost & accessibility step.",
    "5. Long-term verification step."
  ]
}`;

      try {
        const languageModel = providerRegistry.getModel(
          targetProvider,
          targetModel,
          { apiKey: resolvedApiKey, baseUrl: ollamaBaseUrl || baseUrl },
          customProviders
        );

        const { text } = await generateText({
          model: languageModel,
          system: relaySystemPrompt,
          messages: [{ role: 'user', content: `Synthesize the 100-Human Council consensus for: "${userGoal}"` }],
          temperature: 0.6,
        });

        const cleanedJson = text.replace(/```json\s*|```\s*/g, '').trim();
        return new Response(cleanedJson, {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      } catch (err) {
        console.warn('Relay AI generation failed, falling back to Groq 120B:', err);
        try {
          const fallbackModel = providerRegistry.getModel('Groq', 'openai/gpt-oss-120b', {
            apiKey: DEFAULT_FALLBACK_GROQ_KEY,
          });
          const { text } = await generateText({
            model: fallbackModel,
            system: relaySystemPrompt,
            messages: [{ role: 'user', content: `Synthesize the 100-Human Council consensus for: "${userGoal}"` }],
            temperature: 0.6,
          });
          const cleanedJson = text.replace(/```json\s*|```\s*/g, '').trim();
          return new Response(cleanedJson, {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          });
        } catch (err2) {
          // Dynamic fallback based on prompt
          return new Response(JSON.stringify({
            coreDecision: `Address "${userGoal}" with an offline-first, modular architecture ensuring universal accessibility.`,
            summary: `The 100-Human Council deliberated on "${userGoal}". The blueprint prioritizes field resilience, clear diagnostic codes, cryptographic user privacy, and zero economic barriers.`,
            pillarDecisions: [
              { category: 'Agriculture & Food', avatar: '🌾', consensus: `Must run offline in dusty sunlight when internet fails.` },
              { category: 'Trades & Technicians', avatar: '🔧', consensus: `Provide explicit error codes and modular swappable parts.` },
              { category: 'Law & Rights', avatar: '⚖️', consensus: `Enforce local-first data ownership with plain-language terms.` },
              { category: 'Finance & Accounting', avatar: '📊', consensus: `Use fixed-point decimal math and audit logs.` },
              { category: 'Defense & Emergency', avatar: '🎖️', consensus: `Build dual redundant fallback paths with zero single failure points.` },
              { category: 'Healthcare & Medicine', avatar: '🩺', consensus: `1-second urgent triage with high-stress simplicity.` },
              { category: 'Education & Students', avatar: '🎓', consensus: `Zero jargon with lightweight interactive visual guides.` },
              { category: 'Street Wisdom & Beggars', avatar: '🏛️', consensus: `Zero mandatory registration, treating everyone with dignity.` },
              { category: 'Arts & Humanities', avatar: '🎨', consensus: `Tactile delight, dark glassmorphism, and emotional warmth.` },
              { category: 'Science & Frontiers', avatar: '🚀', consensus: `Mathematical verification and resilient asynchronous sync.` }
            ],
            actionSteps: [
              `1. Scaffold offline-first core for "${userGoal}".`,
              `2. Add local SQLite/IndexedDB persistence.`,
              `3. Provide anonymous instant entry with zero paywalls.`,
              `4. Add high-contrast mode for outdoor sunlight visibility.`,
              `5. Maintain transparent diagnostic logging.`
            ]
          }), {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          });
        }
      }
    }

    // ── 3. Assembly Deliberation Mode ────────────────────────────────────────
    const activePersonas = HUMAN_PERSONAS_100.filter((p: HumanPersona) => p.enabled);
    const selectedVoiceIds = [1, 21, 31, 51, 71]; // Farmer, Mechanic, Lawyer, Trauma Surgeon, Street Beggar & Philosopher
    const debaters = selectedVoiceIds
      .map((id) => activePersonas.find((p: HumanPersona) => p.id === id) || HUMAN_PERSONAS_100[id - 1])
      .filter(Boolean);

    const systemPrompt = `You are the Hedes 100-Human Council Deliberation Chamber.
You are facilitating a multi-perspective debate on behalf of ${userProfile.name} (${userProfile.role}), who has the following human perspective:
"${userProfile.perspective}"

For this deliberation, 5 distinct human archetypes from across society will analyze and debate the user's inquiry, followed by an actionable synthesized verdict:
1. 🌾 ${debaters[0]?.name} (${debaters[0]?.archetype}): "${debaters[0]?.prompt}"
2. 🔧 ${debaters[1]?.name} (${debaters[1]?.archetype}): "${debaters[1]?.prompt}"
3. ⚖️ ${debaters[2]?.name} (${debaters[2]?.archetype}): "${debaters[2]?.prompt}"
4. 🩺 ${debaters[3]?.name} (${debaters[3]?.archetype}): "${debaters[3]?.prompt}"
5. 🏛️ ${debaters[4]?.name} (${debaters[4]?.archetype}): "${debaters[4]?.prompt}"

CRITICAL INSTRUCTIONS FOR YOUR DELIBERATION:
1. Genuinely study the user's specific prompt or dilemma. Do NOT give generic or repetitive responses.
2. For each persona, write an authentic first-person contribution (2-3 paragraphs) capturing their lived trade reality, practical dilemmas, and REAL CONCRETE EXAMPLES relevant to what the user asked:
### [Avatar] [Persona Name] ([Archetype])
[Their authentic critique, dilemmas, and trade-specific recommendations]

3. Conclude with:
### ⚖️ Council Consensus & Actionable Verdict
[A balanced, synthesized consensus directly answering ${userProfile.name}'s objective with a concrete checklist of implementation steps.]`;

    // Filter messages to valid user/assistant turns
    const validMessages = (messages || [])
      .filter((m: any) => m.content && typeof m.content === 'string' && m.content.trim())
      .map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.trim(),
      }));

    if (validMessages.length === 0 || validMessages[validMessages.length - 1].role !== 'user') {
      validMessages.push({ role: 'user', content: 'Please deliberate on our project and recommend the best human-centric approach.' });
    }

    try {
      const languageModel = providerRegistry.getModel(
        targetProvider,
        targetModel,
        { apiKey: resolvedApiKey, baseUrl: ollamaBaseUrl || baseUrl },
        customProviders
      );

      const { text } = await generateText({
        model: languageModel,
        system: systemPrompt,
        messages: validMessages,
        temperature: 0.75,
      });

      return new Response(text, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    } catch (err) {
      console.warn('Primary model failed in assembly, falling back to Groq 120B:', err);
      try {
        const fallbackModel = providerRegistry.getModel('Groq', 'openai/gpt-oss-120b', {
          apiKey: DEFAULT_FALLBACK_GROQ_KEY,
        });
        const { text } = await generateText({
          model: fallbackModel,
          system: systemPrompt,
          messages: validMessages,
          temperature: 0.75,
        });
        return new Response(text, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      } catch (err2) {
        return generateAssemblyFallback(debaters, userProfile, validMessages);
      }
    }
  } catch (error: any) {
    console.error('Error in api.council-chat:', error);
    return new Response(
      `### ⚖️ Council Deliberation Error\nThe deliberation engine encountered an issue: ${error.message || 'Please check your connection and try again.'}`,
      {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }
    );
  }
}

function generateDirectPersonaFallback(persona: HumanPersona, userProfile: any, messages: any[]): Response {
  const latestMsg = messages[messages.length - 1]?.content || 'Hello';
  const reply = `Greetings, ${userProfile.name}. I hear your perspective from your role as a ${userProfile.role}.

Speaking as ${persona.archetype} (${persona.role}):
Regarding "${latestMsg}", from my lived perspective:

"${persona.prompt}"

If we are going to build software that real humans actually depend on, we have to make sure it doesn't just look good in theory. It has to endure actual field stress, be understandable to everyday people, and never fail without a clear, accessible recovery path. Let us refine this together.`;

  return new Response(reply, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function generateAssemblyFallback(debaters: HumanPersona[], userProfile: any, messages: any[]): Response {
  const latestMsg = messages[messages.length - 1]?.content || 'Our initiative';
  const p1 = debaters[0] || HUMAN_PERSONAS_100[0];
  const p2 = debaters[1] || HUMAN_PERSONAS_100[20];
  const p3 = debaters[2] || HUMAN_PERSONAS_100[30];
  const p4 = debaters[3] || HUMAN_PERSONAS_100[70];

  const reply = `### ${p1.avatar} ${p1.name} (${p1.archetype})
"Regarding '${latestMsg}', out in the field under rain and heat, we don't have patience for fragile setups. Any tool or system must run reliably even when the signal is dead, and the buttons must be readable under direct sunlight."

### ${p2.avatar} ${p2.name} (${p2.archetype})
"From a technician's viewpoint, if something breaks at 2 AM, I need to know the exact failure point. Give me modular diagnostics, standardized connectors, and explicit error codes rather than a black box."

### ${p3.avatar} ${p3.name} (${p3.archetype})
"Legally and ethically, we have to safeguard ${userProfile.name}'s users from liability and data leakage. Every permission must be explicit, terms must be written in plain human English, and audit trails must be preserved."

### ${p4.avatar} ${p4.name} (${p4.archetype})
"On the street and for ordinary folks with five dollars in their pocket, everything today feels built for the wealthy and tech-savvy. Whatever you build, make sure there are zero predatory fees, no elitist barriers, and that anyone can use it with dignity."

### ⚖️ Council Consensus & Actionable Verdict
The 100-Human Council consensus recommends addressing ${userProfile.name}'s objective with a resilient offline-first core, transparent diagnostic logging, strict privacy compliance, and completely open, accessible entry points with zero hidden traps.`;

  return new Response(reply, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
