import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  ChevronDown,
  ChevronUp,
  FileCode,
  Terminal,
  Play,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { artifactsStore, type ActionItemState } from '~/stores/chat';
import { selectFile, workspaceViewMode, previewUrl } from '~/stores/workspace';

interface ArtifactProps {
  messageId: string;
}

export const Artifact: React.FC<ArtifactProps> = ({ messageId }) => {
  const artifacts = useStore(artifactsStore);
  const artifact = artifacts[messageId];
  const userToggledActions = useRef(false);
  const [showActions, setShowActions] = useState(true);

  const actionsList: ActionItemState[] = artifact?.actions ? Object.values(artifact.actions) : [];
  const allFinished = actionsList.length > 0 && actionsList.every((a) => a.status === 'complete');
  const hasRunning = actionsList.some((a) => a.status === 'running');

  // Auto-expand when actions are streaming in
  useEffect(() => {
    if (actionsList.length > 0 && !showActions && !userToggledActions.current) {
      setShowActions(true);
    }
  }, [actionsList.length]);

  if (!artifact && actionsList.length === 0) {
    return null;
  }

  const toggleActions = (e: React.MouseEvent) => {
    e.stopPropagation();
    userToggledActions.current = true;
    setShowActions(!showActions);
  };

  const handleOpenWorkbench = () => {
    // Switch to code or split view
    const current = workspaceViewMode.get();
    if (current === 'code') {
      workspaceViewMode.set('split');
    } else {
      workspaceViewMode.set('code');
    }
  };

  const handleOpenPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!previewUrl.get()) {
      previewUrl.set('http://localhost:5173');
    }
    workspaceViewMode.set('preview');
  };

  const handleOpenFile = (e: React.MouseEvent, filePath?: string) => {
    e.stopPropagation();
    if (filePath) {
      selectFile(filePath);
      workspaceViewMode.set('code');
    }
  };

  return (
    <div className="my-3 border border-[#272738] rounded-xl overflow-hidden bg-[#111122]/90 shadow-lg transition-all duration-200 hover:border-emerald-500/40">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-[#16162a] hover:bg-[#1a1a32] transition-colors border-b border-[#22223a]">
        <button
          type="button"
          onClick={handleOpenWorkbench}
          className="flex-1 px-4 py-3 text-left flex flex-col justify-center min-w-0 group cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors truncate">
              {artifact?.title || 'Project Build'}
            </span>
            <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-emerald-400 transition-colors shrink-0" />
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5">
            {allFinished
              ? 'Build Complete · Click to open Workbench'
              : hasRunning
              ? 'Building in progress · Click to open Workbench'
              : 'Click to open Workbench'}
          </span>
        </button>

        {/* Live Preview Button */}
        <div className="flex items-center gap-1.5 px-2">
          <button
            type="button"
            onClick={handleOpenPreview}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 transition-all shadow-[0_0_12px_rgba(16,185,129,0.15)] cursor-pointer"
            title="Open Live Preview"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Live Preview</span>
          </button>
        </div>

        {/* Caret collapse / expand toggle */}
        {actionsList.length > 0 && (
          <button
            type="button"
            onClick={toggleActions}
            className="p-3 text-slate-400 hover:text-white transition-colors cursor-pointer border-l border-[#22223a] self-stretch flex items-center justify-center"
            title={showActions ? 'Collapse details' : 'Expand details'}
          >
            {showActions ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Expandable action list */}
      {showActions && actionsList.length > 0 && (
        <div className="p-3 bg-[#0d0d1c] flex flex-col gap-2">
          {actionsList.map((action, idx) => {
            const isFile = action.type === 'file';
            const isShell = action.type === 'shell';
            const isStart = action.type === 'start';

            return (
              <div
                key={action.id || idx}
                className="flex flex-col gap-1.5 p-2 rounded-lg bg-[#141426] border border-[#1e1e36] text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  {/* Status icon */}
                  <div className="shrink-0">
                    {action.status === 'running' ? (
                      <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    ) : action.status === 'complete' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : action.status === 'failed' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </div>

                  {/* Action description */}
                  {isFile ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="text-slate-400 shrink-0">Create</span>
                      <code
                        onClick={(e) => handleOpenFile(e, action.filePath)}
                        className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono text-[11px] truncate cursor-pointer hover:underline hover:text-emerald-200"
                        title="Open in editor"
                      >
                        {action.filePath}
                      </code>
                    </div>
                  ) : isShell ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-slate-300 font-semibold">Run command</span>
                    </div>
                  ) : isStart ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <Play className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <span className="text-slate-300 font-semibold">Start Application</span>
                    </div>
                  ) : null}
                </div>

                {/* Shell / start command preview (1-liner) */}
                {(isShell || isStart) && action.content && (
                  <div className="mt-0.5 px-2.5 py-1 rounded bg-[#090912] border border-black/40 text-[11px] font-mono text-emerald-400 overflow-x-auto">
                    $ {action.content.trim()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
