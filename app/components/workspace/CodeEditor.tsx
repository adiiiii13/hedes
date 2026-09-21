import React, { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightSpecialChars } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { activeFile, files, updateFileContent } from '~/stores/workspace';
import { FileCode } from 'lucide-react';

export const CodeEditor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInternalUpdate = useRef(false);
  const currentFile = useStore(activeFile);
  const allFiles = useStore(files);

  const fileContent = currentFile ? allFiles[currentFile] || '' : '';

  const getLanguageExtension = (path: string | null) => {
    if (!path) return javascript();
    const lower = path.toLowerCase();
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return html();
    if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.sass')) return css();
    if (lower.endsWith('.json')) return json();
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) return markdown();
    // Dart, Python, TypeScript, JSX share structured C-like tokenization and keywords
    return javascript({ jsx: true, typescript: true });
  };

  useEffect(() => {
    if (!editorRef.current) return;

    const editorTheme = EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '13px',
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'Menlo, Monaco, "Courier New", Consolas, monospace',
        lineHeight: '1.6',
      },
      '.cm-content': {
        padding: '12px 0',
      },
      '.cm-line': {
        padding: '0 12px',
      },
      '&.cm-focused': {
        outline: 'none',
      },
    });

    const state = EditorState.create({
      doc: fileContent,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        vscodeDark,
        EditorView.lineWrapping, // Responsive line wrapping
        editorTheme,
        getLanguageExtension(currentFile),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && currentFile && !isInternalUpdate.current) {
            const newDoc = update.state.doc.toString();
            updateFileContent(currentFile, newDoc);
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [currentFile]);

  // Reactive synchronization: when fileContent updates from AI generation or disk, update editor view
  useEffect(() => {
    if (!viewRef.current || !currentFile) return;

    const currentDoc = viewRef.current.state.doc.toString();
    if (currentDoc !== fileContent) {
      isInternalUpdate.current = true;
      viewRef.current.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: fileContent },
      });
      isInternalUpdate.current = false;
    }
  }, [fileContent, currentFile]);

  if (!currentFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs p-8">
        <FileCode className="w-10 h-10 mb-2 opacity-40 text-slate-400" />
        <span>No file selected</span>
        <span className="text-[11px] text-slate-600 mt-1">Files created by Hedes will appear here</span>
      </div>
    );
  }

  const linesCount = fileContent.split('\n').length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0d0d1f]">
      {/* Tab Header with File Name, Line Count, and Breadcrumbs */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e3a] bg-[#0a0a1a] text-xs select-none">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#151532] border border-[#2e2e5c] text-emerald-300 font-mono">
          <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-medium truncate">{currentFile}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
          <span>{linesCount} {linesCount === 1 ? 'line' : 'lines'}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
          {currentFile.endsWith('.dart') ? (
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 text-[9px] tracking-wider">
              🎯 FLUTTER / DART
            </span>
          ) : currentFile === 'pubspec.yaml' ? (
            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40 text-[9px] tracking-wider">
              ⚙️ PUBSPEC
            </span>
          ) : currentFile.endsWith('.py') ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 text-[9px] tracking-wider">
              🐍 PYTHON
            </span>
          ) : (
            <span className="text-slate-500 uppercase">{currentFile.split('.').pop() || 'file'}</span>
          )}
        </div>
      </div>

      {/* Editor View */}
      <div ref={editorRef} className="flex-1 h-full overflow-hidden font-mono text-xs" />
    </div>
  );
};
