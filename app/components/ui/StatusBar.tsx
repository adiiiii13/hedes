import React from 'react';
import { useStore } from '@nanostores/react';
import { activeProjectName } from '~/stores/workspace';

export const StatusBar: React.FC = () => {
  const project = useStore(activeProjectName);
  return (
    <div className="h-7 w-full shrink-0 border-t border-white/10 app-background px-4 text-[10px] text-slate-500 flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-3"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_9px_rgba(34,211,238,0.7)]" /><span className="font-semibold tracking-widest text-slate-400">HEDES STUDIO</span><span className="truncate">{project || 'No project selected'}</span></div>
      <span className="hidden sm:inline">Local workspace • Memory • Skills • MCP</span>
    </div>
  );
};
