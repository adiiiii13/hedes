import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { decideApproval, pendingApprovals } from '~/utils/approvals.server';
export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  return json({ approvals: (await pendingApprovals()).map(record => ({ ...record, session: undefined })) });
}
export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const body = await request.json();
    await decideApproval(body.id, body.hash, body.approved === true);
    return json({ success: true });
  } catch (error) { return json({ error: (error as Error).message }, { status: 409 }); }
}
