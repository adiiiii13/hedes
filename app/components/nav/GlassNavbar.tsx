import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { isSettingsOpen } from '~/stores/settings';
import { resetChat } from '~/stores/chat';
import { workspaceViewMode, activeProjectName, activeProjectDir } from '~/stores/workspace';
import { userProfileStore, isProfileOpen, is100ChatOpen } from '~/stores/profile';
import { Bot, History, Plus, Settings, Code, Eye, Columns, Folder, Github, Download, Users, Terminal as TerminalIcon } from 'lucide-react';
import { HistoryDrawer } from '~/components/nav/HistoryDrawer';
import { SettingsModal } from '~/components/settings/SettingsModal';
import { GithubImportModal } from '~/components/nav/GithubImportModal';
import { ProfileModal } from '~/components/profile/ProfileModal';
import { CouncilChatPage } from '~/components/profile/CouncilChatPage';
import { downloadProjectAsZip } from '~/utils/exportZip';

export const GlassNavbar: React.FC = () => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const viewMode = useStore(workspaceViewMode);
  const activeProj = useStore(activeProjectName);
  const activeDir = useStore(activeProjectDir);
  const profile = useStore(userProfileStore);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        const current = workspaceViewMode.get();
        workspaceViewMode.set(current === 'terminal' ? 'code' : 'terminal');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <header className="h-16 px-4 bg-[#0a0a1a] border-b border-[#1e1e3a] flex items-center justify-between z-20">
        {/* Brand Logo & Title & Network Status */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg border border-emerald-500/50 flex items-center justify-center bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <span className="text-emerald-400 font-bold text-lg font-mono">HΣ</span>
            </div>
            <div>
              <div className="font-black text-sm tracking-widest text-slate-200">
                HEDES STUDIO
              </div>
            </div>
            <div className="px-2 py-1 rounded bg-[#111128] border border-[#1e1e3a] text-cyan-400">
              CONSENSUS: 99.8% [SYNCED]
            </div>
            {activeProj && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111128] border border-emerald-500/30 text-emerald-400 font-semibold"
                title={`Active Working Directory: ${activeDir || `projects/${activeProj}`}`}
              >
                <Folder className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-slate-400 font-normal">DIR:</span>
                <span>projects/{activeProj}</span>
              </div>
            )}
            <div className="text-slate-500">LATENCY: 14ms</div>
          </div>
        </div>

        {/* Workspace Controls & Global Actions */}
        <div className="flex items-center gap-4">
          
          {/* View Mode Controls */}
          <div className="flex items-center bg-[#111128] rounded-md border border-[#1e1e3a] p-1">
            <button
              onClick={() => workspaceViewMode.set('code')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-sm transition-colors ${
                viewMode === 'code' ? 'bg-[#1e1e3a] text-cyan-400' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Editor</span>
            </button>
            <button
              onClick={() => workspaceViewMode.set('preview')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-sm transition-colors ${
                viewMode === 'preview' ? 'bg-[#1e1e3a] text-cyan-400' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
            <button
              onClick={() => workspaceViewMode.set('split')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-sm transition-colors ${
                viewMode === 'split' ? 'bg-[#1e1e3a] text-cyan-400' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Split View</span>
            </button>
            <button
              onClick={() => workspaceViewMode.set('terminal')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-sm transition-colors ${
                viewMode === 'terminal'
                  ? 'bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                  : 'text-slate-400 hover:text-emerald-300 hover:bg-white/5'
              }`}
              title="Interactive Terminal (Ctrl+`)"
            >
              <TerminalIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>Terminal</span>
            </button>
          </div>

          <div className="w-px h-6 bg-[#1e1e3a]"></div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setGithubOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors"
              title="Clone GitHub Repo"
            >
              <Github className="w-3.5 h-3.5" />
              <span>IMPORT</span>
            </button>
            <button
              onClick={() => downloadProjectAsZip()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors font-mono cursor-pointer"
              title="Download Project as ZIP"
            >
              <Download className="w-3.5 h-3.5" />
              <span>EXPORT ZIP</span>
            </button>
            <button
              onClick={() => resetChat()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-mono transition-colors shadow-[0_0_10px_rgba(6,182,212,0.2)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ NEW PROJECT</span>
            </button>

            {/* 100-Human Council Forum Direct Button */}
            <button
              type="button"
              onClick={() => is100ChatOpen.set(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gradient-to-r from-purple-500/20 via-indigo-500/20 to-cyan-500/20 hover:from-purple-500/30 hover:to-cyan-500/30 text-indigo-200 hover:text-white border border-indigo-500/40 font-mono transition-all shadow-[0_0_12px_rgba(99,102,241,0.25)] hover:scale-[1.02] active:scale-95 cursor-pointer"
              title="Open 100-Human Archetype Council Chamber"
            >
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-bold">🏛️ 100-COUNCIL</span>
            </button>

            <button
              onClick={() => setHistoryOpen(true)}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-[#1e1e3a] transition-colors"
              title="Chat History"
            >
              <History className="w-4 h-4" />
            </button>

            <button
              onClick={() => isSettingsOpen.set(true)}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-[#1e1e3a] transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* User Profile Button */}
            <button
              onClick={() => isProfileOpen.set(true)}
              className="ml-2 w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 flex items-center justify-center border-2 border-[#1e1e3a] hover:border-indigo-400 text-[10px] font-bold text-white transition-all shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer"
              title={`${profile.name || 'User'} (${profile.role || 'Profile'}) - Click to edit Human Perspective & 100-Person Chat`}
            >
              {profile.initials || 'DEV'}
            </button>
          </div>
        </div>
      </header>

      {/* History Drawer */}
      <HistoryDrawer isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />

      {/* Github Import Modal */}
      <GithubImportModal isOpen={githubOpen} onClose={() => setGithubOpen(false)} />

      {/* Settings Modal */}
      <SettingsModal />

      {/* User Profile & Perspective Modal */}
      <ProfileModal />

      {/* Full-Page 100-Person Council Chat System */}
      <CouncilChatPage />
    </>
  );
};
