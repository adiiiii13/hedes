import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { isSettingsOpen } from '~/stores/settings';
import { resetChat, saveStatus, lastSaveError } from '~/stores/chat';
import { workspaceViewMode, activeProjectName, activeProjectDir } from '~/stores/workspace';
import { userProfileStore, isProfileOpen, is100ChatOpen } from '~/stores/profile';
import { Bot, History, Plus, Settings, Code, Eye, Columns, Folder, Github, Download, Users, Mic, Check, Loader2, AlertCircle, Terminal as TerminalIcon } from 'lucide-react';
import { VoiceAssistantPage } from '~/components/voice/VoiceAssistantPage';
import { HistoryDrawer } from '~/components/nav/HistoryDrawer';
import { SettingsModal } from '~/components/settings/SettingsModal';
import { GithubImportModal } from '~/components/nav/GithubImportModal';
import { ProfileModal } from '~/components/profile/ProfileModal';
import { CouncilChatPage } from '~/components/profile/CouncilChatPage';
import { downloadProjectAsZip } from '~/utils/exportZip';

export const GlassNavbar: React.FC = () => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const viewMode = useStore(workspaceViewMode);
  const activeProj = useStore(activeProjectName);
  const activeDir = useStore(activeProjectDir);
  const profile = useStore(userProfileStore);
  const currentSaveStatus = useStore(saveStatus);
  const currentSaveError = useStore(lastSaveError);

  React.useEffect(() => {
    if ((window as any).ipc) document.documentElement.dataset.desktop = 'on';
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
      <div className="app-titlebar hidden h-9 shrink-0 items-center border-b border-white/5 bg-[#0b0d14] px-4 pr-36 text-[11px] text-slate-400">
        <span className="font-semibold tracking-wide text-slate-200">HEDES</span>
        <span className="mx-3 text-slate-600">/</span>
        <span className="truncate">{activeProj || 'Workspace'}</span>
      </div>
      <header className="h-14 shrink-0 px-4 app-surface border-b border-white/10 flex items-center justify-between gap-3 z-20 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
        {/* Brand Logo & Title & Network Status */}
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-2xl border border-cyan-400/40 flex items-center justify-center bg-gradient-to-br from-cyan-400/20 via-violet-500/20 to-fuchsia-500/20 shadow-[0_0_25px_rgba(34,211,238,0.16)]">
              <span className="app-accent font-bold text-lg font-mono">HΣ</span>
            </div>
            <div>
              <div className="font-black text-sm tracking-[0.16em] text-white whitespace-nowrap">
                HEDES STUDIO
              </div>
              <div className="text-[10px] text-slate-500 tracking-wide">LOCAL CREATIVE WORKSPACE</div>
            </div>
            {activeProj && (
              <div
                className="hidden xl:flex min-w-0 items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-cyan-200 font-medium text-xs"
                title={`Active Working Directory: ${activeDir || `projects/${activeProj}`}`}
              >
                <Folder className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate max-w-40">{activeProj}</span>
              </div>
            )}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-mono border transition-all ${
                currentSaveStatus === 'saving'
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                  : currentSaveStatus === 'error'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}
              title={currentSaveStatus === 'error' ? (currentSaveError || 'Save failed') : currentSaveStatus === 'saving' ? 'Persisting changes to disk...' : 'All changes saved to disk'}
            >
              {currentSaveStatus === 'saving' ? (
                <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
              ) : currentSaveStatus === 'error' ? (
                <AlertCircle className="w-3 h-3 text-rose-400" />
              ) : (
                <Check className="w-3 h-3 text-emerald-400" />
              )}
              <span className="capitalize">{currentSaveStatus}</span>
            </div>
          </div>
        </div>

        {/* Workspace Controls & Global Actions */}
        <div className="hidden min-w-0 items-center gap-3 md:flex">
          
          {/* View Mode Controls */}
          <div className="flex items-center bg-white/[0.04] rounded-xl border border-white/10 p-1">
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
            <button type="button" onClick={() => setVoiceOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-cyan-200 hover:bg-cyan-400/20" title="Open Hedes Voice"><Mic className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">VOICE</span></button>
            <button
              onClick={() => setGithubOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors"
              title="Clone GitHub Repo"
            >
              <Github className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">IMPORT</span>
            </button>
            <button
              onClick={() => downloadProjectAsZip()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors font-mono cursor-pointer"
              title="Download Project as ZIP"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">EXPORT ZIP</span>
            </button>
            <button
              onClick={() => resetChat()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-mono transition-colors shadow-[0_0_10px_rgba(6,182,212,0.2)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">NEW PROJECT</span>
            </button>

            {/* 100-Human Council Forum Direct Button */}
            <button
              type="button"
              onClick={() => is100ChatOpen.set(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gradient-to-r from-purple-500/20 via-indigo-500/20 to-cyan-500/20 hover:from-purple-500/30 hover:to-cyan-500/30 text-indigo-200 hover:text-white border border-indigo-500/40 font-mono transition-all shadow-[0_0_12px_rgba(99,102,241,0.25)] hover:scale-[1.02] active:scale-95 cursor-pointer"
              title="Open 100-Human Archetype Council Chamber"
            >
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden 2xl:inline font-bold">PERSPECTIVES</span>
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
        <div className="flex items-center gap-1 md:hidden"><button type="button" onClick={() => setVoiceOpen(true)} className="rounded-lg p-2 text-cyan-200" aria-label="Open Hedes Voice"><Mic className="h-5 w-5" /></button><button type="button" onClick={() => isSettingsOpen.set(true)} className="rounded-lg p-2 text-slate-300" aria-label="Open settings"><Settings className="h-5 w-5" /></button></div>
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
      {voiceOpen && <VoiceAssistantPage onClose={() => setVoiceOpen(false)} />}
    </>
  );
};
