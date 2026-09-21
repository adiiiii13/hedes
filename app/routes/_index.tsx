import React, { useState, useRef, useCallback } from 'react';
import { GlassNavbar } from '~/components/nav/GlassNavbar';
import { ChatPanel } from '~/components/chat/ChatPanel';
import { Workspace } from '~/components/workspace/Workspace';
import { ClientOnly } from '~/components/ui/ClientOnly';
import { StatusBar } from '~/components/ui/StatusBar';

const CHAT_MIN = 280;
const CHAT_MAX = 520;

export default function IndexRoute() {
  const [chatWidth, setChatWidth] = useState(340);
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0a1a]">
      {/* Top Floating Glass Navigation */}
      <GlassNavbar />

      {/* Master Workspace Layout */}
      <div ref={containerRef} className="flex-1 flex w-full h-[calc(100vh-56px-24px)] overflow-hidden">
        {/* Left Side: Chat Panel — drag-resizable */}
        <div
          style={{ width: chatWidth, minWidth: CHAT_MIN, maxWidth: CHAT_MAX }}
          className="h-full flex-none border-r border-[#1e1e3a]"
        >
          <ChatPanel />
        </div>

        {/* Chat / Workspace drag handle */}
        <div
          onMouseDown={startDrag}
          className="w-1 flex-none cursor-col-resize bg-[#1e1e3a] hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors relative group"
          title="Drag to resize chat panel"
        >
          <div className="absolute inset-y-0 -left-0.5 -right-0.5 group-hover:bg-cyan-500/10 transition-colors" />
        </div>

        {/* Right Side: Code Editor, Preview & Terminal */}
        <div className="flex-1 h-full min-w-0">
          <ClientOnly fallback={<div className="flex-1 h-full bg-[#0a0a1a] flex items-center justify-center text-slate-500 text-xs font-mono">Initializing Hedes Workspace...</div>}>
            {() => <Workspace />}
          </ClientOnly>
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
