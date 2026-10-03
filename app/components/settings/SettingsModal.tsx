import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { isSettingsOpen } from '~/stores/settings';
import { LLMConfigurator } from './LLMConfigurator';
import { PersonificationManager } from './PersonificationManager';
import { TerminalSettings } from './TerminalSettings';
import { StorageSettings } from './StorageSettings';
import { MemorySettings } from './MemorySettings';
import { McpSettings } from './McpSettings';
import { SkillSettings } from './SkillSettings';
import { PluginSettings } from './PluginSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { DiagnosticsSettings } from './DiagnosticsSettings';
import { TasksSettings } from './TasksSettings';
import { CloudSyncSettings } from './CloudSyncSettings';
import {
  Key,
  Settings,
  Users,
  Terminal as TerminalIcon,
  Database,
  BrainCircuit,
  PlugZap,
  BookOpen,
  Blocks,
  Palette,
  Activity,
  Clock,
  Cloud,
  X,
} from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const isOpen = useStore(isSettingsOpen);
  const [activeTab, setActiveTab] = useState<'llm' | 'terminal' | 'personas' | 'storage' | 'memory' | 'mcp' | 'skills' | 'plugins' | 'appearance' | 'diagnostics' | 'tasks' | 'cloud'>('llm');

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
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
            className="relative w-full max-w-5xl max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] rounded-2xl sm:rounded-3xl app-surface border border-white/10 shadow-[0_32px_100px_rgba(0,0,0,0.65)] flex flex-col overflow-hidden z-10"
          >
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 sm:px-6 border-b border-white/10 app-background">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Hedes Studio Settings</h2>
                  <p className="text-[11px] text-slate-400">Providers, memory, tools, and workspace</p>
                </div>
              </div>

              {/* Navigation Tabs Switcher */}
              <div className="order-3 grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1 p-1 bg-black/40 border border-white/5 rounded-2xl">
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
                <button type="button" onClick={() => setActiveTab('cloud')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'cloud' ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-400/40' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}><Cloud className="w-3.5 h-3.5" /><span>Cloud Sync</span></button>
                <button type="button" onClick={() => setActiveTab('memory')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'memory' ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}><BrainCircuit className="w-3.5 h-3.5" /><span>Memory</span></button>
                <button type="button" onClick={() => setActiveTab('mcp')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'mcp' ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}><PlugZap className="w-3.5 h-3.5" /><span>MCP</span></button>
                <button type="button" onClick={() => setActiveTab('skills')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'skills' ? 'bg-violet-600/30 text-violet-200 border border-violet-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}><BookOpen className="w-3.5 h-3.5" /><span>Skills</span></button>
                <button type="button" onClick={() => setActiveTab('plugins')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'plugins' ? 'bg-fuchsia-600/30 text-fuchsia-200 border border-fuchsia-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}><Blocks className="w-3.5 h-3.5" /><span>Plugins</span></button>
                <button type="button" onClick={() => setActiveTab('appearance')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'appearance' ? 'bg-white/10 text-[var(--app-accent)] border border-white/20' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}><Palette className="w-3.5 h-3.5" /><span>Appearance</span></button>
                <button type="button" onClick={() => setActiveTab('diagnostics')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'diagnostics' ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}><Activity className="w-3.5 h-3.5" /><span>Diagnostics</span></button>
                <button type="button" onClick={() => setActiveTab('tasks')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'tasks' ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}><Clock className="w-3.5 h-3.5" /><span>Scheduled Tasks</span></button>
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
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
              {activeTab === 'llm' && <LLMConfigurator />}
              {activeTab === 'terminal' && <TerminalSettings />}
              {activeTab === 'personas' && <PersonificationManager />}
              {activeTab === 'storage' && <StorageSettings />}
              {activeTab === 'cloud' && <CloudSyncSettings />}
              {activeTab === 'memory' && <MemorySettings />}
              {activeTab === 'mcp' && <McpSettings />}
              {activeTab === 'skills' && <SkillSettings />}
              {activeTab === 'plugins' && <PluginSettings />}
              {activeTab === 'appearance' && <AppearanceSettings />}
              {activeTab === 'diagnostics' && <DiagnosticsSettings />}
              {activeTab === 'tasks' && <TasksSettings />}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
