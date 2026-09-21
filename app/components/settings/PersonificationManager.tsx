import React, { useState, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import {
  humanPersonasStore,
  updatePersona,
  togglePersonaPermission,
  resetPersona,
  resetAllPersonas,
} from '~/stores/hive';
import {
  PERSONA_CATEGORIES,
  type HumanPersona,
} from '~/engine/personifications';
import {
  Check,
  Edit3,
  Filter,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Sliders,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

export const PersonificationManager: React.FC = () => {
  const personas = useStore(humanPersonasStore);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingPersona, setEditingPersona] = useState<HumanPersona | null>(null);

  // Edit form states
  const [formPrompt, setFormPrompt] = useState<string>('');
  const [formTerms, setFormTerms] = useState<string>('');
  const [formWeight, setFormWeight] = useState<number>(3);
  const [formEnabled, setFormEnabled] = useState<boolean>(true);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const openEditor = (p: HumanPersona) => {
    setEditingPersona(p);
    setFormPrompt(p.prompt);
    setFormTerms(p.terms || '');
    setFormWeight(p.weight || 3);
    setFormEnabled(p.enabled !== false);
    setSaveSuccess(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPersona) return;

    updatePersona(editingPersona.id, {
      prompt: formPrompt.trim(),
      terms: formTerms.trim() || undefined,
      weight: formWeight,
      enabled: formEnabled,
    });

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setEditingPersona(null);
    }, 700);
  };

  const handleResetCurrent = () => {
    if (!editingPersona) return;
    resetPersona(editingPersona.id);
    const updated = humanPersonasStore.get().find((p) => p.id === editingPersona.id);
    if (updated) {
      setFormPrompt(updated.prompt);
      setFormTerms(updated.terms || '');
      setFormWeight(updated.weight || 3);
      setFormEnabled(updated.enabled !== false);
    }
  };

  // Filtered personas
  const filteredPersonas = useMemo(() => {
    return personas.filter((p) => {
      const matchesCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.archetype.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.prompt.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [personas, selectedCategory, searchQuery]);

  const enabledCount = personas.filter((p) => p.enabled !== false).length;

  return (
    <div className="space-y-5 text-xs text-slate-300">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-950/40 via-[#0e0e28] to-cyan-950/40 border border-violet-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-white">100-Person Human Archetype Swarm</h3>
            <span className="px-2 py-0.5 text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full">
              100% Modifiable Personifications
            </span>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xl leading-relaxed">
            Every human perspective—from field farmers and technicians to lawyers, accountants, trauma surgeons, students, and street philosophers—deliberates before code is written. Customize any person's prompt and permissions below.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Reset all 100 personifications to their default prompts and permissions?')) {
                resetAllPersonas();
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-[11px] font-medium flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3 h-3 text-slate-400" />
            <span>Reset All 100</span>
          </button>
        </div>
      </div>

      {/* Stats & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search all 100 personas by name, profession, archetype, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-black/40 border border-[#1e1e3a] focus:border-cyan-500/50 outline-none text-white text-xs placeholder:text-slate-500 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Quick Stats Pill */}
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#0e0e24] border border-[#1e1e3a] text-[11px] shrink-0">
          <span className="text-slate-400">
            Active in Swarm: <strong className="text-emerald-400">{enabledCount} / 100</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">
            Showing: <strong className="text-white">{filteredPersonas.length}</strong>
          </span>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-xl font-medium text-[11px] transition-colors shrink-0 ${
            selectedCategory === 'all'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-[#0e0e24] text-slate-400 hover:text-slate-200 border border-white/5'
          }`}
        >
          All 10 Domains (100)
        </button>
        {PERSONA_CATEGORIES.map((c) => {
          const isSelected = selectedCategory === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1.5 rounded-xl font-medium text-[11px] transition-colors shrink-0 flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                  : 'bg-[#0e0e24] text-slate-400 hover:text-slate-200 border border-white/5'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
              <span>{c.name}</span>
            </button>
          );
        })}
      </div>

      {/* Personas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[52vh] overflow-y-auto pr-1">
        {filteredPersonas.map((p) => {
          return (
            <div
              key={p.id}
              className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                p.enabled
                  ? 'bg-[#0d0d22] border-[#1e1e3a] hover:border-cyan-500/30'
                  : 'bg-[#0a0a16] border-[#15152a] opacity-60'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">
                      {p.avatar}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{p.name}</span>
                        <span
                          className="px-1.5 py-0.2 text-[9px] font-semibold rounded-md border"
                          style={{
                            backgroundColor: `${p.color}15`,
                            color: p.color,
                            borderColor: `${p.color}30`,
                          }}
                        >
                          #{p.id}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">{p.role}</span>
                    </div>
                  </div>

                  {/* Status Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => togglePersonaPermission(p.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors shrink-0 ${
                      p.enabled
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}
                  >
                    {p.enabled ? 'ACTIVE' : 'MUTED'}
                  </button>
                </div>

                {/* Archetype & Terms */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-cyan-400/90">{p.archetype}</span>
                  {p.terms && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 truncate max-w-[150px]">
                      {p.terms}
                    </span>
                  )}
                </div>

                {/* Prompt Preview */}
                <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-3 bg-black/20 p-2 rounded-xl border border-white/5">
                  "{p.prompt}"
                </p>
              </div>

              {/* Card Footer: Weight & Edit Button */}
              <div className="flex items-center justify-between pt-2 border-t border-[#181832] text-[10px]">
                <span className="text-slate-500">
                  Debate Influence: <strong className="text-slate-300">{p.weight}/5</strong>
                </span>

                <button
                  type="button"
                  onClick={() => openEditor(p)}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-medium flex items-center gap-1 transition-colors"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Modify Personification</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Persona Edit Modal */}
      {editingPersona && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-3xl bg-[#0c0c22] border border-[#2e2e5c] shadow-2xl p-5 overflow-hidden flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1e1e3a]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl">
                  {editingPersona.avatar}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <span>{editingPersona.name}</span>
                    <span className="text-xs text-cyan-400 font-medium">({editingPersona.archetype})</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">{editingPersona.category} • {editingPersona.role}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingPersona(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
                    Personification Prompt & Worldview:
                  </label>
                  <button
                    type="button"
                    onClick={handleResetCurrent}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset to Default Prompt</span>
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-[#2e2e5c] focus:border-cyan-500/60 outline-none text-white text-xs leading-relaxed font-sans"
                  placeholder="Describe this persona's specific worldview, demands, scrutiny, and debate priorities..."
                  required
                />
              </div>

              {/* Terms / Permissions Conditions */}
              <div>
                <label className="block text-[11px] font-bold text-slate-200 uppercase tracking-wider mb-1.5">
                  Permissions & Terms of Engagement:
                </label>
                <input
                  type="text"
                  value={formTerms}
                  onChange={(e) => setFormTerms(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-[#2e2e5c] focus:border-cyan-500/60 outline-none text-white text-xs"
                  placeholder="e.g. Must function offline, zero dark patterns, accessible to non-technical users..."
                />
              </div>

              {/* Weight & Active Toggle */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#1e1e3a]">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Debate Weight: <strong className="text-cyan-400">{formWeight} / 5</strong>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={formWeight}
                    onChange={(e) => setFormWeight(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/20 border border-white/5">
                  <span className="text-[11px] font-medium text-slate-300">Active in Swarm</span>
                  <input
                    type="checkbox"
                    checked={formEnabled}
                    onChange={(e) => setFormEnabled(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPersona(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition-colors flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
                >
                  {saveSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <span>Save Personification</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
