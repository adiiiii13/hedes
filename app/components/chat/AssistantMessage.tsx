import React, { memo } from 'react';
import { Bot, Cpu } from 'lucide-react';
import { Markdown } from './Markdown';
import { Artifact } from './Artifact';
import { useStore } from '@nanostores/react';
import { isGenerating, artifactsStore, type ChatMessage } from '~/stores/chat';

interface AssistantMessageProps {
  message: ChatMessage;
  isLast?: boolean;
}

export const AssistantMessage = memo(({ message, isLast = false }: AssistantMessageProps) => {
  const generating = useStore(isGenerating);
  const artifacts = useStore(artifactsStore);
  const isStreaming = isLast && generating;
  const content = message.content || '';

  // Match the __boltArtifact__ tag emitted by message-parser (flexible to any attribute order)
  const artifactTagRegex = /<div\s+[^>]*class=["'][^"']*__boltArtifact__[^"']*["'][^>]*>(?:<\/div>)?/i;
  const match = content.match(artifactTagRegex);

  let hasArtifact = false;
  let artifactMessageId = message.id;
  let beforeText = content;
  let afterText = '';

  if (match) {
    const idMatch = match[0].match(/data-message-id=["']([^"']+)["']/i);
    artifactMessageId = idMatch?.[1] || message.id;
    hasArtifact = !!artifacts[artifactMessageId] || !!artifacts[message.id];

    const matchIndex = match.index ?? content.indexOf(match[0]);
    beforeText = content.slice(0, matchIndex);
    afterText = content.slice(matchIndex + match[0].length);
  } else if (artifacts[message.id]) {
    hasArtifact = true;
    artifactMessageId = message.id;
    beforeText = content;
    afterText = '';
  }

  // Strip all internal artifact / thought div tags so raw HTML is NEVER displayed as text
  const stripDivs = (str: string) =>
    str
      .replace(/<div\s+[^>]*class=["'][^"']*__boltArtifact__[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div\s+[^>]*class=["'][^"']*__boltArtifact__[^"']*["'][^>]*\/?>(?:<\/div>)?/gi, '')
      .replace(/<div\s+[^>]*class=["'][^"']*__boltThought__[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div\s+[^>]*class=["'][^"']*__boltThought__[^"']*["'][^>]*\/?>(?:<\/div>)?/gi, '')
      .trim();

  const cleanBefore = stripDivs(beforeText);
  const cleanAfter = stripDivs(afterText);

  return (
    <div className="flex flex-col gap-2 w-full py-3 group">
      {/* Sender Header */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-sm">
          <Bot className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-semibold text-slate-200">HEDES</span>
        <span className="text-[10px] text-slate-500 font-mono">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {isStreaming && (
          <div className="flex items-center gap-1 ml-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono text-emerald-400/80">Active</span>
          </div>
        )}
      </div>

      {/* Message Body */}
      <div className="pl-8 w-full flex flex-col gap-2">
        {cleanBefore.length > 0 && <Markdown>{cleanBefore}</Markdown>}

        {hasArtifact && <Artifact messageId={artifactMessageId} />}

        {cleanAfter.length > 0 && <Markdown>{cleanAfter}</Markdown>}

        {!cleanBefore && !hasArtifact && !cleanAfter && isStreaming && (
          <div className="flex items-center gap-2.5 py-2 text-slate-400 text-xs font-mono">
            <Cpu className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>Formulating plan and building solution...</span>
          </div>
        )}
      </div>
    </div>
  );
});
