import { type ActionFunctionArgs, data as json } from 'react-router';
import { resolveProjectDir } from '~/utils/project-dir.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { compareCheckpoint, createCheckpoint, listCheckpoints, restoreCheckpoint } from '~/utils/checkpoints.server';
import { requireApproval } from '~/utils/approvals.server';

export async function loader({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  try {
    const url = new URL(request.url);
    const { projectDir } = await resolveProjectDir(url.searchParams.get('chatId'));
    const id = url.searchParams.get('id');
    return json(id ? await compareCheckpoint(projectDir, id) : { checkpoints: await listCheckpoints(projectDir) });
  } catch (error) { return json({ error: (error as Error).message }, { status: 400 }); }
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const body = await request.json();
    const { projectDir } = await resolveProjectDir(body.chatId);
    if (body.action === 'create') {
      const checkpoint = await createCheckpoint(projectDir, String(body.label || 'Before AI edit'));
      return json({ id: checkpoint.id, fileCount: Object.keys(checkpoint.files).length });
    }
    if (body.action === 'restore') {
      const comparison = await compareCheckpoint(projectDir, String(body.id || ''));
      const approval = await requireApproval(request, 'restore files', { ...body, before: comparison.before, current: comparison.after });
      if (approval) return approval;
      const changed = await restoreCheckpoint(projectDir, String(body.id || ''));
      return json({ changed });
    }
    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) { return json({ error: (error as Error).message }, { status: 400 }); }
}
