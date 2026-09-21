import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { isSettingsOpen } from '~/stores/settings';
import { LLMConfigurator } from './LLMConfigurator';
import { PersonificationManager } from './PersonificationManager';
import { TerminalSettings } from './TerminalSettings';
import { StorageSettings } from './StorageSettings';
import {
  Key,
  Settings,
  Users,
  Terminal as TerminalIcon,
  Database,
  X,
} from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const isOpen = useStore(isSettingsOpen);
  const [activeTab, setActiveTab] = useState<'llm' | 'terminal' | 'personas' | 'storage'>('llm');

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => isSettingsOpen.set(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            className="relative w-full max-w-4xl max-h-[90vh] rounded-3xl bg-[#0c0c20] border border-[#2e2e5c] shadow-2xl flex flex-col overflow-hidden z-10"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 px-6 border-b border-[#1e1e3a] bg-[#0a0a1a]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Hedes Studio Settings</h2>
                  <p className="text-[11px] text-slate-400">LLM Providers, Terminal Engine, 100-Archetype Hive Mind & Storage</p>
                </div>
              </div>

              {/* Navigation Tabs Switcher */}
              <div className="flex items-center gap-1 p-1 bg-black/40 border border-white/5 rounded-2xl overflow-x-auto modern-scrollbar">
                <button
                  type="button"
                  onClick={() => setActiveTab('llm')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'llm'
                      ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>AI Providers</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('terminal')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'terminal'
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <TerminalIcon className="w-3.5 h-3.5" />
                  <span>Terminal</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('personas')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'personas'
                      ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>100-Council</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-cyan-500/20 text-cyan-300 font-bold">
                    100
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('storage')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'storage'
                      ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Storage & Disk</span>
                </button>
              </div>

              <button
                onClick={() => isSettingsOpen.set(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                title="Close settings"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === 'llm' && <LLMConfigurator />}
              {activeTab === 'terminal' && <TerminalSettings />}
              {activeTab === 'personas' && <PersonificationManager />}
              {activeTab === 'storage' && <StorageSettings />}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
