import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { deleteMemory, listMemory, upsertMemory } from '~/utils/memory.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { validateProjectId } from '~/utils/project-dir.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  try {
    const projectId = validateProjectId(new URL(request.url).searchParams.get('chatId') || '');
    return json({ nodes: await listMemory(projectId) });
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  if (request.method !== 'POST' && request.method !== 'DELETE') return new Response('Method not allowed', { status: 405 });
  try {
    const body = await request.json();
    const projectId = validateProjectId(body.chatId || '');
    const nodes = request.method === 'DELETE'
      ? await deleteMemory(projectId, String(body.id || ''))
      : await upsertMemory(projectId, body.node || {});
    return json({ nodes });
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 400 });
  }
}
