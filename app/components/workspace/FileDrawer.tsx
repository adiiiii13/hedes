import React from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  activeFile,
  files,
  isFileDrawerOpen,
  selectFile,
  toggleFileDrawer,
  activeProjectName,
  activeProjectDir,
  loadProjectFiles,
  updateFileContent,
} from '~/stores/workspace';
import { FileCode, FileText, Folder, FolderOpen, ChevronRight, ChevronDown, X, RefreshCw, Plus } from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: Record<string, FileNode>;
}

const buildFileTree = (paths: string[]): FileNode => {
  const root: FileNode = { name: 'root', path: '', type: 'folder', children: {} };
  
  for (const path of paths) {
    const parts = path.split('/');
    let current = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!current.children) current.children = {};

      if (i === parts.length - 1) {
        current.children[part] = { name: part, path: currentPath, type: 'file' };
      } else {
        if (!current.children[part]) {
          current.children[part] = { name: part, path: currentPath, type: 'folder', children: {} };
        }
        current = current.children[part];
      }
    }
  }
  return root;
};

const getFileIcon = (fileName: string) => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.dart')) {
    return <span className="w-3.5 h-3.5 flex items-center justify-center text-[11px] text-cyan-400 shrink-0" title="Flutter / Dart">🎯</span>;
  }
  if (lower === 'pubspec.yaml' || lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return <span className="w-3.5 h-3.5 flex items-center justify-center text-[11px] text-purple-400 shrink-0" title="Pubspec / Config">⚙️</span>;
  }
  if (lower.endsWith('.py')) {
    return <span className="w-3.5 h-3.5 flex items-center justify-center text-[11px] text-amber-400 shrink-0" title="Python">🐍</span>;
  }
  if (lower.endsWith('.md')) {
    return <span className="w-3.5 h-3.5 flex items-center justify-center text-[11px] text-blue-400 shrink-0" title="Markdown">📝</span>;
  }
  if (lower.endsWith('.json')) {
    return <span className="w-3.5 h-3.5 flex items-center justify-center text-[9px] text-amber-300 shrink-0 font-mono font-bold" title="JSON">{}</span>;
  }
  if (lower.endsWith('.html')) {
    return <span className="w-3.5 h-3.5 flex items-center justify-center text-[9px] text-orange-400 shrink-0 font-mono font-bold" title="HTML">&lt;&gt;</span>;
  }
  if (lower.endsWith('.css') || lower.endsWith('.scss')) {
    return <span className="w-3.5 h-3.5 flex items-center justify-center text-[10px] text-pink-400 shrink-0 font-bold" title="CSS">#</span>;
  }
  return <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
};

const FileTreeNode: React.FC<{ node: FileNode; depth: number; current: string | null }> = ({ node, depth, current }) => {
  const [isOpen, setIsOpen] = React.useState(true);
  
  if (node.type === 'file') {
    return (
      <button
        onClick={() => selectFile(node.path)}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        className={`w-full flex items-center gap-2 py-1.5 pr-2 rounded-lg text-left transition-colors truncate font-mono text-[11px] ${
          current === node.path
            ? 'bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/40'
            : 'text-slate-300 hover:bg-white/5 hover:text-white'
        }`}
      >
        {getFileIcon(node.name)}
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  const children = Object.values(node.children || {}).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (node.name === 'root') {
    return (
      <div className="flex flex-col space-y-0.5">
        {children.map(child => <FileTreeNode key={child.path} node={child} depth={0} current={current} />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-0.5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ paddingLeft: `${depth * 12}px` }}
        className="w-full flex items-center gap-1.5 py-1 pr-2 rounded-lg text-left text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors font-mono text-[11px]"
      >
        {isOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
        {isOpen ? <FolderOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Folder className="w-3.5 h-3.5 text-emerald-400/70 shrink-0" />}
        <span className="truncate font-medium">{node.name}</span>
      </button>
      {isOpen && (
        <div className="flex flex-col space-y-0.5">
          {children.map(child => <FileTreeNode key={child.path} node={child} depth={depth + 1} current={current} />)}
        </div>
      )}
    </div>
  );
};

export const FileDrawer: React.FC = () => {
  const isOpen = useStore(isFileDrawerOpen);
  const allFiles = useStore(files);
  const current = useStore(activeFile);
  const activeProj = useStore(activeProjectName);
  const activeDir = useStore(activeProjectDir);
  const fileKeys = Object.keys(allFiles);
  const fileTree = React.useMemo(() => buildFileTree(fileKeys), [fileKeys]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadProjectFiles();
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const handleCreateFile = () => {
    const raw = prompt('Enter new file path (e.g. src/components/Footer.jsx):');
    if (!raw || !raw.trim()) return;
    const clean = raw.trim().replace(/^\/+/, '');
    updateFileContent(clean, '');
    selectFile(clean);
    setTimeout(() => {
      loadProjectFiles();
    }, 200);
  };

  return (
    <div className="h-full bg-[#0a0a1a] flex flex-col relative overflow-hidden shrink-0">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e3a] bg-[#111128] w-full shrink-0">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-200 tracking-wide min-w-0">
          <FolderOpen className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-mono">EXPLORER</span>
          <div className="flex items-center gap-0.5 ml-1">
            <button
              type="button"
              onClick={handleCreateFile}
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
              title="New File"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
              title="Refresh Explorer from Disk"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>
        {activeProj && (
          <span
            className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 truncate max-w-[140px]"
            title={`Project Directory: ${activeDir || `projects/${activeProj}`}`}
          >
            {activeProj}
          </span>
        )}
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto p-2 modern-scrollbar w-full">
        {fileKeys.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-[11px] italic mt-10">
            No files created yet
          </div>
        ) : (
          <FileTreeNode node={fileTree} depth={0} current={current} />
        )}
      </div>
    </div>
  );
};
