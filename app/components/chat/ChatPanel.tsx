import React from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { HiveMindPanel } from '~/components/hive/HiveMindPanel';
import { Activity } from 'lucide-react';

export const ChatPanel: React.FC = () => {
  return (
    <div className="flex flex-col h-full app-chat-background relative overflow-hidden">
      {/* Stream Header */}
      <div className="h-12 shrink-0 border-b border-white/10 flex items-center justify-between px-4 bg-white/[0.025]">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-bold text-slate-200 tracking-wide">Assistant</span>
        </div>
        <div className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-mono text-emerald-400">
          PROJECT CONTEXT
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
