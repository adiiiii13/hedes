import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { validateProjectId } from '~/utils/project-dir.server';
import {
  getStoreCatalog,
  installStoreItem,
  toggleStoreItem,
  rollbackStoreItem,
  uninstallStoreItem,
  createBridgeSession,
  verifyBridgeSession,
} from '~/utils/store.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  try {
    const catalog = await getStoreCatalog();
    return json(catalog);
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json();
    const actionType = String(body.action || '');
    const itemId = String(body.itemId || '');

    if (actionType === 'install') {
      const permissions = Array.isArray(body.approvedPermissions) ? body.approvedPermissions : [];
      const result = await installStoreItem(itemId, permissions);
      return json(result);
    }

    if (actionType === 'toggle') {
      const enabled = Boolean(body.enabled);
      const result = await toggleStoreItem(itemId, enabled);
      return json({ success: true, item: result });
    }

    if (actionType === 'rollback') {
      const result = await rollbackStoreItem(itemId);
      return json({ success: true, item: result });
    }

    if (actionType === 'uninstall') {
      await uninstallStoreItem(itemId);
      return json({ success: true });
    }

    if (actionType === 'create_bridge') {
      const projectId = validateProjectId(String(body.projectId || ''));
      const session = createBridgeSession(projectId);
      return json(session);
    }

    if (actionType === 'verify_bridge') {
      const token = String(body.token || '');
      const projectId = validateProjectId(String(body.projectId || ''));
      const valid = verifyBridgeSession(token, projectId);
      return json({ valid });
    }

    return json({ error: `Unknown action: ${actionType}` }, { status: 400 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 400 });
  }
}
