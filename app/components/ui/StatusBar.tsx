import React from 'react';

export const StatusBar: React.FC = () => {
  return (
    <div className="h-6 w-full bg-[#0c0c20] border-t border-[#1e1e3a] flex items-center justify-between px-3 text-[10px] font-mono text-slate-400 z-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
          <span className="font-bold text-slate-300">SWARM HEALTH: 100/100 OK</span>
        </div>
        <div className="w-px h-3 bg-white/10"></div>
        <span>Memory: 412MB / 4096MB</span>
        <div className="w-px h-3 bg-white/10"></div>
        <span>Session: #hedes-stopwatch-aurora</span>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
          <span>Vite HMR: Connected</span>
        </div>
        <span>Tab Size: 2</span>
        <span>Spaces: 2</span>
        <span>Ln 11, Col 42</span>
        <span className="text-emerald-400">Prettier: OK</span>
        <div className="w-px h-3 bg-white/10"></div>
        <span className="text-cyan-400">Hedes Docs • v4.8.2-aurora • <span className="font-bold text-emerald-400">ALL AGENTS SYNCHRONIZED</span></span>
      </div>
    </div>
  );
};
