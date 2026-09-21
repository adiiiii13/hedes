import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { councilSessionsStore, loadCouncilSessions } from '~/stores/profile';
import { customProviders } from '~/stores/settings';
import {
  HardDrive,
  Download,
  Upload,
  Trash2,
  Check,
  RotateCcw,
  Cloud,
  FileCode,
  Users,
  Database,
  ShieldAlert,
} from 'lucide-react';

export const StorageSettings: React.FC = () => {
  const councilSessions = useStore(councilSessionsStore);
  const customs = useStore(customProviders);

  const [chatCount, setChatCount] = useState<number>(0);
  const [clearedNotice, setClearedNotice] = useState<string | null>(null);

  useEffect(() => {
    loadCouncilSessions();
    if (typeof window !== 'undefined') {
      try {
        const chats = localStorage.getItem('hedes_chat_history');
        if (chats) {
          const parsed = JSON.parse(chats);
          setChatCount(Array.isArray(parsed) ? parsed.length : 1);
        }
      } catch {}
    }
  }, []);

  const handleExportAll = () => {
    if (typeof window === 'undefined') return;

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      councilSessions: councilSessionsStore.get(),
      customProviders: customProviders.get(),
      userProfile: localStorage.getItem('hedes_user_profile')
        ? JSON.parse(localStorage.getItem('hedes_user_profile')!)
        : null,
      apiKeys: localStorage.getItem('hedes_api_keys')
        ? JSON.parse(localStorage.getItem('hedes_api_keys')!)
        : null,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hedes-studio-full-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearCache = () => {
    if (!window.confirm('Are you sure you want to clear cached temporary data and reset the studio interface?')) return;

    if (typeof window !== 'undefined') {
      localStorage.removeItem('hedes_chat_history');
      sessionStorage.clear();
      setClearedNotice('Cached session data cleared successfully.');
      setTimeout(() => setClearedNotice(null), 3500);
    }
  };

  return (
    <div className="space-y-6 text-xs text-slate-300">
      {/* Storage Overview Card */}
      <div className="p-4 rounded-2xl bg-[#0e0e24] border border-[#1e1e3a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-white">Local Database & Host Storage</h3>
          </div>
          <span className="text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full">
            INDEXEDDB + HOST DISK
          </span>
        </div>

        <p className="text-slate-400 mb-4 text-[11px] leading-relaxed">
          Hedes Studio persists all project files, 100-council debate transcripts, user perspectives, and model configs both locally in high-speed IndexedDB and directly on the host machine disk.
        </p>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-bold text-white">{councilSessions.length}</div>
              <div className="text-[10px] text-slate-400">Council Debates Saved</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-bold text-white">{chatCount || 1}</div>
              <div className="text-[10px] text-slate-400">Project Sessions</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="text-base font-bold text-white">{customs.length}</div>
              <div className="text-[10px] text-slate-400">Custom LLM Endpoints</div>
            </div>
          </div>
        </div>
      </div>

      {/* Backup & Export Section */}
      <div className="p-4 rounded-2xl bg-[#0e0e24] border border-[#1e1e3a]">
        <h3 className="font-bold text-sm text-white mb-2">Backup & Data Migration</h3>
        <p className="text-slate-400 mb-4 text-[11px] leading-relaxed">
          Create an offline snapshot containing all your personification edits, 100-council transcripts, custom models, and profile configurations.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportAll}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Full Studio Backup (JSON)</span>
          </button>
        </div>
      </div>

      {/* Danger Zone / Reset */}
      <div className="p-4 rounded-2xl bg-rose-950/15 border border-rose-500/20">
        <div className="flex items-center gap-2 mb-2 text-rose-400 font-bold text-sm">
          <ShieldAlert className="w-4 h-4" />
          <span>Storage Maintenance</span>
        </div>
        <p className="text-slate-400 mb-4 text-[11px]">
          Clear temporary cached web containers and chat session memory without deleting files on your host disk.
        </p>

        {clearedNotice && (
          <div className="p-2 mb-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            <span>{clearedNotice}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleClearCache}
          className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear Cached Workspace Sessions</span>
        </button>
      </div>
    </div>
  );
};
