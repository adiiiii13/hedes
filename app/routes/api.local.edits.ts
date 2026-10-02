import { data as json, type ActionFunctionArgs } from 'react-router';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { readReviewedEdit, undoReviewedEdit } from '~/utils/reviewed-edits.server';
import { requireApproval } from '~/utils/approvals.server';
export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const body = await request.json();
    if (body.action !== 'undo') throw new Error('Unknown edit action');
    const edit = await readReviewedEdit(body.chatId, body.id);
    const approval = await requireApproval(request, 'undo file change', { chatId: edit.projectId, id: edit.id, filePath: edit.filePath, originalContent: edit.proposedContent, content: edit.originalContent ?? '(remove newly created file)' });
    if (approval) return approval;
    await undoReviewedEdit(body.chatId, body.id);
    return json({ success: true });
  } catch (error) { return json({ error: (error as Error).message }, { status: /conflict/.test((error as Error).message) ? 409 : 400 }); }
}
