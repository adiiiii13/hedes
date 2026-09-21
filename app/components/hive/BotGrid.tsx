import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { hiveMindBots, hiveMindCategories, selectBot } from '~/stores/hive';
import type { HiveBot } from '~/engine/hive-mind';

export const BotGrid: React.FC = () => {
  const bots = useStore(hiveMindBots);
  const categories = useStore(hiveMindCategories);
  const [hoveredBot, setHoveredBot] = useState<HiveBot | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filteredBots = activeCategory === 'all'
    ? bots
    : bots.filter((b) => b.category === activeCategory);

  const getStatusColor = (status: HiveBot['status']) => {
    switch (status) {
      case 'analyzing':
        return 'bg-cyan-400 shadow-[0_0_8px_#06b6d4] animate-pulse';
      case 'debating':
        return 'bg-violet-500 shadow-[0_0_8px_#8b5cf6] animate-pulse';
      case 'consensus':
        return 'bg-amber-400 shadow-[0_0_8px_#f59e0b]';
      case 'complete':
        return 'bg-emerald-400 shadow-[0_0_8px_#10b981]';
      default:
        return 'bg-slate-700 hover:bg-slate-500';
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
            activeCategory === 'all'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium'
              : 'bg-white/5 text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          All 100 Bots
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.name)}
            className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
              activeCategory === cat.name
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium'
                : 'bg-white/5 text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            {cat.name.split('&')[0].trim()}
          </button>
        ))}
      </div>

      {/* 100-Bot Matrix */}
      <div className="relative p-3 rounded-xl bg-[#0d0d20] border border-[#1e1e3a]">
        <div className="grid grid-cols-10 gap-2">
          {filteredBots.map((bot) => (
            <motion.div
              key={bot.id}
              whileHover={{ scale: 1.3, zIndex: 30 }}
              onClick={() => selectBot(bot.id)}
              onMouseEnter={() => setHoveredBot(bot)}
              onMouseLeave={() => setHoveredBot(null)}
              className="relative flex items-center justify-center cursor-pointer group"
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-mono font-bold transition-all ${getStatusColor(
                  bot.status,
                )} text-slate-950`}
              >
                {bot.id}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Hovered Bot Inspector Tooltip */}
        <AnimatePresence>
          {hoveredBot && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="absolute bottom-2 left-2 right-2 p-2.5 rounded-lg bg-[#151532] border border-emerald-500/30 shadow-xl pointer-events-none z-40 text-xs"
            >
              <div className="flex items-center justify-between font-semibold text-emerald-300">
                <span>Bot #{hoveredBot.id}: {hoveredBot.name}</span>
                <span className="uppercase text-[10px] tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                  {hoveredBot.status}
                </span>
              </div>
              <div className="text-slate-400 text-[11px] mt-0.5">{hoveredBot.category} • {hoveredBot.role}</div>
              {hoveredBot.thought && (
                <div className="text-slate-200 text-[11px] mt-1.5 italic bg-black/30 p-1.5 rounded">
                  "{hoveredBot.thought}"
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
