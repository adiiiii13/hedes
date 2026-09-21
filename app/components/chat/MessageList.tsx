import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { chatMessages, chatInput, isGenerating } from '~/stores/chat';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { Sparkles, Code, Terminal, Layers, ArrowDown } from 'lucide-react';

export const MessageList: React.FC = () => {
  const messages = useStore(chatMessages);
  const generating = useStore(isGenerating);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isUp = distanceFromBottom > 90;
    userScrolledUp.current = isUp;
    setShowScrollBottom(isUp);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      userScrolledUp.current = false;
      setShowScrollBottom(false);
    }
  };

  // Reset scroll lock when a new message is added
  useEffect(() => {
    userScrolledUp.current = false;
    setShowScrollBottom(false);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Auto-scroll while generating, but ONLY if the user has not intentionally scrolled up to inspect code
  useEffect(() => {
    if (scrollRef.current && !userScrolledUp.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, generating]);

  const displayMessages = messages.filter((m) => m.role !== 'system');

  if (displayMessages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 select-none">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-[0_0_25px_rgba(16,185,129,0.15)]">
          <Sparkles className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-slate-200">Where ideas become reality</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
          Prompt, build, test, and run fullstack web applications live in your local environment.
        </p>

        <div className="grid grid-cols-2 gap-2 mt-6 w-full max-w-sm">
          {[
            { icon: Code, label: 'React Dashboard', prompt: 'Build a modern dark-mode analytics dashboard in React with Lucide icons' },
            { icon: Terminal, label: 'Todo App', prompt: 'Create a clean, responsive Kanban todo app with drag and drop' },
            { icon: Layers, label: 'Timer & Stopwatch', prompt: 'Build a sleek precision stopwatch and countdown timer with presets' },
            { icon: Sparkles, label: 'Weather App', prompt: 'Build a real-time weather app with geolocation and 7-day forecast' },
          ].map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              type="button"
              onClick={() => chatInput.set(prompt)}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-[#121226] border border-[#1e1e38] hover:border-emerald-500/30 hover:bg-[#161630] transition-all text-left text-xs group cursor-pointer"
            >
              <Icon className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
              <span className="text-slate-300 group-hover:text-white truncate font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden flex flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-2 modern-scrollbar"
      >
        {displayMessages.map((msg, idx) => {
          if (msg.role === 'user') {
            return <UserMessage key={msg.id || idx} message={msg} />;
          }
          return (
            <AssistantMessage
              key={msg.id || idx}
              message={msg}
              isLast={idx === displayMessages.length - 1}
            />
          );
        })}
      </div>

      {/* Floating Scroll to Bottom button when user scrolled up to read code */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 right-5 p-2 rounded-full bg-[#1e1e3a] hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 border border-white/10 hover:border-emerald-500/40 shadow-xl transition-all flex items-center gap-1.5 text-xs font-mono cursor-pointer z-20 animate-fade-in"
          title="Scroll to latest"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span className="text-[10px]">Latest</span>
        </button>
      )}
    </div>
  );
};
