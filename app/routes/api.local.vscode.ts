import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { validateProjectId, resolveProjectDir } from '~/utils/project-dir.server';
import { logDiagnostic } from '~/utils/diagnostic-logger.server';

export interface VsCodeDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source?: string;
}

interface ProjectDiagnostics {
  projectId: string;
  updatedAt: number;
  diagnostics: VsCodeDiagnostic[];
  activeFile?: string;
  cursor?: { line: number; column: number };
}

// In-memory store of diagnostics per project
const projectDiagnosticsStore = new Map<string, ProjectDiagnostics>();

export function getProjectDiagnostics(projectId: string): ProjectDiagnostics | undefined {
  return projectDiagnosticsStore.get(projectId);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  const url = new URL(request.url);
  const projectIdParam = url.searchParams.get('projectId');

  if (projectIdParam) {
    try {
      const validProject = validateProjectId(projectIdParam);
      const diagnostics = projectDiagnosticsStore.get(validProject) || {
        projectId: validProject,
        updatedAt: Date.now(),
        diagnostics: [],
      };
      return json({ success: true, diagnostics });
    } catch (err: any) {
      return json({ error: err.message }, { status: 400 });
    }
  }

  return json({
    success: true,
    bridge: 'active',
    projectsTracked: Array.from(projectDiagnosticsStore.keys()),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json();
    const actionType = String(body.action || 'report-diagnostics');
    const projectId = validateProjectId(String(body.projectId || 'default-project'));

    if (actionType === 'report-diagnostics') {
      const rawDiagnostics = Array.isArray(body.diagnostics) ? body.diagnostics : [];
      const sanitized: VsCodeDiagnostic[] = rawDiagnostics.slice(0, 100).map((d: any) => ({
        file: String(d.file || d.filePath || '').slice(0, 500),
        line: Number(d.line || 1),
        column: Number(d.column || 1),
        severity: ['error', 'warning', 'info', 'hint'].includes(d.severity) ? d.severity : 'error',
        message: String(d.message || '').slice(0, 2000),
        source: typeof d.source === 'string' ? d.source.slice(0, 80) : undefined,
      }));

      const record: ProjectDiagnostics = {
        projectId,
        updatedAt: Date.now(),
        diagnostics: sanitized,
        activeFile: typeof body.activeFile === 'string' ? body.activeFile.slice(0, 500) : undefined,
        cursor: body.cursor && typeof body.cursor.line === 'number' ? {
          line: Number(body.cursor.line),
          column: Number(body.cursor.column || 1),
        } : undefined,
      };

      projectDiagnosticsStore.set(projectId, record);

      if (sanitized.some((d) => d.severity === 'error')) {
        await logDiagnostic(
          'warn',
          'VSCODE_DIAGNOSTICS',
          `Received ${sanitized.length} diagnostics for ${projectId} (${sanitized.filter((d) => d.severity === 'error').length} errors)`
        );
      }

      return json({ success: true, count: sanitized.length });
    }

    if (actionType === 'sync-active-file') {
      const existing = projectDiagnosticsStore.get(projectId) || {
        projectId,
        updatedAt: Date.now(),
        diagnostics: [],
      };
      existing.activeFile = String(body.activeFile || '').slice(0, 500);
      if (body.cursor) {
        existing.cursor = {
          line: Number(body.cursor.line || 1),
          column: Number(body.cursor.column || 1),
        };
      }
      existing.updatedAt = Date.now();
      projectDiagnosticsStore.set(projectId, existing);

      return json({ success: true, activeFile: existing.activeFile });
    }

    return json({ error: `Unknown action: ${actionType}` }, { status: 400 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 400 });
  }
}
