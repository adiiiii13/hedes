import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Terminal,
  Zap,
  Play,
  CornerDownRight,
} from 'lucide-react';
import type { ActionItemState } from '~/stores/chat';

interface InChatTerminalCardProps {
  action: ActionItemState;
  defaultExpanded?: boolean;
}

/**
 * Clean ANSI escape codes from stdout/stderr while preserving readable terminal text
 */
function cleanAnsi(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

export const InChatTerminalCard: React.FC<InChatTerminalCardProps> = ({
  action,
  defaultExpanded,
}) => {
  const isRunning = action.status === 'running';
  const isFailed = action.status === 'failed';
  const isComplete = action.status === 'complete';
  const isTerminal = action.type === 'terminal';
  const isStart = action.type === 'start';

  // Automatically expand if currently running or failed, otherwise respect default or user toggle
  const [expanded, setExpanded] = useState<boolean>(
    defaultExpanded ?? (isRunning || isFailed || !action.output)
  );
  const [copied, setCopied] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);

  const command = action.content?.trim() || '';
  const rawOutput = action.output || '';
  const displayOutput = cleanAnsi(rawOutput);

  // Auto-scroll terminal viewport to bottom as output streams in
  useEffect(() => {
    if (isRunning && expanded && outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayOutput, isRunning, expanded]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const fullText = `${action.cwd ? action.cwd + ' > ' : ''}${command}\n\n${displayOutput}`;
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Shorten command for title preview if needed
  const displayCommand = command.length > 55 ? command.slice(0, 52) + '...' : command;
  const cwdDisplay = action.cwd
    ? action.cwd.length > 40
      ? '...' + action.cwd.slice(-35)
      : action.cwd
    : 'HEDES';

  return (
    <div className="flex flex-col rounded-xl overflow-hidden border border-[#222436] bg-[#0c0d18] transition-all shadow-md">
      {/* Header Pill (Antigravity-style Ran/Running item) */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors cursor-pointer group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Status Indicator */}
          <div className="shrink-0">
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            ) : isFailed ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </div>

          {/* Action Title */}
          <div className="flex items-center gap-1.5 min-w-0 truncate text-xs font-mono">
            <span className="text-slate-400 font-medium shrink-0">
              {isRunning ? 'Running' : isFailed ? 'Failed' : 'Ran'}
            </span>
            <span
              className={`font-semibold truncate ${
                isTerminal
                  ? 'text-purple-300'
                  : isStart
                  ? 'text-violet-300'
                  : isFailed
                  ? 'text-rose-300'
                  : 'text-emerald-300'
              }`}
            >
              {displayCommand}
            </span>
            {isTerminal && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 shrink-0">
                system
              </span>
            )}
          </div>
        </div>

        {/* Right side controls: duration, copy, and chevron */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {action.duration && (
            <span className="text-[10px] font-mono text-slate-500 bg-white/[0.04] px-1.5 py-0.5 rounded">
              {action.duration}
            </span>
          )}

          <div className="text-slate-400 group-hover:text-slate-200 transition-colors">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
        </div>
      </button>

      {/* Terminal Window Body */}
      {expanded && (
        <div className="border-t border-[#1b1d2e] bg-[#07080f] flex flex-col font-mono text-xs">
          {/* Terminal Top Bar (Prompt line + Copy) */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0c16] border-b border-[#161828] text-[11px]">
            <div className="flex items-center gap-2 text-slate-400 truncate min-w-0">
              <span className="text-slate-500 shrink-0">{cwdDisplay} &gt;</span>
              <span className="text-slate-200 font-semibold truncate">{command}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-white/10 transition-colors cursor-pointer"
                title="Copy terminal command and output"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Terminal Output Log Area */}
          <div className="p-3 max-h-64 overflow-y-auto overflow-x-auto text-[11.5px] leading-relaxed select-text font-mono">
            {displayOutput ? (
              <pre className="text-slate-300 whitespace-pre-wrap font-mono break-words m-0">
                {displayOutput}
              </pre>
            ) : isRunning ? (
              <div className="flex items-center gap-2 text-cyan-400/80 animate-pulse text-[11px]">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                <span>Working...</span>
              </div>
            ) : (
              <span className="text-slate-600 italic text-[11px]">Done (no output)</span>
            )}
            <div ref={outputEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};
