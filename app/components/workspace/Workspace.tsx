import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { CodeEditor } from './CodeEditor';
import { PreviewFrame } from './PreviewFrame';
import { FileDrawer } from './FileDrawer';
import { FloatingTerminal } from './FloatingTerminal';
import { workspaceViewMode, loadProjectFiles } from '~/stores/workspace';

// Constraints for panel sizes
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 600;
const TERMINAL_MIN_PCT = 15;
const TERMINAL_MAX_PCT = 75;

export const Workspace: React.FC = () => {
  const viewMode = useStore(workspaceViewMode);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  // Auto-sync project files from local disk on initial mount
  useEffect(() => {
    loadProjectFiles();
  }, []);

  // ── Horizontal: sidebar width (right panel - 100% File Explorer) ────────────
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isDraggingH = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDragH = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingH.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!isDraggingH.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - ev.clientX;
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, newWidth)));
    };

    const onUp = () => {
      isDraggingH.current = false;
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

  // ── Vertical: bottom terminal height percentage inside main area ────────────
  const [terminalPct, setTerminalPct] = useState(35); // % of main area height
  const isDraggingV = useRef(false);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const startDragV = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingV.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!isDraggingV.current || !mainAreaRef.current) return;
      const rect = mainAreaRef.current.getBoundingClientRect();
      const fromBottom = rect.bottom - ev.clientY;
      const pct = Math.round((fromBottom / rect.height) * 100);
      setTerminalPct(Math.min(TERMINAL_MAX_PCT, Math.max(TERMINAL_MIN_PCT, pct)));
    };

    const onUp = () => {
      isDraggingV.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return (
    <div ref={containerRef} className="flex flex-row h-full w-full bg-[#0a0a1a] overflow-hidden">
      {/* ── Main Content Area (Editor / Preview / Responsive Full-Width Terminal) ── */}
      <div ref={mainAreaRef} className="flex-1 relative flex flex-col h-full min-w-0">
        {viewMode === 'terminal' ? (
          // 100% Full View Terminal Mode
          <div className="w-full h-full flex flex-col bg-[#080816]">
            <FloatingTerminal />
          </div>
        ) : (
          // Standard Workbench: Top Editor/Preview + Bottom Full-Width Terminal
          <div className="flex-1 flex flex-col h-full min-w-0">
            {/* Top: Editor / Preview / Split */}
            <div
              style={{ height: isTerminalOpen ? `${100 - terminalPct}%` : '100%' }}
              className="w-full relative flex min-h-0 overflow-hidden"
            >
              {viewMode === 'code' && <CodeEditor />}
              {viewMode === 'preview' && <PreviewFrame />}
              {viewMode === 'split' && (
                <div className="flex flex-1 w-full h-full">
                  <div className="w-1/2 h-full border-r border-[#1e1e3a]">
                    <CodeEditor />
                  </div>
                  <div className="w-1/2 h-full">
                    <PreviewFrame />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom: Docked Full-Width Terminal (800-1400px+ width, no horizontal cutoff) */}
            {isTerminalOpen && (
              <>
                {/* Horizontal Drag Handle between Editor & Terminal */}
                <div
                  onMouseDown={startDragV}
                  className="h-1 w-full flex-none cursor-row-resize bg-[#1e1e3a] hover:bg-emerald-500/60 active:bg-emerald-500 transition-colors relative group"
                  title="Drag to resize terminal height"
                >
                  <div className="absolute inset-x-0 -top-1 -bottom-1 group-hover:bg-emerald-500/20 transition-colors" />
                  {/* Center handle indicator */}
                  <div className="absolute inset-0 flex items-center justify-center gap-0.5 pointer-events-none">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-1 h-1 rounded-full bg-slate-600 group-hover:bg-emerald-400 transition-colors" />
                    ))}
                  </div>
                </div>

                <div
                  style={{ height: `${terminalPct}%` }}
                  className="w-full flex-none min-h-[120px] overflow-hidden bg-[#080816] flex flex-col"
                >
                  <FloatingTerminal onClose={() => setIsTerminalOpen(false)} />
                </div>
              </>
            )}

            {/* If terminal is collapsed, show subtle restore tab at bottom-left */}
            {!isTerminalOpen && (
              <div className="h-6 flex-none bg-[#0a0a1a] border-t border-[#1e1e3a] flex items-center px-3">
                <button
                  type="button"
                  onClick={() => setIsTerminalOpen(true)}
                  className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                  title="Open Terminal Panel"
                >
                  <span className="text-emerald-400 font-bold">❯_</span>
                  <span>Open Terminal</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Horizontal Drag Handle (resizes sidebar width) ── */}
      <div
        onMouseDown={startDragH}
        className="w-1 flex-none cursor-col-resize bg-[#1e1e3a] hover:bg-emerald-500/60 active:bg-emerald-500 transition-colors relative group"
        title="Drag to resize sidebar width"
      >
        <div className="absolute inset-y-0 -left-0.5 -right-0.5 group-hover:bg-emerald-500/20 transition-colors" />
      </div>

      {/* ── Right Sidebar (Dedicated 100% File Explorer) ── */}
      <div
        ref={sidebarRef}
        style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN, maxWidth: SIDEBAR_MAX }}
        className="h-full flex flex-col border-l border-[#1e1e3a] bg-[#0a0a1a] flex-none overflow-hidden"
      >
        <FileDrawer />
      </div>
    </div>
  );
};
