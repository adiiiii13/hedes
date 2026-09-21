import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  terminalShellType,
  terminalFontSize,
  terminalCursorStyle,
  setTerminalShellType,
  setTerminalFontSize,
  isSettingsBackendSynced,
} from '~/stores/settings';
import { activeProjectDir, activeProjectName } from '~/stores/workspace';
import {
  Terminal as TerminalIcon,
  Check,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
  Folder,
  ShieldCheck,
} from 'lucide-react';

export const TerminalSettings: React.FC = () => {
  const currentShell = useStore(terminalShellType);
  const currentFontSize = useStore(terminalFontSize);
  const activeDir = useStore(activeProjectDir);
  const activeProj = useStore(activeProjectName);
  const isSynced = useStore(isSettingsBackendSynced);

  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTestShell = async () => {
    setTesting(true);
    setTestOutput(null);
    const start = Date.now();
    try {
      const res = await fetch('/api/local/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: currentShell === 'powershell' ? 'Get-Date; pwd' : 'date /t & time /t & cd',
          shellType: currentShell,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let out = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const p = JSON.parse(line);
              if (p.type === 'stdout') out += p.data;
            } catch {}
          }
        }
      }
      const latency = Date.now() - start;
      setTestOutput(`✔ ${currentShell.toUpperCase()} verified in ${latency}ms:\n${out.trim()}`);
    } catch (err: any) {
      setTestOutput(`❌ Test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 text-xs text-slate-300">
      {/* Shell Selector Card */}
      <div className="p-4 rounded-2xl bg-[#0e0e24] border border-[#1e1e3a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-sm text-white">Default Terminal Engine (Windows Host)</h3>
          </div>
          {isSynced && (
            <span className="text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5" />
              <span>SAVED TO HOST</span>
            </span>
          )}
        </div>

        <p className="text-slate-400 mb-4 text-[11px] leading-relaxed">
          Select which underlying shell executes when you run commands in Hedes Studio's interactive terminal and AI action runner.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* PowerShell Option */}
          <div
            onClick={() => setTerminalShellType('powershell')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              currentShell === 'powershell'
                ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                : 'bg-black/30 border-[#1e1e3a] hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="font-bold text-xs text-cyan-300 flex items-center gap-2">
                <span>Windows PowerShell</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-500/20 text-cyan-300 font-mono">
                  RECOMMENDED
                </span>
              </div>
              {currentShell === 'powershell' && <Check className="w-4 h-4 text-cyan-400" />}
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Full modern cross-platform support. Native aliases for <code className="text-cyan-200">ls</code>, <code className="text-cyan-200">pwd</code>, <code className="text-cyan-200">cat</code>, git, and npm scripts.
            </p>
          </div>

          {/* Command Prompt (CMD) Option */}
          <div
            onClick={() => setTerminalShellType('cmd')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              currentShell === 'cmd'
                ? 'bg-violet-500/10 border-violet-500/50 shadow-[0_0_12px_rgba(139,92,246,0.15)]'
                : 'bg-black/30 border-[#1e1e3a] hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="font-bold text-xs text-violet-300 flex items-center gap-2">
                <span>Command Prompt (CMD)</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-white/10 text-slate-400 font-mono">
                  LEGACY
                </span>
              </div>
              {currentShell === 'cmd' && <Check className="w-4 h-4 text-violet-400" />}
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Standard Windows CMD interpreter (<code className="text-violet-200">dir</code>, <code className="text-violet-200">type</code>, <code className="text-violet-200">cls</code>).
            </p>
          </div>
        </div>

        {/* Live Subprocess Connection Test */}
        <div className="mt-4 pt-3 border-t border-[#1e1e3a] flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            Verify execution path & backend shell response:
          </div>
          <button
            type="button"
            onClick={handleTestShell}
            disabled={testing}
            className="px-3 py-1.5 rounded-xl bg-[#151532] hover:bg-[#1f1f48] border border-cyan-500/30 text-cyan-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
            ) : (
              <Play className="w-3 h-3 text-cyan-400" />
            )}
            <span>Test {currentShell.toUpperCase()}</span>
          </button>
        </div>

        {testOutput && (
          <pre className="mt-3 p-2.5 rounded-xl bg-black/60 border border-white/10 text-[11px] font-mono text-emerald-300 whitespace-pre-wrap leading-relaxed">
            {testOutput}
          </pre>
        )}
      </div>

      {/* Terminal Display & Font Sizing */}
      <div className="p-4 rounded-2xl bg-[#0e0e24] border border-[#1e1e3a]">
        <h3 className="font-bold text-sm text-white mb-2">Terminal Appearance & Font Size</h3>
        <p className="text-slate-400 mb-4 text-[11px]">
          Adjust font rendering size for comfortable typing and code reading in the terminal.
        </p>

        <div className="flex items-center gap-2">
          {[11, 12, 13, 14, 16].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setTerminalFontSize(size)}
              className={`px-3 py-1.5 rounded-xl font-mono text-xs border transition-all cursor-pointer ${
                currentFontSize === size
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold shadow-sm'
                  : 'bg-black/30 text-slate-400 border-[#1e1e3a] hover:text-white'
              }`}
            >
              {size}px
            </button>
          ))}
        </div>
      </div>

      {/* Working Directory Information */}
      <div className="p-4 rounded-2xl bg-[#0e0e24] border border-[#1e1e3a]">
        <div className="flex items-center gap-2 mb-2">
          <Folder className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-sm text-white">Active Project Working Directory</h3>
        </div>
        <p className="text-slate-400 text-[11px] mb-2 leading-relaxed">
          Interactive terminals and action runners automatically target your active project on host disk:
        </p>
        <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 text-[11px] font-mono text-cyan-300 truncate select-all">
          {activeDir || (activeProj ? `projects/${activeProj}` : 'projects/default')}
        </div>
      </div>
    </div>
  );
};
