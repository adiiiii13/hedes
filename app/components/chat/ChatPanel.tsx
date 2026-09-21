import React from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { HiveMindPanel } from '~/components/hive/HiveMindPanel';
import { Activity } from 'lucide-react';

export const ChatPanel: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-[#0a0a1a] relative overflow-hidden">
      {/* Stream Header */}
      <div className="h-10 shrink-0 border-b border-[#1e1e3a] flex items-center justify-between px-4 bg-[#0d0d20]">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono text-[11px] font-bold text-slate-300 tracking-wider">HEDES CHAT</span>
        </div>
        <div className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-mono text-emerald-400">
          100 AGENTS POOLED
        </div>
      </div>

      {/* Scrollable message list — takes all remaining height */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <MessageList />
      </div>

      {/* Hive Mind Panel (above input) */}
      <div className="shrink-0 px-2 pb-1">
        <HiveMindPanel />
      </div>

      {/* Persistent Chat Input */}
      <ChatInput />
    </div>
  );
};
