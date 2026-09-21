import React from 'react';
import { useStore } from '@nanostores/react';
import { hiveMindState } from '~/stores/hive';
import { CheckCircle2, ShieldCheck, Award } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const ConsensusView: React.FC = () => {
  const state = useStore(hiveMindState);

  if (!state.consensusSummary) {
    return null;
  }

  return (
    <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-950/40 via-[#0f1d24]/60 to-[#111128] border border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.1)] text-xs">
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-emerald-500/20">
        <div className="flex items-center gap-1.5 font-bold text-emerald-400">
          <Award className="w-4 h-4 text-emerald-400" />
          <span>Supreme Swarm Consensus Unlocked</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-emerald-300 font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>100/100 VOTES VERIFIED</span>
        </div>
      </div>

      <div className="prose prose-invert prose-xs max-w-none text-slate-300 leading-relaxed font-sans">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {state.consensusSummary}
        </ReactMarkdown>
      </div>
    </div>
  );
};
