import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import {
  saveCredential,
  deleteCredential,
  listCredentialsStatus,
} from '~/utils/vault.server.ts';
import { rejectCrossOrigin } from '~/utils/local-request.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  try {
    const credentials = await listCredentialsStatus();
    return json({ ok: true, credentials });
  } catch (error: any) {
    return json({ ok: false, error: error.message || 'Failed to list credentials' }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const actionType = String(body.action || 'set');

    if (actionType === 'set') {
      const { credentialId, secret } = body;
      if (!credentialId || typeof credentialId !== 'string') {
        return json({ ok: false, error: 'Credential ID required' }, { status: 400 });
      }
      const result = await saveCredential(credentialId, secret);
      return json({ ok: true, status: result });
    }

    if (actionType === 'delete') {
      const { credentialId } = body;
      if (!credentialId || typeof credentialId !== 'string') {
        return json({ ok: false, error: 'Credential ID required' }, { status: 400 });
      }
      await deleteCredential(credentialId);
      return json({ ok: true });
    }

    if (actionType === 'migrate') {
      const { credentials } = body;
      const results: Record<string, { configured: boolean; masked: string }> = {};
      if (credentials && typeof credentials === 'object') {
        for (const [id, secret] of Object.entries(credentials)) {
          if (typeof secret === 'string' && secret.trim()) {
            results[id] = await saveCredential(id, secret.trim());
          }
        }
      }
      return json({ ok: true, migrated: results });
    }

    return json({ ok: false, error: 'Unknown vault action' }, { status: 400 });
  } catch (error: any) {
    return json({ ok: false, error: error.message || 'Vault operation failed' }, { status: 500 });
  }
}
