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

  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const handleExportZip = async () => {
    try {
      setIsExporting(true);
      const res = await fetch('/api/local/backup');
      if (!res.ok) throw new Error('Backup creation failed: ' + (await res.text()));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hedes-full-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Backup failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.zip')) {
      alert('Please select a valid .zip backup archive.');
      return;
    }
    if (!window.confirm(`Are you sure you want to restore data from "${file.name}"? Existing files will be updated with archive content.`)) {
      e.target.value = '';
      return;
    }

    try {
      setIsRestoring(true);
      setRestoreMessage(null);
      const arrayBuffer = await file.arrayBuffer();
      const res = await fetch('/api/local/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: arrayBuffer,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Restore failed');
      setRestoreMessage(`Successfully restored ${data.restoredCount} files from backup.`);
      setTimeout(() => setRestoreMessage(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Restore failed');
    } finally {
      setIsRestoring(false);
      e.target.value = '';
    }
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
        <h3 className="font-bold text-sm text-white mb-2">Full Backup & Data Migration</h3>
        <p className="text-slate-400 mb-3 text-[11px] leading-relaxed">
          Create an authoritative offline ZIP snapshot containing all your project files, chat history, memories, skills, and 100-council transcripts.
        </p>
        <div className="p-2.5 mb-4 rounded-xl bg-black/40 border border-white/5 text-[10px] text-slate-400">
          <span className="text-amber-400 font-semibold">Exclusion Policy:</span> API keys, vault encryption files, and raw credentials are systematically excluded from backup archives to prevent secret leakage.
        </div>

        {restoreMessage && (
          <div className="p-2.5 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{restoreMessage}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportZip}
            disabled={isExporting}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Generating ZIP...' : 'Export Full Backup (ZIP)'}</span>
          </button>

          <label className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 text-slate-200 font-medium text-xs flex items-center gap-2 transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isRestoring ? 'Restoring Archive...' : 'Restore from Backup (ZIP)'}</span>
            <input
              type="file"
              accept=".zip"
              onChange={handleRestoreZip}
              disabled={isRestoring}
              className="hidden"
            />
          </label>
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
