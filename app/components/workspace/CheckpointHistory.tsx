import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { RotateCcw, X } from 'lucide-react';
import { currentChatId } from '~/stores/chat';
import { loadProjectFiles } from '~/stores/workspace';

type Item = { id: string; label: string; createdAt: number; fileCount: number };
type Comparison = { checkpoint: Item; changed: string[]; before: Record<string, string>; after: Record<string, string> };

export function CheckpointHistory() {
  const chatId = useStore(currentChatId);
  const [items, setItems] = useState<Item[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [selectedFile, setSelectedFile] = useState('');
  const [error, setError] = useState('');
  const refresh = async () => {
    try {
      const response = await fetch(`/api/local/checkpoints?chatId=${encodeURIComponent(chatId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems(data.checkpoints || []);
    } catch (cause) { setError((cause as Error).message); }
  };
  useEffect(() => { void refresh(); }, [chatId]);

  const inspect = async (id: string) => {
    setError('');
    try {
      const response = await fetch(`/api/local/checkpoints?chatId=${encodeURIComponent(chatId)}&id=${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setComparison(data);
      setSelectedFile(data.changed[0] || '');
    } catch (cause) { setError((cause as Error).message); }
  };

  const restore = async () => {
    if (!comparison || !window.confirm(`Restore ${comparison.changed.length} changed files from this checkpoint? Current changes in those files will be replaced.`)) return;
    setError('');
    try {
      const response = await fetch('/api/local/checkpoints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, action: 'restore', id: comparison.checkpoint.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await loadProjectFiles(chatId);
      setComparison(null);
      await refresh();
    } catch (cause) { setError((cause as Error).message); }
  };

  return <div className="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
    <p className="mb-2 px-2 text-slate-500">Saved before each AI request. Compare files or restore.</p>
    {error && <p role="alert" className="mb-2 text-rose-300">{error}</p>}
    {!items.length && <p className="px-2 py-5 text-center text-slate-500">No checkpoints yet</p>}
    {items.map((item) => <button key={item.id} type="button" onClick={() => { void inspect(item.id); }} className="mb-1.5 block w-full rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left hover:border-cyan-400/40">
      <span className="block truncate font-medium text-slate-200">{item.label}</span>
      <span className="mt-1 block text-[10px] text-slate-500">{new Date(item.createdAt).toLocaleString()} · {item.fileCount} files</span>
    </button>)}
    {comparison && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Checkpoint diff">
      <div className="flex h-[min(85vh,850px)] w-[min(1100px,95vw)] flex-col rounded-2xl border border-white/15 bg-[#101622] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white">{comparison.checkpoint.label}</h3><p className="text-xs text-slate-400">{comparison.changed.length} changed files since checkpoint</p></div><div className="flex gap-2"><button type="button" onClick={() => { void restore(); }} className="flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200"><RotateCcw className="h-3.5 w-3.5" />Restore</button><button type="button" onClick={() => setComparison(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10" aria-label="Close diff"><X className="h-4 w-4" /></button></div></div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row"><div className="max-h-32 w-full shrink-0 overflow-auto border-b border-white/10 p-2 sm:max-h-none sm:w-52 sm:border-b-0 sm:border-r">{comparison.changed.map((file) => <button key={file} type="button" onClick={() => setSelectedFile(file)} className={`block w-full truncate rounded px-2 py-1.5 text-left text-[11px] ${selectedFile === file ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-400 hover:bg-white/5'}`} title={file}>{file}</button>)}</div>
          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-px overflow-auto bg-white/10 md:grid-cols-2"><section className="min-w-0 overflow-auto bg-[#101622] p-3"><h4 className="sticky top-0 bg-[#101622] pb-2 text-xs font-semibold text-amber-200">Before</h4><pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-300">{comparison.before[selectedFile] ?? '(file did not exist)'}</pre></section><section className="min-w-0 overflow-auto bg-[#101622] p-3"><h4 className="sticky top-0 bg-[#101622] pb-2 text-xs font-semibold text-emerald-200">Now</h4><pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-300">{comparison.after[selectedFile] ?? '(file removed)'}</pre></section></div>
        </div>
      </div>
    </div>}
  </div>;
}
