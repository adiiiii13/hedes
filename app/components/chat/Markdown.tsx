import React, { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  children: string;
  className?: string;
}

export const Markdown = memo(({ children, className = '' }: MarkdownProps) => {
  // Strip any __boltArtifact__ or __boltThought__ tags that might be in the markdown text
  const cleanChildren = (children || '')
    .replace(/<div\s+[^>]*class=["'][^"']*__boltArtifact__[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div\s+[^>]*class=["'][^"']*__boltArtifact__[^"']*["'][^>]*\/?>(?:<\/div>)?/gi, '')
    .replace(/<div\s+[^>]*class=["'][^"']*__boltThought__[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div\s+[^>]*class=["'][^"']*__boltThought__[^"']*["'][^>]*\/?>(?:<\/div>)?/gi, '')
    .trim();

  if (!cleanChildren) return null;

  const components: Components = {
    p: ({ children }: any) => (
      <p className="my-2 leading-relaxed text-slate-200">{children}</p>
    ),
    ul: ({ children }: any) => (
      <ul className="my-2 ml-5 list-disc space-y-1 text-slate-300">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="my-2 ml-5 list-decimal space-y-1 text-slate-300">{children}</ol>
    ),
    li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
    a: ({ href, children }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
      >
        {children}
      </a>
    ),
    code: ({ inline, className, children, ...props }: any) => {
      if (inline) {
        return (
          <code
            className="px-1.5 py-0.5 rounded bg-[#1e1e36] text-emerald-400 font-mono text-xs"
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <code className="block p-3 rounded-lg bg-[#0d0d1c] border border-[#1e1e36] font-mono text-xs text-slate-200 overflow-x-auto my-2" {...props}>
          {children}
        </code>
      );
    },
  };

  return (
    <div className={`prose prose-invert max-w-none text-sm ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {cleanChildren}
      </ReactMarkdown>
    </div>
  );
});
