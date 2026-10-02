import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { hiveMindBots, hiveMindCategories, hiveMindState, selectBot } from '~/stores/hive';
import type { HiveBot } from '~/engine/hive-mind';

const statusStyle: Record<HiveBot['status'], string> = {
  idle: 'border-white/10 bg-white/[0.04] text-slate-400',
  analyzing: 'border-cyan-400/60 bg-cyan-400/20 text-cyan-100 animate-pulse',
  debating: 'border-violet-400/60 bg-violet-400/20 text-violet-100 animate-pulse',
  consensus: 'border-amber-400/60 bg-amber-400/20 text-amber-100',
  complete: 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200',
  failed: 'border-rose-400/50 bg-rose-400/15 text-rose-200',
};

export const BotGrid: React.FC = () => {
  const bots = useStore(hiveMindBots);
  const categories = useStore(hiveMindCategories);
  const state = useStore(hiveMindState);
  const [activeCategory, setActiveCategory] = useState('all');
  const filtered = activeCategory === 'all' ? bots : bots.filter((bot) => bot.categoryId === activeCategory);
  const selected = bots.find((bot) => bot.id === state.selectedBotId);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        <button type="button" onClick={() => setActiveCategory('all')} className={`whitespace-nowrap rounded-full border px-3 py-1.5 ${activeCategory === 'all' ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200' : 'border-white/10 text-slate-400'}`}>All bots</button>
        {categories.map((category) => <button key={category.id} type="button" onClick={() => setActiveCategory(category.id)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 ${activeCategory === category.id ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200' : 'border-white/10 text-slate-400'}`}>{category.name.split('&')[0].trim()}</button>)}
      </div>
      <div className="grid grid-cols-5 gap-1.5 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-10">
        {filtered.map((bot) => <button
          key={bot.id}
          type="button"
          onClick={() => selectBot(bot.id)}
          aria-label={`Bot ${bot.id}, ${bot.name}, ${bot.status}`}
          aria-pressed={state.selectedBotId === bot.id}
          className={`min-h-9 rounded-lg border text-xs font-semibold transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${statusStyle[bot.status]} ${state.selectedBotId === bot.id ? 'ring-2 ring-cyan-400' : ''}`}
        >{bot.id}</button>)}
      </div>
      {selected && <div className="rounded-xl border border-cyan-400/25 bg-slate-950/60 p-3 text-xs" role="region" aria-label={`Bot ${selected.id} reply`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-cyan-200">#{selected.id} {selected.name}</strong>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-slate-300">{selected.status}</span>
        </div>
        <p className="mt-1 text-slate-400">{selected.role} · {selected.category}</p>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-slate-200">{selected.status === 'complete' ? selected.thought : selected.status === 'failed' ? `Could not reply: ${selected.thought}` : 'Waiting for this bot to reply.'}</p>
      </div>}
    </div>
  );
};
