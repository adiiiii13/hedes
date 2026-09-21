import { useState, useEffect, useCallback } from 'react';
import { listChats, deleteChat, saveChat, type ChatRecord } from './db';

export function useChatHistory() {
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshChats = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      // 1. Fetch from IndexedDB
      const dbChats = await listChats();

      // 2. Fetch from disk via /api/local/projects
      let diskProjects: any[] = [];
      try {
        const res = await fetch('/api/local/projects');
        if (res.ok) {
          const data = await res.json();
          diskProjects = data.projects || [];
        }
      } catch (e) {
        console.warn('Failed to query disk projects:', e);
      }

      // 3. Merge seamlessly so no projects ever disappear
      const mergedMap = new Map<string, ChatRecord>();
      for (const c of dbChats) {
        mergedMap.set(c.id, c);
      }

      for (const p of diskProjects) {
        const existing = mergedMap.get(p.id);
        if (!existing) {
          const newRecord: ChatRecord = {
            id: p.id,
            title: p.title || p.name || p.id,
            messages: p.messages || [],
            model: p.model || 'Universal',
            provider: p.provider || 'Local',
            createdAt: p.createdAt || Date.now(),
            updatedAt: p.updatedAt || Date.now(),
          };
          mergedMap.set(p.id, newRecord);
          saveChat(newRecord).catch(() => {});
        } else {
          // If disk version is newer or existing has empty title
          if ((!existing.title || existing.title === 'New Project') && p.title && p.title !== p.id) {
            existing.title = p.title;
          }
          if (p.updatedAt && p.updatedAt > existing.updatedAt) {
            existing.updatedAt = p.updatedAt;
          }
        }
      }

      const combined = Array.from(mergedMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setChats(combined);
    } catch (err) {
      console.error('Failed to load chat history', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshChats().then(() => {
      // Restore last active chat from localStorage on boot
      const lastChatId = localStorage.getItem('hedes_current_chat');
      if (lastChatId) {
        listChats().then(allChats => {
          const chat = allChats.find(c => c.id === lastChatId);
          if (chat) {
            import('~/stores/chat').then(({ currentChatId, loadMessagesIntoStore }) => {
              currentChatId.set(chat.id);
              loadMessagesIntoStore(chat.messages || []);
            });
            import('~/stores/workspace').then(({ loadProjectFiles }) => {
              loadProjectFiles(chat.id);
            });
          }
        });
      }
    });
  }, [refreshChats]);

  const removeChat = async (id: string) => {
    // Delete from IndexedDB
    await deleteChat(id);
    
    // Delete local project files
    try {
      await fetch('/api/local/fs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: id, type: 'delete' })
      });
    } catch (err) {
      console.error('Failed to delete local project files', err);
    }
    
    await refreshChats();
  };

  return { chats, loading, refreshChats, removeChat };
}
