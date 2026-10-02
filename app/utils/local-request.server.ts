import { verifyLocalSessionRequest, sanitizeErrorMessage } from './session-auth.server.ts';
import { restoreInProgress } from './restore-recovery.server.ts';

export function rejectCrossOrigin(request: Request): Response | null {
  const rejected = verifyLocalSessionRequest(request);
  if (rejected) return rejected;
  if (restoreInProgress()) return Response.json({ error: 'Backup recovery in progress. Reload after recovery completes.' }, { status: 503 });
  return null;
}

export { verifyLocalSessionRequest, sanitizeErrorMessage };
