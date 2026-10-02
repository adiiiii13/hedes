import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { validateProjectId } from '~/utils/project-dir.server';
import { requireApproval } from '~/utils/approvals.server';
import {
  listQueuedTasks,
  getQueuedTask,
  createQueuedTask,
  approveQueuedTask,
  cancelQueuedTask,
  executeTaskRun,
  resumeScheduledTasks,
} from '~/utils/task-queue.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  try {
    await resumeScheduledTasks().catch((err) => {
      console.warn('Background scheduler tick in tasks loader caught error:', err);
    });
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const tasks = await listQueuedTasks(projectId ? validateProjectId(projectId) : undefined);
    return json({ tasks });
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
    const taskId = String(body.taskId || '');

    if (actionType === 'create') {
      const task = await createQueuedTask({
        projectId: validateProjectId(String(body.projectId || '')),
        title: body.title,
        command: body.command,
        capabilities: body.capabilities,
        schedule: body.schedule || {},
        requiresApproval: true,
      });
      return json({ task });
    }

    if (actionType === 'approve') {
      const taskToApprove = await getQueuedTask(taskId);
      if (!taskToApprove) throw new Error('Task not found');
      const approval = await requireApproval(request, 'scheduled command', { ...body, projectId: taskToApprove.projectId, command: taskToApprove.command, schedule: taskToApprove.schedule });
      if (approval) return approval;
      const approved = Boolean(body.approved);
      const task = await approveQueuedTask(taskId, approved);
      return json({ task });
    }

    if (actionType === 'execute') {
      const result = await executeTaskRun(taskId);
      return json(result);
    }

    if (actionType === 'cancel') {
      const task = await cancelQueuedTask(taskId);
      return json({ task });
    }

    if (actionType === 'resume') {
      const result = await resumeScheduledTasks();
      return json(result);
    }

    return json({ error: `Unknown action: ${actionType}` }, { status: 400 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 400 });
  }
}
