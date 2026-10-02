import React, { useState, useRef, useCallback } from 'react';
import { GlassNavbar } from '~/components/nav/GlassNavbar';
import { ChatPanel } from '~/components/chat/ChatPanel';
import { Workspace } from '~/components/workspace/Workspace';
import { ClientOnly } from '~/components/ui/ClientOnly';
import { StatusBar } from '~/components/ui/StatusBar';
import { workspaceViewMode } from '~/stores/workspace';
import { useStore } from '@nanostores/react';
import { MessageSquare, Code, Eye, FolderOpen, Terminal } from 'lucide-react';

const CHAT_MIN = 280;
const CHAT_MAX = 520;

export default function IndexRoute() {
  const [chatWidth, setChatWidth] = useState(340);
  const [mobileView, setMobileView] = useState<'chat' | 'workspace' | 'files'>('chat');
  const activeWorkspaceView = useStore(workspaceViewMode);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ev.clientX - rect.left;
      setChatWidth(Math.min(CHAT_MAX, Math.max(CHAT_MIN, newWidth)));
    };

    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden app-background">
      {/* Top Floating Glass Navigation */}
      <GlassNavbar />

      {/* Master Workspace Layout */}
      <div ref={containerRef} className="flex-1 flex w-full min-h-0 overflow-hidden">
        {/* Left Side: Chat Panel — drag-resizable */}
        <div
          style={{ width: chatWidth, minWidth: CHAT_MIN, maxWidth: CHAT_MAX }}
          className={`app-mobile-chat h-full flex-none border-r border-white/10 ${mobileView === 'chat' ? 'block' : 'hidden'} md:block`}
        >
          <ChatPanel />
        </div>

        {/* Chat / Workspace drag handle */}
        <div
          onMouseDown={startDrag}
          className="hidden w-1 flex-none cursor-col-resize bg-[#243047] hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors relative group md:block"
          title="Drag to resize chat panel"
        >
          <div className="absolute inset-y-0 -left-0.5 -right-0.5 group-hover:bg-cyan-500/10 transition-colors" />
        </div>

        {/* Right Side: Code Editor, Preview & Terminal */}
        <div className={`min-w-0 flex-1 h-full ${mobileView === 'chat' ? 'hidden' : 'block'} md:block`}>
          <ClientOnly fallback={<div className="flex-1 h-full app-background flex items-center justify-center text-slate-500 text-xs font-mono">Initializing Hedes Workspace...</div>}>
            {() => <Workspace mobileFiles={mobileView === 'files'} />}
          </ClientOnly>
        </div>
      </div>

      <nav className="flex h-14 shrink-0 items-center justify-around border-t border-white/10 bg-[#0c1322] text-[10px] text-slate-400 md:hidden" aria-label="Mobile navigation">
        {([
          ['chat', MessageSquare, 'Chat', null],
          ['workspace', Code, 'Editor', 'code'],
          ['workspace', Eye, 'Preview', 'preview'],
          ['workspace', Terminal, 'Terminal', 'terminal'],
          ['files', FolderOpen, 'Files', null],
        ] as const).map(([view, Icon, label, mode]) => <button key={label} type="button" onClick={() => { setMobileView(view); if (mode) workspaceViewMode.set(mode); }} className={`flex min-w-12 flex-col items-center gap-1 rounded-lg px-2 py-1 ${mobileView === view && (!mode || activeWorkspaceView === mode) ? 'text-cyan-300' : ''}`}><Icon className="h-4 w-4" />{label}</button>)}
      </nav>

      <StatusBar />
    </div>
  );
}
