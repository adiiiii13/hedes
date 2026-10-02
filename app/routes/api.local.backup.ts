import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { rejectCrossOrigin, sanitizeErrorMessage } from '~/utils/local-request.server.ts';
import { createFullBackupArchive, restoreFullBackupArchive } from '~/utils/backup.server.ts';
import { requireApproval } from '~/utils/approvals.server';
import { contentRevision } from '~/utils/atomic-write.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  try {
    const { archiveBuffer, manifest } = await createFullBackupArchive();
    const filename = `hedes-backup-${new Date().toISOString().slice(0, 10)}.zip`;

    return new Response(new Uint8Array(archiveBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Hedes-Backup-Files': String(manifest.filesCount),
        'X-Hedes-Backup-Bytes': String(manifest.totalBytes),
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: sanitizeErrorMessage(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const arrayBuffer = await request.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return new Response(JSON.stringify({ error: 'Empty backup archive' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const buffer = Buffer.from(arrayBuffer);
    const approval = await requireApproval(request, 'backup restore', { sha256: contentRevision(buffer), bytes: buffer.length, warning: 'Restore replaces matching project, settings, memory, skill, MCP, plugin and task files. Existing secrets are excluded.' });
    if (approval) return approval;
    const result = await restoreFullBackupArchive(buffer);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: sanitizeErrorMessage(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
