import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { useChatHistory } from '~/persistence/useChatHistory';
import { loadMessagesIntoStore, currentChatId, persistCurrentChat } from '~/stores/chat';
import { loadProjectFiles, files, activeFile, previewUrl, workspaceViewMode } from '~/stores/workspace';
import {
  councilSessionsStore,
  activeCouncilSessionId,
  is100ChatOpen,
  removeCouncilSession,
  loadCouncilSessions,
} from '~/stores/profile';
import { Clock, MessageSquare, Trash2, X, Users, Database } from 'lucide-react';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ isOpen, onClose }) => {
  const { chats, removeChat, refreshChats } = useChatHistory();
  const councilSessions = useStore(councilSessionsStore);
  const [activeTab, setActiveTab] = useState<'projects' | 'council'>('projects');

  useEffect(() => {
    if (isOpen) {
      refreshChats();
      loadCouncilSessions();
    }
  }, [isOpen, refreshChats]);

  const handleSelectChat = async (chat: any) => {
    // 1. Auto-save current active project so nothing is EVER lost!
    try {
      await persistCurrentChat();
    } catch (e) {
      console.warn('Auto-save failed before project switch:', e);
    }

    currentChatId.set(chat.id);
    localStorage.setItem('hedes_current_chat', chat.id);
    files.set({});
    activeFile.set(null);
    previewUrl.set(null);
    workspaceViewMode.set('code');
    loadMessagesIntoStore(chat.messages || []);
    await loadProjectFiles(chat.id);
    onClose();
  };

  const handleSelectCouncilSession = (session: any) => {
    activeCouncilSessionId.set(session.id);
    is100ChatOpen.set(true);
    onClose();
  };

  const handleDeleteCouncilSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await removeCouncilSession(id);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          <motion.div
            initial={{ x: -340 }}
            animate={{ x: 0 }}
            exit={{ x: -340 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-84 bg-[#0d0d22] border-r border-[#1e1e3a] shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#1e1e3a] bg-[#0a0a1a]">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>History & Local Database</span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Switcher: Projects vs 100-Council Debates */}
            <div className="flex border-b border-[#1e1e3a] bg-[#080816] p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('projects')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'projects'
                    ? 'bg-[#1a1a36] text-white shadow-sm border border-emerald-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>Projects ({chats.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('council')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'council'
                    ? 'bg-[#1a1a36] text-white shadow-sm border border-indigo-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>100-Council ({councilSessions.length})</span>
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs custom-scrollbar">
              {activeTab === 'projects' ? (
                chats.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 italic">
                    No saved projects yet. Any project you generate is automatically preserved here.
                  </div>
                ) : (
                  chats.map((chat: any) => (
                    <div
                      key={chat.id}
                      className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-emerald-500/30 transition-all flex items-start justify-between group cursor-pointer"
                      onClick={() => handleSelectChat(chat)}
                    >
                      <div className="flex items-start gap-2.5 overflow-hidden">
                        <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="overflow-hidden">
                          <div className="font-semibold text-slate-200 truncate group-hover:text-emerald-300">
                            {chat.title}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {new Date(chat.updatedAt).toLocaleDateString()} • {chat.model}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeChat(chat.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                        title="Delete Project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )
              ) : (
                councilSessions.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <div className="text-3xl text-slate-600">🏛️</div>
                    <p className="text-slate-400 font-medium">No 100-Council debates saved yet</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Deliberations in the 100-Human Council Forum are backed up here automatically into your local browser database.
                    </p>
                  </div>
                ) : (
                  councilSessions.map((session: any) => (
                    <div
                      key={session.id}
                      className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-indigo-500/40 transition-all flex items-start justify-between group cursor-pointer"
                      onClick={() => handleSelectCouncilSession(session)}
                    >
                      <div className="flex items-start gap-2.5 overflow-hidden">
                        <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xs shrink-0 mt-0.5">
                          🏛️
                        </div>
                        <div className="overflow-hidden">
                          <div className="font-semibold text-slate-200 truncate group-hover:text-indigo-300 transition-colors">
                            {session.title}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
                            <span className="px-1.5 py-0.2 rounded bg-[#181835] text-indigo-300 border border-[#272750]">
                              {session.mode === 'assembly' ? 'Assembly' : '1-on-1'}
                            </span>
                            <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>{session.messages?.length || 0} msgs</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleDeleteCouncilSession(e, session.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                        title="Delete Council Debate"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
