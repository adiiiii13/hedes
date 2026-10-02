import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { BrainCircuit, CornerDownRight, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { currentChatId } from '~/stores/chat';
import type { MemoryNode } from '~/engine/memory';

type Draft = Pick<MemoryNode, 'title' | 'content' | 'parentId' | 'tags' | 'pinned'> & { id?: string };
const emptyDraft: Draft = { title: '', content: '', parentId: null, tags: [], pinned: false };

export function MemorySettings() {
  const chatId = useStore(currentChatId);
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [query, setQuery] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedId(null);
    setDraft(emptyDraft);
    fetch(`/api/local/memory?chatId=${encodeURIComponent(chatId)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load memory');
        setNodes(data.nodes || []);
      })
      .catch((cause) => setError(String(cause)));
  }, [chatId]);

  const ordered = useMemo(() => {
    const result: Array<{ node: MemoryNode; depth: number }> = [];
    const visit = (parentId: string | null, depth: number) => {
      nodes.filter((node) => node.parentId === parentId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title)).forEach((node) => {
        result.push({ node, depth });
        visit(node.id, depth + 1);
      });
    };
    visit(null, 0);
    return result.filter(({ node }) => (!reviewOnly || node.tags.includes('auto-learned')) && (!query || `${node.title} ${node.content} ${node.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  }, [nodes, query, reviewOnly]);

  const choose = (node: MemoryNode) => {
    setSelectedId(node.id);
    setDraft({ id: node.id, title: node.title, content: node.content, parentId: node.parentId, tags: node.tags, pinned: node.pinned });
    setError('');
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/local/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, node: draft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save memory');
      setNodes(data.nodes);
      const saved = data.nodes.find((node: MemoryNode) => node.id === draft.id) || data.nodes.find((node: MemoryNode) => node.title === draft.title && node.content === draft.content);
      if (saved) choose(saved);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !window.confirm('Delete this memory? Its children will move to the parent.')) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/local/memory', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, id: selectedId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete memory');
      setNodes(data.nodes);
      setSelectedId(null);
      setDraft(emptyDraft);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 text-slate-100">
      <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 via-violet-500/5 to-transparent p-5">
        <div className="flex items-center gap-3"><BrainCircuit className="h-6 w-6 text-cyan-300" /><h3 className="text-lg font-semibold tracking-tight">Project Memory</h3><span className="ml-auto rounded-full bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-200">{nodes.length} nodes</span></div>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">Organize decisions, preferences, and facts as a tree. Matching notes are added to each prompt and sent to your selected AI provider.</p>
      </div>

      <div className="grid min-h-[420px] gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-2xl border border-white/10 bg-[#101327] p-3">
          <button type="button" onClick={() => setReviewOnly((value) => !value)} className={`mb-3 rounded-lg border px-2.5 py-1.5 text-xs ${reviewOnly ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-white/10 text-slate-300'}`}>Review auto learned ({nodes.filter((node) => node.tags.includes('auto-learned')).length})</button>
          <div className="mb-3 flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 text-slate-400"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memory" className="w-full bg-transparent py-2.5 text-sm text-white outline-none" /></div>
            <button onClick={() => { setSelectedId(null); setDraft(emptyDraft); }} title="New memory" className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 text-cyan-200 transition hover:bg-cyan-400/20"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
            {ordered.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">No notes yet. Add the first memory.</div>}
            {ordered.map(({ node, depth }) => <button key={node.id} onClick={() => choose(node)} className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${selectedId === node.id ? 'bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400/30' : 'text-slate-300 hover:bg-white/5'}`} style={{ paddingLeft: Math.min(depth, 5) * 14 + 12 }}>
              {depth ? <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-slate-600" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.title}</span>{node.pinned && <Sparkles className="h-3.5 w-3.5 text-amber-300" />}
            </button>)}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#101327] p-4">
          <div className="flex items-center justify-between"><h4 className="font-semibold">{selectedId ? 'Edit memory' : 'New memory'}</h4>{selectedId && <button onClick={remove} disabled={busy} className="rounded-lg p-2 text-rose-300 hover:bg-rose-400/10" title="Delete memory"><Trash2 className="h-4 w-4" /></button>}</div>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Title, e.g. Architecture decisions" maxLength={120} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-cyan-400/50" />
          <textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="What should Hedes remember?" maxLength={4000} className="min-h-[150px] flex-1 resize-y rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-relaxed outline-none focus:border-cyan-400/50" />
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={draft.parentId || ''} onChange={(event) => setDraft({ ...draft, parentId: event.target.value || null })} className="rounded-xl border border-white/10 bg-[#171b35] px-3 py-2.5 text-sm outline-none"><option value="">Top level</option>{nodes.filter((node) => node.id !== selectedId).map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select>
            <input value={draft.tags.join(', ')} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(',').map((tag) => tag.trim()) })} placeholder="Tags, comma separated" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-cyan-400/50" />
          </div>
          <div className="flex items-center justify-between gap-3"><label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={draft.pinned} onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })} className="accent-cyan-400" />Pin for broad prompts</label><button onClick={save} disabled={busy || !draft.title.trim() || !draft.content.trim()} className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/10 transition hover:brightness-110 disabled:opacity-40">{busy ? 'Saving…' : 'Save memory'}</button></div>
          {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        </div>
      </div>
    </div>
  );
}
