import React, { useState } from 'react';
import { X, Github, Download, Loader2 } from 'lucide-react';
import { useStore } from '@nanostores/react';
import { currentChatId } from '~/stores/chat';

import { loadProjectFiles, workspaceViewMode } from '~/stores/workspace';

interface GithubImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GithubImportModal: React.FC<GithubImportModalProps> = ({ isOpen, onClose }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const chatId = useStore(currentChatId);

  if (!isOpen) return null;

  const handleImport = async () => {
    if (!url) return;
    try {
      setLoading(true);
      const res = await fetch('/api/local/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: chatId || 'default-chat', repoUrl: url }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import repository');
      }

      // Immediately load all cloned files into the File Explorer
      await loadProjectFiles(chatId || 'default-chat');
      workspaceViewMode.set('code');

      const prompt = `I have just cloned this GitHub repository into the workspace. Please review the project structure and package.json, install dependencies, and start the application so we can preview it.`;
      window.dispatchEvent(new CustomEvent('trigger-chat', { detail: prompt }));

      onClose();
    } catch (err: any) {
      alert(err.message || 'Error cloning repository');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[500px] bg-[#0d0d22] border border-[#1e1e3a] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e3a] bg-[#111128]">
          <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold">
            <Github className="w-5 h-5" />
            <span>CLONE GITHUB REPOSITORY</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e1e3a]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4">
          <p className="text-sm text-slate-400">
            Enter a public GitHub repository URL to clone it directly into your Hedes Studio workspace.
          </p>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono text-slate-500">REPOSITORY URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/username/repo"
              className="w-full bg-[#0a0a1a] border border-[#1e1e3a] rounded-lg px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 bg-[#111128] border-t border-[#1e1e3a] gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !url}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>CLONE REPOSITORY</span>
          </button>
        </div>
      </div>
    </div>
  );
};
