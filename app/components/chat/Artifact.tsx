import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  ChevronDown,
  ChevronUp,
  FileCode,
  Play,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  ExternalLink,
  Trash2,
  Terminal as TerminalIcon,
} from 'lucide-react';
import { artifactsStore, type ActionItemState } from '~/stores/chat';
import { selectFile, workspaceViewMode, actionRunner } from '~/stores/workspace';
import { InChatTerminalCard } from './InChatTerminalCard';

interface ArtifactProps {
  messageId: string;
}

export const Artifact: React.FC<ArtifactProps> = ({ messageId }) => {
  const artifacts = useStore(artifactsStore);
  const executionActions = useStore(actionRunner.actions);
  const artifact = artifacts[messageId];
  const userToggledActions = useRef(false);
  const [showActions, setShowActions] = useState(true);

  const actionsList: ActionItemState[] = artifact?.actions ? Object.values(artifact.actions).map(action => ({ ...action, status: executionActions[action.id]?.status || action.status })) : [];
  const allFinished = actionsList.length > 0 && actionsList.every((a) => a.status === 'complete');
  const hasRunning = actionsList.some((a) => a.status === 'running');
  const hasFailed = actionsList.some((a) => a.status === 'failed');

  // Count action categories for Antigravity-style summary pills
  const shellActions = actionsList.filter((a) => a.type === 'shell' || a.type === 'terminal' || a.type === 'start');
  const fileActions = actionsList.filter((a) => a.type === 'file');
  const deleteActions = actionsList.filter((a) => a.type === 'delete');

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
    const current = workspaceViewMode.get();
    if (current === 'code') {
      workspaceViewMode.set('split');
    } else {
      workspaceViewMode.set('code');
    }
  };

  const handleOpenPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    <div className="my-3 border border-[#272738] rounded-xl overflow-hidden bg-[#10111e]/95 shadow-xl transition-all duration-200 hover:border-emerald-500/40">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between bg-[#151628] hover:bg-[#18192e] transition-colors border-b border-[#202236]">
        <button
          type="button"
          onClick={handleOpenWorkbench}
          className="flex-1 px-4 py-2.5 text-left flex flex-col justify-center min-w-0 group cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors truncate">
              {artifact?.title || 'Execution Steps'}
            </span>
            <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-emerald-400 transition-colors shrink-0" />
          </div>

          {/* Antigravity-style summary pills */}
          <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-slate-400 flex-wrap">
            {shellActions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/5 flex items-center gap-1">
                <TerminalIcon className="w-2.5 h-2.5 text-emerald-400" />
                {shellActions.length === 1 ? '1 command' : `${shellActions.length} commands`}
              </span>
            )}
            {fileActions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/5 flex items-center gap-1">
                <FileCode className="w-2.5 h-2.5 text-cyan-400" />
                {fileActions.length === 1 ? '1 file' : `${fileActions.length} files`}
              </span>
            )}
            {deleteActions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-1">
                <Trash2 className="w-2.5 h-2.5 text-rose-400" />
                {deleteActions.length} deleted
              </span>
            )}
            <span className="text-slate-500">
              {hasRunning ? '· Running' : hasFailed ? '· Issues detected' : allFinished ? '· Complete' : ''}
            </span>
          </div>
        </button>

        {/* Live Preview Button */}
        <div className="flex items-center gap-1.5 px-2">
          <button
            type="button"
            onClick={handleOpenPreview}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 transition-all shadow-[0_0_12px_rgba(16,185,129,0.15)] cursor-pointer"
            title="Open Live Preview"
          >
            <Play className="w-3 h-3 fill-current" />
            <span className="text-[11px]">Preview</span>
          </button>
        </div>

        {/* Caret collapse / expand toggle */}
        {actionsList.length > 0 && (
          <button
            type="button"
            onClick={toggleActions}
            className="p-3 text-slate-400 hover:text-white transition-colors cursor-pointer border-l border-[#202236] self-stretch flex items-center justify-center"
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

      {/* Expandable Action Cards Stream */}
      {showActions && actionsList.length > 0 && (
        <div className="p-2.5 bg-[#090a14] flex flex-col gap-2">
          {actionsList.map((action, idx) => {
            if (action.status === 'awaiting-approval') {
              const pending = executionActions[action.id];
              return <div key={action.id || idx} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <div className="mb-2 text-amber-300">Review {action.type === 'delete' ? 'deletion' : 'command'} · {pending?.projectId}</div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-slate-200">{action.type === 'delete' ? action.filePath || action.content : action.content}</pre>
                <button type="button" className="mt-2 rounded-md border border-emerald-500/30 px-3 py-1 text-emerald-300" onClick={() => {
                  if (pending) void actionRunner.runAction(pending, true).catch(console.error);
                }}>Approve and run</button>
              </div>;
            }
            const isFile = action.type === 'file';
            const isDelete = action.type === 'delete';
            const isCommand = action.type === 'shell' || action.type === 'terminal' || action.type === 'start';

            // 1. Terminal / Shell command -> Full Antigravity In-Chat Terminal Card
            if (isCommand) {
              return (
                <InChatTerminalCard
                  key={action.id || idx}
                  action={action}
                  defaultExpanded={action.status === 'running' || action.status === 'failed'}
                />
              );
            }

            // 2. File modification -> Antigravity-style Edited/Created File Card
            if (isFile) {
              const linesAdded = action.linesAdded || (action.content ? action.content.split('\n').length : 1);
              const linesRemoved = action.linesRemoved ?? 0;
              const fileName = action.filePath?.split(/[\\/]/).pop() || action.filePath;

              return (
                <div
                  key={action.id || idx}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0e101d] border border-[#1e2032] hover:border-cyan-500/30 transition-all text-xs font-mono group"
                >
                  <div className="flex items-center gap-2 min-w-0">
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

                    <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="text-slate-400 shrink-0">Edited</span>

                    <button
                      type="button"
                      onClick={(e) => handleOpenFile(e, action.filePath)}
                      className="text-cyan-300 font-semibold truncate hover:underline hover:text-cyan-200 cursor-pointer text-left"
                      title={`Open ${action.filePath}`}
                    >
                      {fileName}
                    </button>

                    {action.filePath && action.filePath !== fileName && (
                      <span className="text-[10px] text-slate-500 truncate hidden sm:inline">
                        {action.filePath}
                      </span>
                    )}
                  </div>

                  {/* Diff Line Badges (+X -Y) exactly like Antigravity */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-semibold">
                      +{linesAdded}
                    </span>
                    {linesRemoved > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono text-[10px] font-semibold">
                        -{linesRemoved}
                      </span>
                    )}
                  </div>
                </div>
              );
            }

            // 3. Delete action -> Antigravity-style Deleted File Card
            if (isDelete) {
              const target = action.filePath || action.content?.trim();
              const fileName = target?.split(/[\\/]/).pop() || target;

              return (
                <div
                  key={action.id || idx}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#140e15] border border-rose-950/40 text-xs font-mono"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="text-rose-300 font-semibold shrink-0">Deleted</span>
                    <span className="text-rose-200 font-mono truncate">{fileName}</span>
                  </div>

                  <div className="shrink-0">
                    {action.status === 'running' ? (
                      <Loader2 className="w-3.5 h-3.5 text-rose-400 animate-spin" />
                    ) : action.status === 'complete' ? (
                      <Check className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                    )}
                  </div>
                </div>
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
};
