import { data as json, type LoaderFunctionArgs, type ActionFunctionArgs } from 'react-router';
import { verifyLocalSessionRequest } from '~/utils/session-auth.server';
import {
  loadDurableRun,
  cancelDurableRun,
  listDurableRuns,
  getActiveRunHandle,
} from '~/utils/runs.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const authErr = verifyLocalSessionRequest(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const runId = url.searchParams.get('runId');
  const afterSeq = parseInt(url.searchParams.get('afterSeq') || '0', 10);
  const chatId = url.searchParams.get('chatId') || undefined;
  const projectId = url.searchParams.get('projectId') || undefined;

  try {
    if (runId) {
      const run = await loadDurableRun(runId);
      if (!run) {
        return json({ success: false, error: 'Run not found' }, { status: 404 });
      }

      const activeHandle = getActiveRunHandle(runId);
      const isRunning = Boolean(activeHandle && (run.status === 'running' || run.status === 'queued'));
      const newEvents = run.events.filter((e) => e.seq > afterSeq);

      return json({
        success: true,
        run: {
          ...run,
          events: newEvents,
          isRunning,
          latestSeq: run.events.length,
        },
      });
    }

    const runs = await listDurableRuns({ projectId, chatId });
    return json({ success: true, runs });
  } catch (error: any) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const authErr = verifyLocalSessionRequest(request);
  if (authErr) return authErr;

  try {
    const body = await request.json();
    const { action, runId } = body;

    if (action === 'cancel') {
      if (!runId) return json({ success: false, error: 'runId is required' }, { status: 400 });
      const cancelled = await cancelDurableRun(runId);
      return json({ success: true, cancelled });
    }

    return json({ success: false, error: 'Unknown run action' }, { status: 400 });
  } catch (error: any) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
}
