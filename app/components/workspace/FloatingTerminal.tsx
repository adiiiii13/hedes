import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { terminalStore, activeProjectDir, activeProjectName } from '~/stores/workspace';
import { currentChatId } from '~/stores/chat';
import type { ITerminal } from '~/types/terminal';
import {
  Terminal as TerminalIcon,
  Plus,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  Square,
  Sparkles,
  RefreshCw,
  Folder,
  Play,
  Check,
  ChevronRight,
  ChevronsUp,
  ChevronsDown,
  ArrowDown,
  Wrench,
} from 'lucide-react';

interface TerminalTab {
  id: string;
  name: string;
}

interface TerminalSession {
  term: any;
  fitAddon: any;
  abortController: AbortController | null;
  isRunning: boolean;
  commandHistory: string[];
  historyIndex: number;
  currentInput: string;
  cwd: string;
}

function formatPrompt(cwd?: string): string {
  let displayPath = '~';
  if (cwd) {
    const norm = cwd.replace(/\\/g, '/');
    const match = norm.match(/projects\/([^/]+(?:\/.*)?)$/i);
    if (match) {
      displayPath = match[1];
    } else {
      const parts = norm.split('/');
      displayPath = parts[parts.length - 1] || '~';
    }
  }
  return `\x1b[1;36mhedes\x1b[0m \x1b[90m[${displayPath}]\x1b[0m \x1b[32m❯\x1b[0m `;
}

interface FloatingTerminalProps {
  onClose?: () => void;
}

