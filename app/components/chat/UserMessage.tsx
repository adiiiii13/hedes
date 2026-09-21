import React, { memo } from 'react';
import { User } from 'lucide-react';
import { Markdown } from './Markdown';
import type { ChatMessage } from '~/stores/chat';

interface UserMessageProps {
  message: ChatMessage;
}

export const UserMessage = memo(({ message }: UserMessageProps) => {
  return (
    <div className="flex flex-col gap-2 w-full py-3 group">
      {/* Sender Header */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
          <User className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-semibold text-slate-300">You</span>
        <span className="text-[10px] text-slate-500 font-mono">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Message Body */}
      <div className="pl-8 w-full">
        <div className="p-3 rounded-xl bg-[#151528] border border-[#22223c] text-slate-100 text-sm inline-block max-w-full">
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2.5">
              {message.images.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`uploaded-mockup-${idx}`}
                  className="max-w-[280px] max-h-52 rounded-lg object-cover border border-emerald-500/30 shadow-md cursor-pointer hover:opacity-95 transition-opacity"
                  onClick={() => window.open(img, '_blank')}
                  title="Click to view full image"
                />
              ))}
            </div>
          )}
          <Markdown>{message.content}</Markdown>
        </div>
      </div>
    </div>
  );
});
