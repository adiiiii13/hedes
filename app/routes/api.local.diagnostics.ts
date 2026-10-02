import { data as json, type LoaderFunctionArgs, type ActionFunctionArgs } from 'react-router';
import { verifyLocalSessionRequest } from '~/utils/session-auth.server';
import {
  getSystemDiagnosticReport,
  getSanitizedLogExportPreview,
  logDiagnostic,
} from '~/utils/diagnostic-logger.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const authErr = verifyLocalSessionRequest(request);
  if (authErr) return authErr;

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    if (action === 'preview-export') {
      const preview = await getSanitizedLogExportPreview();
      return json({ success: true, preview });
    }

    const report = await getSystemDiagnosticReport();
    return json({ success: true, report });
  } catch (error: any) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const authErr = verifyLocalSessionRequest(request);
  if (authErr) return authErr;

  try {
    const body = await request.json();
    if (body.action === 'log-test') {
      await logDiagnostic(body.level || 'info', body.scope || 'UI_TEST', body.message || 'Diagnostic ping', body.metadata);
      return json({ success: true });
    }

    return json({ success: false, error: 'Unknown diagnostic action' }, { status: 400 });
  } catch (error: any) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
}
