import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { getWebsiteStatus, startWebsite, stopWebsite } from '~/utils/website-runner.server';
import { validateProjectId } from '~/utils/project-dir.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { requireApproval } from '~/utils/approvals.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  try {
    const projectId = validateProjectId(new URL(request.url).searchParams.get('chatId') || '');
    return json(getWebsiteStatus(projectId));
  } catch (error) { return json({ error: (error as Error).message }, { status: 400 }); }
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const body = await request.json();
    const projectId = validateProjectId(String(body.chatId || ''));
    const approval = await requireApproval(request, 'website', { ...body, chatId: projectId });
    if (approval) return approval;
    const status = body.action === 'stop' ? await stopWebsite(projectId) : body.action === 'start' ? await startWebsite(projectId) : null;
    return status ? json(status) : json({ error: 'Unknown website action' }, { status: 400 });
  } catch (error) { return json({ error: (error as Error).message }, { status: 400 }); }
}
