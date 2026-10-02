import React, { useEffect, useState } from 'react';
import { BookOpen, Plus, Trash2, CheckCircle2, Sparkles, AlertCircle } from 'lucide-react';

interface Skill {
  name: string;
  description: string;
  instructions: string;
  status?: 'installed' | 'draft' | 'recommended';
  enabled?: boolean;
  sourceRunId?: string;
}

export function SkillSettings() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [recommended, setRecommended] = useState<Skill[]>([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void fetch('/api/local/skills')
      .then((r) => r.json())
      .then((data) => {
        setSkills(data.skills || []);
        setRecommended(data.recommended || []);
      })
      .catch((e) => setMessage(String(e)));
  }, []);

  function select(skill: Skill) {
    setSelected(skill.name);
    setName(skill.name);
    setDescription(skill.description);
    setInstructions(skill.instructions);
    setMessage('');
  }

  function fresh() {
    setSelected('');
    setName('');
    setDescription('');
    setInstructions('');
    setMessage('');
  }

  async function submit(body: object) {
    try {
      const response = await fetch('/api/local/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save skill');
      setSkills(data.skills || []);
      setMessage('Saved');
      if ((body as { action?: string }).action === 'delete') fresh();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  const selectedSkill = skills.find((s) => s.name === selected);
  const draftSkills = skills.filter((s) => s.status === 'draft');
  const activeSkills = skills.filter((s) => s.status !== 'draft');

  return (
    <div className="space-y-5 text-slate-200">
      <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-slate-950 to-cyan-500/10 p-5">
        <p className="flex items-center gap-2 font-semibold text-violet-200">
          <BookOpen size={18} /> Skills &amp; Auto-Learned Procedures
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Reusable local instructions stored as SKILL.md files. Skills can be explicitly loaded via $name or automatically selected by semantic relevance. Auto-learned skills from chat sessions remain as drafts until approved.
        </p>
      </div>

      {draftSkills.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <Sparkles size={14} /> Learned Skills (Drafts Awaiting Review)
            </p>
            <span className="text-[11px] font-mono text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              {draftSkills.length} pending
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {draftSkills.map((skill) => (
              <div
                key={skill.name}
                className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/20 bg-black/40 p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-amber-200">{skill.name}</p>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      Draft
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{skill.description}</p>
                  {skill.sourceRunId && (
                    <p className="mt-1 text-[10px] text-slate-500 font-mono">Run: {skill.sourceRunId}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => void submit({ action: 'promote', name: skill.name })}
                    className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors"
                  >
                    Promote
                  </button>
                  <button
                    onClick={() => select(skill)}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5 transition-colors"
                  >
                    Inspect
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Recommended skills</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {recommended.map((skill) => {
            const installed = skills.some((item) => item.name === skill.name);
            return (
              <div
                key={skill.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3"
              >
                <div>
                  <p className="text-sm font-semibold">{skill.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{skill.description}</p>
                </div>
                <button
                  disabled={installed}
                  onClick={() => void submit({ action: 'install-recommended', name: skill.name })}
                  className="shrink-0 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-700 disabled:text-slate-300"
                >
                  {installed ? 'Installed' : 'Install'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          <button
            onClick={fresh}
            className="flex w-full items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-200"
          >
            <Plus size={15} /> New skill
          </button>
          {skills.map((skill) => (
            <button
              key={skill.name}
              onClick={() => select(skill)}
              className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-all ${
                selected === skill.name
                  ? 'border-violet-500/50 bg-violet-500/15'
                  : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="block font-semibold truncate">{skill.name}</span>
                {skill.status === 'draft' && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                    draft
                  </span>
                )}
              </div>
              <span className="mt-1 block truncate text-xs text-slate-500">{skill.description}</span>
            </button>
          ))}
        </div>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-2">
            <input
              aria-label="Skill name"
              placeholder="skill-name"
              value={name}
              disabled={!!selected}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm disabled:opacity-60"
            />
            {selectedSkill?.status === 'draft' && (
              <button
                type="button"
                onClick={() => void submit({ action: 'promote', name: selectedSkill.name })}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-semibold text-white transition-colors"
              >
                <CheckCircle2 size={14} /> Promote to Active
              </button>
            )}
          </div>

          <input
            aria-label="Description"
            placeholder="When this skill should be used"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm"
          />

          <textarea
            aria-label="Instructions"
            placeholder="Instructions for the AI..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={11}
            className="w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2 font-mono text-xs"
          />

          <div className="flex justify-between gap-2">
            {selected ? (
              <button
                onClick={() => void submit({ action: 'delete', name: selected })}
                className="flex items-center gap-1 text-xs text-rose-300 hover:text-rose-200"
              >
                <Trash2 size={14} /> Delete
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={() => void submit({ action: 'save', skill: { name, description, instructions } })}
              className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 transition-colors"
            >
              Save skill
            </button>
          </div>
          {message && <p role="status" className="text-xs text-slate-300">{message}</p>}
        </div>
      </div>
    </div>
  );
}
