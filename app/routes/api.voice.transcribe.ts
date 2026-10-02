import { type ActionFunctionArgs, data as json } from 'react-router';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { resolveModelKey } from '~/utils/vault.server';
import { transcribeLocalAudio } from '~/utils/voice.server';

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string' || !file.size || file.size > 25 * 1024 * 1024) {
      return json({ error: 'Audio must be between 1 byte and 25 MB' }, { status: 400 });
    }
    const cloudAllowed = form.get('allowCloud') === 'true';
    if (!cloudAllowed) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.subarray(0, 4).toString() !== 'RIFF') {
        return json({ error: 'Local Whisper needs PCM WAV audio. Use desktop local dictation or configure a local speech model.' }, { status: 400 });
      }
      const result = await transcribeLocalAudio(buffer, { language: String(form.get('language') || 'auto') });
      return json({ success: true, ...result });
    }
    const provider = String(form.get('provider') || '').toLowerCase() === 'openai' ? 'OpenAI' : 'Groq';
    const apiKey = await resolveModelKey(provider, typeof form.get('apiKey') === 'string' ? String(form.get('apiKey')) : undefined);
    if (!apiKey) return json({ error: `Configure ${provider} credentials for the selected cloud speech service` }, { status: 400 });
    const payload = new FormData();
    payload.append('file', file, file.name || 'speech.webm');
    payload.append('model', provider === 'Groq' ? 'whisper-large-v3-turbo' : 'whisper-1');
    payload.append('response_format', 'json');
    const response = await fetch(provider === 'Groq'
      ? 'https://api.groq.com/openai/v1/audio/transcriptions'
      : 'https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: payload,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(60000)]),
    });
    if (!response.ok) return json({ error: `${provider} speech request failed (${response.status}); no alternate provider was contacted` }, { status: 502 });
    const data = await response.json() as { text?: string };
    return json({ success: true, text: data.text?.trim() || '', provider });
  } catch (error) { return json({ error: (error as Error).message }, { status: 400 }); }
}
