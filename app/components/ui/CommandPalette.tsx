import React, { useEffect, useState, useRef } from 'react';
import { Search, Mic, Store, Settings, Folder, Play, Activity, Brain, BookOpen, X, Command } from 'lucide-react';

export interface CommandItem {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands?: CommandItem[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultCommands: CommandItem[] = [
    {
      id: 'voice',
      title: 'Open Voice Assistant & Audio Workspace',
      category: 'Workspace',
      shortcut: 'Alt+V',
      icon: <Mic className="w-4 h-4 text-cyan-400" />,
      action: () => {
        window.dispatchEvent(new CustomEvent('open-voice-modal'));
        onClose();
      },
    },
    {
      id: 'store',
      title: 'Open HEDES Store (MCP, Skills, Plugins)',
      category: 'Ecosystem',
      shortcut: 'Ctrl+Shift+S',
      icon: <Store className="w-4 h-4 text-emerald-400" />,
      action: () => {
        window.dispatchEvent(new CustomEvent('open-store-modal'));
        onClose();
      },
    },
    {
      id: 'dev-server',
      title: 'Run Website Preview (Local Dev Server)',
      category: 'Terminal & Actions',
      shortcut: 'Ctrl+F5',
      icon: <Play className="w-4 h-4 text-teal-400" />,
      action: () => {
        window.dispatchEvent(new CustomEvent('trigger-run-website'));
        onClose();
      },
    },
    {
      id: 'diagnostics',
      title: 'Diagnostics & System Health Report',
      category: 'Settings',
      icon: <Activity className="w-4 h-4 text-amber-400" />,
      action: () => {
        window.dispatchEvent(new CustomEvent('open-diagnostics-modal'));
        onClose();
      },
    },
    {
      id: 'memory',
      title: 'Inspect Tree Memory & Provenance',
      category: 'Memory',
      icon: <Brain className="w-4 h-4 text-purple-400" />,
      action: () => {
        window.dispatchEvent(new CustomEvent('open-memory-modal'));
        onClose();
      },
    },
    {
      id: 'skills',
      title: 'Skills Library & Draft Evaluations',
      category: 'Skills',
      icon: <BookOpen className="w-4 h-4 text-blue-400" />,
      action: () => {
        window.dispatchEvent(new CustomEvent('open-skills-modal'));
        onClose();
      },
    },
    {
      id: 'settings',
      title: 'Appearance & System Preferences',
      category: 'Settings',
      shortcut: 'Ctrl+,',
      icon: <Settings className="w-4 h-4 text-slate-300" />,
      action: () => {
        window.dispatchEvent(new CustomEvent('open-settings-modal'));
        onClose();
      },
    },
  ];

  const allCommands = commands || defaultCommands;
  const filtered = allCommands.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else window.dispatchEvent(new CustomEvent('open-command-palette'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filtered[selectedIndex];
      if (selected) {
        selected.action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#060b19] shadow-2xl overflow-hidden focus-visible:outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search header */}
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3 bg-white/[0.02]">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search actions..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
            aria-label="Search actions"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1" role="listbox">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No matching actions found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const active = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  role="option"
                  aria-selected={active}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs sm:text-sm cursor-pointer transition-colors ${
                    active
                      ? 'bg-cyan-500/15 text-white border border-cyan-500/30'
                      : 'text-slate-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="p-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                      {item.icon}
                    </span>
                    <div className="truncate">
                      <span className="font-medium">{item.title}</span>
                      <span className="ml-2 text-[10px] text-slate-500 uppercase tracking-wider">
                        {item.category}
                      </span>
                    </div>
                  </div>
                  {item.shortcut && (
                    <kbd className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400 font-mono">
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/30 px-4 py-2 text-[10px] text-slate-500">
          <span>Navigate with ↑ / ↓, select with Enter</span>
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3" /> HEDES Command Palette
          </span>
        </div>
      </div>
    </div>
  );
}
