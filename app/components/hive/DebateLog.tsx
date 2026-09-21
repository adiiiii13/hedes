import React, { useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { hiveMindState } from '~/stores/hive';
import { MessageSquare, ShieldCheck, Zap } from 'lucide-react';

export const DebateLog: React.FC = () => {
  const state = useStore(hiveMindState);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.debateLogs]);

  if (state.debateLogs.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-slate-500 italic">
        Awaiting prompt to initiate 100-Bot cross-category debate...
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1 text-xs"
    >
      {state.debateLogs.map((log) => (
        <div
          key={log.id}
          className="p-2.5 rounded-lg bg-[#0e0e24] border border-[#1e1e3a] hover:border-violet-500/30 transition-colors"
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 font-medium text-violet-300">
              <MessageSquare className="w-3.5 h-3.5 text-violet-400" />
              <span>{log.botName}</span>
              <span className="text-[10px] text-slate-400 font-normal">({log.category})</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
              Round {log.round}
            </span>
          </div>
          <p className="text-slate-300 leading-relaxed">{log.text}</p>
        </div>
      ))}
    </div>
  );
};
