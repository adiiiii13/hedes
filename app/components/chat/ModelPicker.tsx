import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  activeModel,
  activeProvider,
  customProviders,
  isSettingsOpen,
  ollamaDetectedModels,
  setActiveModelAndProvider,
} from '~/stores/settings';
import { providerRegistry } from '~/llm/registry';
import { ChevronDown, Cpu, Plus, Sparkles } from 'lucide-react';

export const ModelPicker: React.FC = () => {
  const currentProvider = useStore(activeProvider);
  const currentModel = useStore(activeModel);
  const customs = useStore(customProviders);
  const localOllama = useStore(ollamaDetectedModels);
  const [isOpen, setIsOpen] = useState(false);

  const rawProviders = providerRegistry.getAllProviders(customs);
  const providers = rawProviders.map((p) => {
    if (p.name.toLowerCase().includes('ollama') && localOllama.length > 0) {
      return {
        ...p,
        staticModels: localOllama.map((m) => ({
          name: m.name,
          label: m.label || m.name,
          provider: p.name,
        })),
      };
    }
    return p;
  });

  const handleSelect = (provider: string, model: string) => {
    setActiveModelAndProvider(provider, model);
    setIsOpen(false);
  };

  const [customInput, setCustomInput] = useState('');

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    setActiveModelAndProvider(currentProvider, customInput.trim());
    setCustomInput('');
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 transition-all shadow-sm"
      >
        <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="font-semibold text-emerald-400 capitalize shrink-0">{currentProvider}:</span>
        <span className="truncate max-w-[90px] xs:max-w-[130px] sm:max-w-[180px] text-slate-300">{currentModel}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 bottom-full mb-2 w-80 rounded-2xl bg-[#111128] border border-[#2e2e5c] shadow-2xl p-3 z-50 max-h-96 overflow-y-auto text-xs">
            <div className="flex items-center justify-between px-1 pb-2 border-b border-[#1e1e3a] mb-2">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Select LLM Model
              </span>
              <span className="text-[10px] text-emerald-400 font-medium">Free models available</span>
            </div>

            {/* Quick Custom Slug Input */}
            <form onSubmit={handleCustomSubmit} className="mb-3">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder={`Custom model slug for ${currentProvider}...`}
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/40 border border-[#2e2e5c] text-[11px] text-white placeholder-slate-500 outline-none focus:border-emerald-500/60"
                />
                <button
                  type="submit"
                  disabled={!customInput.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold disabled:opacity-40 transition-colors"
                >
                  Use
                </button>
              </div>
            </form>

            <div className="space-y-3">
              {providers.map((p) => (
                <div key={p.name} className="space-y-1">
                  <div className="px-1 py-0.5 text-[11px] font-bold text-violet-300 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-violet-400" />
                    <span>{p.name}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {p.staticModels.map((m) => {
                      const isLocal = p.name.toLowerCase().includes('ollama');
                      const isFree = m.name.endsWith(':free') || m.label?.toLowerCase().includes('(free)');
                      const isCustom = Boolean((m as any).isCustom);
                      return (
                        <button
                          key={m.name}
                          onClick={() => handleSelect(p.name, m.name)}
                          className={`text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between gap-2 ${
                            currentProvider === p.name && currentModel === m.name
                              ? 'bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/40'
                              : 'text-slate-300 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <span className="truncate flex-1">{m.label || m.name}</span>
                          {isLocal && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              LOCAL
                            </span>
                          )}
                          {isFree && !isLocal && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              FREE
                            </span>
                          )}
                          {isCustom && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                              Custom
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2.5 border-t border-[#1e1e3a] mt-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  isSettingsOpen.set(true);
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 font-medium text-xs transition-colors border border-white/5"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Configure API Keys & Custom Providers</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
