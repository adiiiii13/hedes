import { data as json, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getStoragePaths } from '~/utils/runtime.server';
import { atomicWriteFile } from '~/utils/atomic-write.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';
const filename = () => path.join(getStoragePaths().settings, 'appearance.json');
export async function loader({ request }: LoaderFunctionArgs) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const value = await fs.readFile(filename(), 'utf8').catch(() => 'null');
  return json({ appearance: JSON.parse(value) });
}
export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const text = await request.text();
  if (text.length > 1_600_000) return new Response('Appearance too large', { status: 413 });
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Response('Invalid appearance', { status: 400 });
  await atomicWriteFile(filename(), JSON.stringify(value));
  return json({ success: true });
}
