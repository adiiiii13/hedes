import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { rejectCrossOrigin } from '~/utils/local-request.server';
import { validateProjectId } from '~/utils/project-dir.server';
import {
  checkVoiceCapabilities,
  verifyModelIntegrity,
  processVoiceCommand,
  setVoicePreferences,
  installWhisperModel,
  deleteWhisperModel,
} from '~/utils/voice.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  try {
    const capabilities = await checkVoiceCapabilities();
    return json(capabilities);
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

    if (actionType === 'verify_model') {
      const modelId = String(body.modelId || '');
      const result = await verifyModelIntegrity(modelId);
      return json(result);
    }

    if (actionType === 'install_model') {
      const modelId = String(body.modelId || 'ggml-tiny');
      const result = await installWhisperModel(modelId, body.customDownloadUrl);
      return json(result);
    }

    if (actionType === 'delete_model') {
      const modelId = String(body.modelId || '');
      const success = await deleteWhisperModel(modelId);
      return json({ success });
    }

    if (actionType === 'set_preferences') {
      setVoicePreferences({
        retention: body.retention,
        allowCloud: body.allowCloud,
      });
      return json({ success: true });
    }

    if (actionType === 'voice_command') {
      const transcript = String(body.transcript || '');
      const projectId = validateProjectId(String(body.projectId || ''));
      const approved = Boolean(body.approved);
      const result = await processVoiceCommand(transcript, projectId, { approved });
      return json(result);
    }

    return json({ error: `Unknown action: ${actionType}` }, { status: 400 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 400 });
  }
}
