import { data as json, type ActionFunctionArgs } from 'react-router';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { extractCustomModels, normalizeCustomBaseUrl } from '~/utils/custom-models';
import { resolveModelKey } from '~/utils/vault.server.ts';

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, { status: 405 });

  try {
    const body = await request.json();
    if (typeof body.baseUrl !== 'string' || body.baseUrl.length > 2048 || (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length > 4096))) {
      return json({ ok: false, error: 'Invalid endpoint or API key' }, { status: 400 });
    }
    const baseUrl = normalizeCustomBaseUrl(body.baseUrl);
    const headers: Record<string, string> = { Accept: 'application/json' };
    const resolvedKey = await resolveModelKey(body.baseUrl, body.apiKey, body.credentialId);
    if (resolvedKey) headers.Authorization = `Bearer ${resolvedKey}`;
    const response = await fetch(`${baseUrl}/models`, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return json({ ok: false, error: `Model list returned HTTP ${response.status}. Check the URL and API key.` }, { status: 502 });
    }
    const size = Number(response.headers.get('content-length'));
    if (size > 2_000_000) return json({ ok: false, error: 'Model list is too large.' }, { status: 502 });
    const raw = await response.text();
    if (raw.length > 2_000_000) return json({ ok: false, error: 'Model list is too large.' }, { status: 502 });
    const payload = JSON.parse(raw);
    const models = extractCustomModels(payload);
    if (!models.length) return json({ ok: false, error: 'This endpoint returned no model IDs. Enter a model ID manually.' }, { status: 422 });
    return json({ ok: true, baseUrl, models });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Could not scan models.' }, { status: 400 });
  }
}
