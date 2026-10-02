import { useEffect, useState } from 'react';
import { requestActionReview, type ReviewRequest } from '~/utils/approval-client';

type Item = { approval: ReviewRequest; resolve: (accepted: boolean) => void };
export function ActionReview() {
  const [queue, setQueue] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastEdit, setLastEdit] = useState<any>(null);
  useEffect(() => {
    const receive = (event: Event) => setQueue(items => [...items, (event as CustomEvent<Item>).detail]);
    window.addEventListener('hedes-action-review', receive);
    const edited = (event: Event) => setLastEdit((event as CustomEvent).detail);
    window.addEventListener('hedes-edit-applied', edited);
    const timer = setInterval(() => {
      void fetch('/api/local/approvals').then(r => r.ok ? r.json() : null).then(data => {
        for (const approval of data?.approvals || []) void requestActionReview(approval);
      }).catch(() => {});
    }, 2000);
    return () => { window.removeEventListener('hedes-action-review', receive); window.removeEventListener('hedes-edit-applied', edited); clearInterval(timer); };
  }, []);
  const item = queue[0];
  if (!item) return lastEdit ? <div role="status" className="fixed bottom-9 right-4 z-[999] rounded-lg border border-emerald-700 bg-[#10121b] p-3 text-sm text-slate-100">
    Saved {lastEdit.cleanPath}
    <button className="ml-3 underline" onClick={() => {
      void fetch('/api/local/edits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'undo', chatId: lastEdit.resolvedChatId, id: lastEdit.changeSetId }) })
        .then(async response => { if (!response.ok) throw new Error((await response.json()).error); setLastEdit(null); const { loadProjectFiles } = await import('~/stores/workspace'); await loadProjectFiles(lastEdit.resolvedChatId); })
        .catch(error => window.alert(error.message));
    }}>Undo</button><button aria-label="Dismiss saved file" className="ml-3" onClick={() => setLastEdit(null)}>×</button>
  </div> : null;
  const { approval } = item;
  async function decide(approved: boolean) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/local/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: approval.id, hash: approval.hash, approved }) });
      if (!response.ok) throw new Error((await response.json()).error);
      item.resolve(approved);
      setQueue(items => items.slice(1));
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  const payload = approval.payload;
  return <div role="dialog" aria-modal="true" aria-label="Review action" className="fixed inset-0 z-[1000] bg-black/75 flex items-center justify-center p-4">
    <section className="w-full max-w-4xl max-h-[90vh] overflow-auto rounded-xl border border-slate-600 bg-[#10121b] p-5 text-slate-100">
      <h2 className="text-lg font-semibold">Review {approval.scope}</h2>
      <p className="my-2 text-sm text-slate-400">Project: {payload.chatId || payload.projectId} · Approval applies once to this exact action.</p>
      {payload.filePath && <p className="font-mono text-sm mb-3">{payload.filePath}</p>}
      {typeof payload.content === 'string' ? <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><h3>Current file</h3><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs p-3 bg-rose-950/20">{payload.originalContent ?? '(new file)'}</pre></div>
        <div><h3>Proposed file</h3><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs p-3 bg-emerald-950/20">{payload.content}</pre></div>
      </div> : <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-sm p-3 bg-black/30">{JSON.stringify(payload, null, 2)}</pre>}
      {error && <p role="alert" className="text-red-400 mt-3">{error}</p>}
      <div className="mt-4 flex justify-end gap-3">
        <button disabled={busy} onClick={() => void decide(false)} className="px-4 py-2 border rounded">Reject</button>
        <button disabled={busy} onClick={() => void decide(true)} className="px-4 py-2 rounded bg-emerald-700">Approve once</button>
      </div>
    </section>
  </div>;
}