export const FloatingTerminal: React.FC<FloatingTerminalProps> = ({ onClose }) => {
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: 'term-1', name: 'Terminal 1' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('term-1');
  const [runningMap, setRunningMap] = useState<Record<string, boolean>>({});
  const [shellType, setShellType] = useState<'powershell' | 'cmd'>('powershell');
  const [fontSize, setFontSize] = useState<number>(12);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const commandInputRef = useRef<HTMLInputElement>(null);

  const activeDir = useStore(activeProjectDir);
  const activeProj = useStore(activeProjectName);

  // Map of tabId -> Session state
  const sessionsRef = useRef<Map<string, TerminalSession>>(new Map());
  // In-flight init lock to prevent duplicate async initialization
  const initializingTabsRef = useRef<Set<string>>(new Set());
  // Map of tabId -> container DOM element
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const mainWrapperRef = useRef<HTMLDivElement>(null);
  const nextTabNumRef = useRef<number>(2);

  // Responsive ResizeObserver to automatically resize terminals when user drags layout divider or resizes window
  useEffect(() => {
    const handleFit = () => {
      const activeSession = sessionsRef.current.get(activeTabId);
      if (activeSession?.fitAddon) {
        try {
          activeSession.fitAddon.fit();
        } catch {}
      }
    };

    window.addEventListener('resize', handleFit);

    let observer: ResizeObserver | null = null;
    if (mainWrapperRef.current) {
      observer = new ResizeObserver(handleFit);
      observer.observe(mainWrapperRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleFit);
      if (observer) observer.disconnect();
    };
  }, [activeTabId]);

  // Execute command in a specific terminal tab with complete line-buffering & cwd tracking
  const executeCommand = useCallback(async (tabId: string, cmd: string) => {
    const session = sessionsRef.current.get(tabId);
    if (!session) return;

    const trimmed = cmd.trim();
    if (!trimmed) {
      session.term.write(formatPrompt(session.cwd));
      return;
    }

    // Built-in local clear
    if (trimmed === 'clear' || trimmed === 'cls') {
      session.term.clear();
      session.term.write(formatPrompt(session.cwd));
      return;
    }

    // Record command history
    if (!session.commandHistory.length || session.commandHistory[session.commandHistory.length - 1] !== trimmed) {
      session.commandHistory.push(trimmed);
    }
    session.historyIndex = -1;

    // Start execution
    session.isRunning = true;
    setRunningMap((prev) => ({ ...prev, [tabId]: true }));
    const controller = new AbortController();
    session.abortController = controller;

    try {
      const chatId = currentChatId.get();
      const response = await fetch('/api/local/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          chatId,
          command: trimmed,
          cwd: session.cwd || undefined,
          shellType,
        }),
      });

      if (!response.body) {
        throw new Error('No output stream received from server');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n');
        // Keep the trailing uncompleted line fragment in streamBuffer
        streamBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const isAtBottom = session.term.buffer.active.viewportY >= session.term.buffer.active.baseY;
          try {
            const payload = JSON.parse(line);
            if (payload.type === 'stdout' || payload.type === 'stderr') {
              const formatted = payload.data.replace(/\r?\n/g, '\r\n');
              session.term.write(formatted);
              if (isAtBottom) {
                session.term.scrollToBottom();
              }
            } else if (payload.type === 'cwd') {
              session.cwd = payload.data;
            } else if (payload.type === 'exit') {
              if (payload.data !== '0' && !controller.signal.aborted) {
                session.term.write(`\r\n\x1b[31m[Process exited with code ${payload.data}]\x1b[0m\r\n`);
                if (isAtBottom) session.term.scrollToBottom();
              }
            } else if (payload.type === 'error') {
              session.term.write(`\r\n\x1b[31m${payload.data}\x1b[0m\r\n`);
              if (isAtBottom) session.term.scrollToBottom();
            }
          } catch {
            session.term.write(line.replace(/\r?\n/g, '\r\n') + '\r\n');
            if (isAtBottom) session.term.scrollToBottom();
          }
        }
      }

      // Flush any remaining buffer text
      if (streamBuffer.trim()) {
        const isAtBottom = session.term.buffer.active.viewportY >= session.term.buffer.active.baseY;
        try {
          const payload = JSON.parse(streamBuffer);
          if (payload.type === 'stdout' || payload.type === 'stderr') {
            session.term.write(payload.data.replace(/\r?\n/g, '\r\n'));
            if (isAtBottom) session.term.scrollToBottom();
          } else if (payload.type === 'cwd') {
            session.cwd = payload.data;
          }
        } catch {}
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        session.term.write(`\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
        session.term.scrollToBottom();
      }
    } finally {
      session.isRunning = false;
      session.abortController = null;
      setRunningMap((prev) => ({ ...prev, [tabId]: false }));
      session.term.write(formatPrompt(session.cwd));
      session.term.scrollToBottom();
      setIsScrolledUp(false);
    }
  }, [shellType]);

  // Focus active terminal
  const focusActive = useCallback(() => {
    const session = sessionsRef.current.get(activeTabId);
    if (session?.term) {
      try {
        session.term.focus();
      } catch {}
    }
  }, [activeTabId]);

  // Initialize terminal instance for a tab
  const initTerminal = useCallback(
    async (tabId: string, container: HTMLDivElement) => {
      if (sessionsRef.current.has(tabId) || initializingTabsRef.current.has(tabId)) return;
      initializingTabsRef.current.add(tabId);

      try {
        const [xtermMod, fitMod] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
          import('@xterm/xterm/css/xterm.css'),
        ]);

        const TerminalClass =
          (xtermMod as any).Terminal || (xtermMod as any).default?.Terminal || xtermMod.default;
        const FitAddonClass =
          (fitMod as any).FitAddon || (fitMod as any).default?.FitAddon || fitMod.default;

        const initialCwd = activeDir || (activeProj ? `projects/${activeProj}` : '');

        const term = new TerminalClass({
          cursorBlink: true,
          cursorStyle: 'block',
          fontSize,
          fontFamily: 'Menlo, Monaco, "Courier New", Consolas, monospace',
          lineHeight: 1.25,
          convertEol: true,
          scrollback: 100000,
          scrollSensitivity: 2,
          fastScrollSensitivity: 5,
          smoothScrollDuration: 120,
          allowTransparency: true,
          theme: {
            background: '#080816',
            foreground: '#e2e8f0',
            cursor: '#10b981',
            cursorAccent: '#080816',
            selectionBackground: 'rgba(16, 185, 129, 0.35)',
            black: '#0f172a',
            red: '#f43f5e',
            green: '#10b981',
            yellow: '#f59e0b',
            blue: '#38bdf8',
            magenta: '#c084fc',
            cyan: '#06b6d4',
            white: '#f8fafc',
            brightBlack: '#64748b',
            brightGreen: '#34d399',
            brightCyan: '#22d3ee',
          },
        });

        const fitAddon = new FitAddonClass();
        term.loadAddon(fitAddon);
        term.open(container);

        // Track user scroll position for infinite scroll & jump-to-bottom indicator
        term.onScroll(() => {
          const buf = term.buffer.active;
          const scrolledUp = buf.viewportY < buf.baseY;
          setIsScrolledUp(scrolledUp);
        });

        // Keyboard navigation shortcuts for scrolling (Shift+PageUp, Shift+PageDown, Shift+Home, Shift+End)
        term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
          if (event.type === 'keydown') {
            if (event.shiftKey && event.key === 'PageUp') {
              term.scrollPages(-1);
              return false;
            }
            if (event.shiftKey && event.key === 'PageDown') {
              term.scrollPages(1);
              return false;
            }
            if (event.shiftKey && event.key === 'Home') {
              term.scrollToTop();
              return false;
            }
            if (event.shiftKey && event.key === 'End') {
              term.scrollToBottom();
              return false;
            }
          }
          return true;
        });
        
        // Initial fit with small delays to ensure DOM layout has computed width/height
        const doFit = () => {
          try {
            fitAddon.fit();
          } catch {}
        };
        setTimeout(doFit, 30);
        setTimeout(doFit, 120);
        setTimeout(doFit, 300);

        const session: TerminalSession = {
          term,
          fitAddon,
          abortController: null,
          isRunning: false,
          commandHistory: [],
          historyIndex: -1,
          currentInput: '',
          cwd: initialCwd,
        };
        sessionsRef.current.set(tabId, session);

        // Register primary terminal with terminalStore so AI background actions stream here
        if (tabId === 'term-1') {
          terminalStore.attachBoltTerminal(term as unknown as ITerminal);
        }

        // Welcome banner
        term.write('\x1b[32m✔ Hedes Interactive Terminal [Online]\x1b[0m\r\n');
        term.write(`\x1b[90mEngine: PowerShell | Type commands (ls, pwd, cd, npm, git) or press Ctrl+C to cancel.\x1b[0m\r\n\r\n`);
        term.write(formatPrompt(session.cwd));

      // Keystroke listener
      term.onData((data: string) => {
        const s = sessionsRef.current.get(tabId);
        if (!s) return;

        // Enter key
        if (data === '\r' || data === '\n') {
          term.write('\r\n');
          const toExec = s.currentInput;
          s.currentInput = '';
          s.historyIndex = -1;
          executeCommand(tabId, toExec);
          return;
        }

        // Ctrl+C key (break / cancel)
        if (data === '\x03') {
          if (s.isRunning && s.abortController) {
            s.abortController.abort();
            s.isRunning = false;
            setRunningMap((prev) => ({ ...prev, [tabId]: false }));
            term.write('^C\r\n');
          } else {
            s.currentInput = '';
            s.historyIndex = -1;
            term.write('^C\r\n' + formatPrompt(s.cwd));
          }
          return;
        }

        // Backspace key
        if (data === '\x7f' || data === '\b') {
          if (s.currentInput.length > 0) {
            s.currentInput = s.currentInput.slice(0, -1);
            term.write('\b \b');
          }
          return;
        }

        // Up Arrow (history previous)
        if (data === '\x1b[A') {
          if (s.commandHistory.length > 0) {
            const nextIdx = s.historyIndex + 1;
            if (nextIdx < s.commandHistory.length) {
              s.historyIndex = nextIdx;
              const historicalCmd = s.commandHistory[s.commandHistory.length - 1 - nextIdx];
              term.write('\r\x1b[K' + formatPrompt(s.cwd) + historicalCmd);
              s.currentInput = historicalCmd;
            }
          }
          return;
        }

        // Down Arrow (history next)
        if (data === '\x1b[B') {
          if (s.historyIndex > 0) {
            s.historyIndex -= 1;
            const historicalCmd = s.commandHistory[s.commandHistory.length - 1 - s.historyIndex];
            term.write('\r\x1b[K' + formatPrompt(s.cwd) + historicalCmd);
            s.currentInput = historicalCmd;
          } else if (s.historyIndex === 0) {
            s.historyIndex = -1;
            term.write('\r\x1b[K' + formatPrompt(s.cwd));
            s.currentInput = '';
          }
          return;
        }

        // Ctrl+L (clear screen)
        if (data === '\x0c') {
          term.clear();
          term.write(formatPrompt(s.cwd) + s.currentInput);
          return;
        }

        // Tab key: auto-complete or insert spaces
        if (data === '\t') {
          return;
        }

        // Normal typing or pasted characters
        if (!data.includes('\x1b')) {
          const clean = data.replace(/[\r\n]+/g, ' ');
          s.currentInput += clean;
          term.write(clean);
        }
      });

      } catch (err) {
        console.error('Failed to initialize terminal:', err);
      } finally {
        initializingTabsRef.current.delete(tabId);
      }
    },
    [executeCommand, activeDir, activeProj, fontSize]
  );

  // Mount active tab and newly created tabs
  useEffect(() => {
    tabs.forEach((tab) => {
      const container = containerRefs.current.get(tab.id);
      if (container && !sessionsRef.current.has(tab.id)) {
        initTerminal(tab.id, container);
      }
    });
  }, [tabs, initTerminal]);

  // Fit and focus active terminal on tab switch
  useEffect(() => {
    const session = sessionsRef.current.get(activeTabId);
    if (session) {
      setTimeout(() => {
        try {
          session.fitAddon.fit();
          session.term.focus();
        } catch {}
      }, 50);
    }
  }, [activeTabId]);

  // Update font size when changed
  useEffect(() => {
    sessionsRef.current.forEach((session) => {
      if (session?.term) {
        session.term.options.fontSize = fontSize;
        try {
          session.fitAddon.fit();
        } catch {}
      }
    });
  }, [fontSize]);

  // Add a new terminal tab
  const handleAddTab = () => {
    const num = nextTabNumRef.current++;
    const newId = `term-${Date.now()}`;
    const newTab: TerminalTab = {
      id: newId,
      name: `Terminal ${num}`,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  // Close a terminal tab
  const handleCloseTab = (tabId: string) => {
    if (tabs.length <= 1) return;

    const session = sessionsRef.current.get(tabId);
    if (session) {
      if (session.abortController) {
        session.abortController.abort();
      }
      terminalStore.detachBoltTerminal(session.term as unknown as ITerminal);
      session.term.dispose();
      sessionsRef.current.delete(tabId);
    }

    setTabs((prev) => {
      const updated = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(updated[updated.length - 1].id);
      }
      return updated;
    });

    setRunningMap((prev) => {
      const copy = { ...prev };
      delete copy[tabId];
      return copy;
    });
  };

  // Clear active terminal
  const handleClearActive = () => {
    const session = sessionsRef.current.get(activeTabId);
    if (session) {
      session.term.clear();
      session.term.write(formatPrompt(session.cwd));
      session.currentInput = '';
      session.term.focus();
    }
  };

  // Stop active running process (Ctrl+C equivalent)
  const handleStopActive = () => {
    const session = sessionsRef.current.get(activeTabId);
    if (session?.abortController) {
      session.abortController.abort();
      session.isRunning = false;
      setRunningMap((prev) => ({ ...prev, [activeTabId]: false }));
      session.term.write('^C\r\n' + formatPrompt(session.cwd));
      session.term.focus();
    }
  };

  // Quick run helper
  const handleQuickRun = (command: string) => {
    const session = sessionsRef.current.get(activeTabId);
    if (session) {
      session.term.write(command + '\r\n');
      executeCommand(activeTabId, command);
      session.term.focus();
    }
  };

  const isCurrentRunning = !!runningMap[activeTabId];
  const activeSession = sessionsRef.current.get(activeTabId);

  return (
    <div
      ref={mainWrapperRef}
      onClick={focusActive}
      className={`flex flex-col bg-[#080816] overflow-hidden cursor-text ${
        isMaximized
          ? 'fixed inset-0 z-50 w-screen h-screen shadow-2xl'
          : 'w-full h-full relative z-10'
      }`}
    >
      {/* ── Top Bar: Tabs, Shell Selector & Actions ── */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between px-2.5 py-1.5 bg-[#0e0e24] border-b border-[#1e1e3a] text-xs shrink-0 gap-2 overflow-x-auto modern-scrollbar select-none cursor-default"
      >
        {/* Left: Terminal Icon + Tabs List + Plus Button */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-1 text-slate-300 font-mono text-[11px] shrink-0 font-bold tracking-wider">
            <TerminalIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>TERMINAL</span>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto modern-scrollbar">
            {tabs.map((tab) => {
              const isActive = activeTabId === tab.id;
              const isRunning = !!runningMap[tab.id];

              return (
                <div
                  key={tab.id}
                  onClick={() => {
                    setActiveTabId(tab.id);
                    setTimeout(() => {
                      const s = sessionsRef.current.get(tab.id);
                      if (s?.fitAddon) {
                        try {
                          s.fitAddon.fit();
                        } catch {}
                      }
                      if (s?.term) {
                        const buf = s.term.buffer.active;
                        setIsScrolledUp(buf.viewportY < buf.baseY);
                      }
                      focusActive();
                    }, 50);
                  }}
                  className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono cursor-pointer transition-all border ${
                    isActive
                      ? 'bg-[#1b1b38] text-cyan-300 font-semibold border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
                  }`}
                  title={isRunning ? `${tab.name} (Running)` : tab.name}
                >
                  {isRunning ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-slate-400 shrink-0" />
                  )}
                  <span className="truncate max-w-[90px]">{tab.name}</span>
                  {tabs.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseTab(tab.id);
                      }}
                      className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-red-400 opacity-60 group-hover:opacity-100 transition-opacity ml-0.5"
                      title="Close Terminal"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* + Add New Terminal Tab Button */}
            <button
              type="button"
              onClick={handleAddTab}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-dashed border-white/10 hover:border-emerald-500/30 text-[11px] font-mono transition-colors shrink-0 cursor-pointer"
              title="Add New Terminal Tab"
            >
              <Plus className="w-3 h-3" />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Right: Shell Selector, Stop, Clear, Font size */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Shell Toggle (PowerShell / CMD) */}
          <div className="flex items-center rounded-md bg-black/40 border border-white/10 p-0.5 text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setShellType('powershell')}
              className={`px-1.5 py-0.5 rounded ${
                shellType === 'powershell'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Run commands via Windows PowerShell"
            >
              PS
            </button>
            <button
              type="button"
              onClick={() => setShellType('cmd')}
              className={`px-1.5 py-0.5 rounded ${
                shellType === 'cmd'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Run commands via Windows Command Prompt (CMD)"
            >
              CMD
            </button>
          </div>

          {/* Stop Running Process */}
          {isCurrentRunning && (
            <button
              type="button"
              onClick={handleStopActive}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 text-[10px] font-mono transition-all animate-pulse cursor-pointer shadow-[0_0_8px_rgba(239,68,68,0.3)]"
              title="Stop running process (Ctrl+C)"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              <span>Stop</span>
            </button>
          )}

          {/* Auto-Fix with AI */}
          <button
            type="button"
            onClick={() => {
              const s = sessionsRef.current.get(activeTabId);
              let logs = '';
              if (s?.term?.buffer?.active) {
                const buffer = s.term.buffer.active;
                const lines: string[] = [];
                const count = Math.min(buffer.length, 60);
                for (let i = buffer.length - count; i < buffer.length; i++) {
                  const line = buffer.getLine(i);
                  if (line) lines.push(line.translateToString(true));
                }
                logs = lines.filter(Boolean).join('\n').trim();
              }
              const prompt = logs
                ? `⚡ Auto-Fix Diagnostics:\nThe application encountered an issue. Here are the recent terminal logs and errors:\n\`\`\`\n${logs}\n\`\`\`\nPlease analyze the root cause, inspect the project files, and write the complete replacement code using <boltAction type="file"> to fix the issue cleanly.`
                : `⚡ Auto-Fix Diagnostics:\nPlease inspect all current project files for syntax errors, missing imports, broken dependencies, or runtime issues, and output complete repaired replacement files so the website builds and runs without errors.`;
              window.dispatchEvent(new CustomEvent('trigger-chat', { detail: prompt }));
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-mono transition-colors cursor-pointer shadow-[0_0_8px_rgba(245,158,11,0.15)]"
            title="Analyze terminal logs and automatically fix code with AI"
          >
            <Wrench className="w-2.5 h-2.5 text-amber-400" />
            <span>Auto-Fix</span>
          </button>

          {/* Scroll to Top */}
          <button
            type="button"
            onClick={() => {
              const s = sessionsRef.current.get(activeTabId);
              if (s?.term) {
                s.term.scrollToTop();
                setIsScrolledUp(true);
              }
            }}
            className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
            title="Scroll to Top of Terminal History (Shift+Home)"
          >
            <ChevronsUp className="w-3.5 h-3.5" />
          </button>

          {/* Scroll to Bottom */}
          <button
            type="button"
            onClick={() => {
              const s = sessionsRef.current.get(activeTabId);
              if (s?.term) {
                s.term.scrollToBottom();
                setIsScrolledUp(false);
              }
            }}
            className="p-1 rounded text-slate-400 hover:text-emerald-400 hover:bg-white/5 transition-colors cursor-pointer"
            title="Scroll to Bottom of Terminal (Shift+End)"
          >
            <ChevronsDown className="w-3.5 h-3.5" />
          </button>

          {/* Clear Active Terminal */}
          <button
            type="button"
            onClick={handleClearActive}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
            title="Clear Terminal (Ctrl+L)"
          >
            <Trash2 className="w-3 h-3" />
          </button>

          {/* Maximize / Restore Terminal */}
          <button
            type="button"
            onClick={() => {
              const next = !isMaximized;
              setIsMaximized(next);
              setTimeout(() => {
                if (activeSession?.fitAddon) {
                  try {
                    activeSession.fitAddon.fit();
                    activeSession.term.focus();
                  } catch {}
                }
              }, 120);
            }}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
            title={isMaximized ? 'Restore Terminal Size' : 'Maximize Terminal Full Screen'}
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5 text-cyan-400" /> : <Maximize2 className="w-3 h-3" />}
          </button>

          {/* Close Panel Button (if docked) */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
              title="Close Terminal Panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Terminal Instances Container (Zero gap, edge-to-edge, accurate flex height) ── */}
      <div
        onClick={focusActive}
        className="flex-1 min-h-0 w-full relative overflow-hidden bg-[#080816] p-0"
      >
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;

          return (
            <div
              key={tab.id}
              tabIndex={0}
              onClick={focusActive}
              ref={(el) => {
                if (el) {
                  containerRefs.current.set(tab.id, el);
                  if (!sessionsRef.current.has(tab.id) && !initializingTabsRef.current.has(tab.id)) {
                    initTerminal(tab.id, el);
                  }
                } else {
                  containerRefs.current.delete(tab.id);
                }
              }}
              style={{ display: isActive ? 'block' : 'none' }}
              className="absolute inset-0 w-full h-full p-0 pl-1.5 pb-1 outline-none focus:ring-0"
            />
          );
        })}

        {/* Floating Scroll to Bottom pill when user scrolled up */}
        {isScrolledUp && (
          <button
            type="button"
            onClick={() => {
              const s = sessionsRef.current.get(activeTabId);
              if (s?.term) {
                s.term.scrollToBottom();
                setIsScrolledUp(false);
                s.term.focus();
              }
            }}
            className="absolute bottom-3 right-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[11px] font-semibold shadow-xl shadow-black/80 border border-emerald-400/50 backdrop-blur-md transition-all cursor-pointer animate-pulse"
            title="Jump to latest output (Shift+End)"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Jump to Bottom</span>
          </button>
        )}
      </div>

      {/* ── Direct Command Input Bar (Type command yourself & execute) ── */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="px-3 py-2 bg-[#0c0c20] border-t border-[#1e1e3a] shrink-0 select-none"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const cmd = commandInput.trim();
            if (!cmd) return;
            handleQuickRun(cmd);
            setCommandInput('');
          }}
          className="flex items-center gap-2"
        >
          <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-xs font-bold shrink-0">
            <TerminalIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-emerald-400 font-bold">❯</span>
          </div>
          <input
            ref={commandInputRef}
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder="Type your command here (e.g. npm run dev, ls, npm install) and press Enter..."
            className="flex-1 bg-black/50 border border-white/10 rounded-md px-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
          />
          <button
            type="submit"
            disabled={!commandInput.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-xs font-mono font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(16,185,129,0.15)]"
            title="Execute Command"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>RUN</span>
          </button>
        </form>
      </div>
    </div>
  );
};
