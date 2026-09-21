import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  hiveMindState,
  isHivePanelExpanded,
  toggleHivePanel,
} from '~/stores/hive';
import { BotGrid } from './BotGrid';
import { DebateLog } from './DebateLog';
import { ConsensusView } from './ConsensusView';
import { Bot, ChevronDown, ChevronUp, Cpu, Flame, Layers } from 'lucide-react';

export const HiveMindPanel: React.FC = () => {
  const state = useStore(hiveMindState);
  const isExpanded = useStore(isHivePanelExpanded);
  const [activeTab, setActiveTab] = useState<'matrix' | 'debate' | 'consensus'>('matrix');

  if (!state.isActive) {
    return null;
  }

  const getPhaseBadge = () => {
    switch (state.phase) {
      case 'spawning':
        return <span className="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">Spawning 100 Bots</span>;
      case 'analyzing':
        return <span className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 animate-pulse">Parallel Swarm Analysis</span>;
      case 'debating':
        return <span className="text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20 animate-pulse">Cross-Category Debate</span>;
      case 'consensus':
        return <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Synthesizing Consensus</span>;
      case 'complete':
        return <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Consensus Reached</span>;
      default:
        return null;
    }
  };

  return (
    <div className="mb-4 rounded-2xl bg-[#111128]/90 border border-violet-500/30 backdrop-blur-xl shadow-[0_0_30px_rgba(139,92,246,0.12)] overflow-hidden transition-all">
      {/* Header / Toggle bar */}
      <div
        onClick={toggleHivePanel}
        className="flex items-center justify-between p-3.5 cursor-pointer bg-gradient-to-r from-violet-950/30 to-[#111128] hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.3)]">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-violet-200 tracking-wide">
                100-BOT HIVE MIND SWARM
              </span>
              {getPhaseBadge()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
              <span>100 Autonomous Agents</span>
              <span>•</span>
              <span>10 Categories</span>
              <span>•</span>
              <span className="text-violet-300 font-medium">{state.progress}% Synchronized</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mini progress ring or bar */}
          <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden border border-white/5">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-500 to-emerald-400"
              style={{ width: `${state.progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <button className="p-1 rounded-lg text-slate-400 hover:text-white">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable Content Body */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="p-3 border-t border-[#1e1e3a] flex flex-col gap-3"
          >
            {/* Tab navigation */}
            <div className="flex items-center gap-2 border-b border-[#1e1e3a] pb-2 text-xs">
              <button
                onClick={() => setActiveTab('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  activeTab === 'matrix'
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>100-Bot Grid</span>
              </button>
              <button
                onClick={() => setActiveTab('debate')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                  activeTab === 'debate'
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Live Debate Log ({state.debateLogs.length})</span>
              </button>
              {state.consensusSummary && (
                <button
                  onClick={() => setActiveTab('consensus')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                    activeTab === 'consensus'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Final Master Plan</span>
                </button>
              )}
            </div>

            {/* Tab Panels */}
            {activeTab === 'matrix' && <BotGrid />}
            {activeTab === 'debate' && <DebateLog />}
            {activeTab === 'consensus' && <ConsensusView />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
