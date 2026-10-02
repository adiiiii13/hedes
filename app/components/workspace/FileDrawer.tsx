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
  actionRunner,
} from '~/stores/workspace';
import { resetChat } from '~/stores/chat';
import { CheckpointHistory } from './CheckpointHistory';
import { FileCode, Folder, FolderOpen, ChevronRight, ChevronDown, RefreshCw, Plus, Search, ExternalLink, Clock3, Blocks, Activity } from 'lucide-react';

type DesktopBridge = { importFolder: () => Promise<{ projectId: string; title: string } | null>; openProjectLocation: (projectId: string) => Promise<string>; openInVsCode: (projectId: string) => Promise<string> };
const desktopBridge = () => (window as Window & { hedesDesktop?: DesktopBridge }).hedesDesktop;

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

const FileTreeNode: React.FC<{ node: FileNode; depth: number; current: string | null; onOpen: (path: string) => void }> = ({ node, depth, current, onOpen }) => {
  const containsActive = current ? current.startsWith(node.path + '/') : false;
  const [isOpen, setIsOpen] = React.useState(depth < 2 || containsActive);
  
  if (node.type === 'file') {
    return (
      <button
        onClick={() => onOpen(node.path)}
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
        {children.map(child => <FileTreeNode key={child.path} node={child} depth={0} current={current} onOpen={onOpen} />)}
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
          {children.map(child => <FileTreeNode key={child.path} node={child} depth={depth + 1} current={current} onOpen={onOpen} />)}
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
  const actionStates = useStore(actionRunner.actions);
  const fileKeys = Object.keys(allFiles);
  const fileTree = React.useMemo(() => buildFileTree(fileKeys), [fileKeys]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState('');
  const [recent, setRecent] = React.useState<string[]>([]);
  const [tab, setTab] = React.useState<'files' | 'history' | 'activity'>('files');

  React.useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(`hedes_recent_files_${activeProj}`) || '[]')); }
    catch { setRecent([]); }
  }, [activeProj]);

  const openFile = (filePath: string) => {
    selectFile(filePath);
    const next = [filePath, ...recent.filter((path) => path !== filePath)].slice(0, 8);
    setRecent(next);
    if (activeProj) localStorage.setItem(`hedes_recent_files_${activeProj}`, JSON.stringify(next));
  };

  const importFolder = async () => {
    setError('');
    try {
      const imported = await desktopBridge()?.importFolder();
      if (!imported) return;
      await resetChat({ initialize: false, chatId: imported.projectId });
      await loadProjectFiles(imported.projectId);
    } catch (cause) { setError((cause as Error).message); }
  };

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
    <div className="h-full app-background flex flex-col relative overflow-hidden shrink-0">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e3a] app-surface w-full shrink-0">
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
            {typeof window !== 'undefined' && desktopBridge() && <button type="button" onClick={importFolder} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-cyan-300" title="Choose folder to import as a Hedes project"><FolderOpen className="w-3.5 h-3.5" /></button>}
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

      <div className="flex border-b border-white/10 p-1 text-xs"><button type="button" onClick={() => setTab('files')} className={`flex-1 rounded-lg py-1.5 ${tab === 'files' ? 'bg-white/10 text-white' : 'text-slate-400'}`}>Files</button><button type="button" onClick={() => setTab('history')} className={`flex-1 rounded-lg py-1.5 ${tab === 'history' ? 'bg-white/10 text-white' : 'text-slate-400'}`}>History</button><button type="button" onClick={() => setTab('activity')} className={`flex-1 rounded-lg py-1.5 ${tab === 'activity' ? 'bg-white/10 text-white' : 'text-slate-400'}`}>Activity</button></div>

      {tab === 'files' && <><div className="space-y-2 border-b border-white/5 p-2">
        <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 text-slate-500"><Search className="h-3.5 w-3.5" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find file" className="min-w-0 w-full bg-transparent py-1.5 text-xs text-slate-200 outline-none" /></label>
        {activeProj && typeof window !== 'undefined' && desktopBridge() && <button type="button" onClick={() => { void desktopBridge()?.openProjectLocation(activeProj).then((message) => { if (message) setError(message); }).catch((cause) => setError((cause as Error).message)); }} className="flex items-center gap-1.5 text-[11px] text-cyan-300 hover:text-cyan-100"><ExternalLink className="h-3 w-3" />Open folder location</button>}
        {activeProj && typeof window !== 'undefined' && desktopBridge() && <button type="button" onClick={() => { void desktopBridge()?.openInVsCode(activeProj).then((message) => setError(message)).catch((cause) => setError((cause as Error).message)); }} className="flex items-center gap-1.5 text-[11px] text-violet-300 hover:text-violet-100"><Blocks className="h-3 w-3" />Open in VS Code for extensions</button>}
        {error && <p role="alert" className="text-[11px] text-rose-300">{error}</p>}
      </div>
      {recent.some((path) => path in allFiles) && <div className="border-b border-white/5 p-2"><div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><Clock3 className="h-3 w-3" />Recent files</div>{recent.filter((path) => path in allFiles).slice(0, 4).map((path) => <button key={path} type="button" onClick={() => openFile(path)} className="block w-full truncate rounded px-2 py-1 text-left text-[11px] text-slate-300 hover:bg-white/5" title={path}>{path}</button>)}</div>}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto p-2 modern-scrollbar w-full">
        {fileKeys.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-[11px] italic mt-10">
            No files created yet
          </div>
        ) : search ? (
          fileKeys.filter((path) => path.toLowerCase().includes(search.toLowerCase())).map((path) => <button key={path} type="button" onClick={() => openFile(path)} className="flex w-full items-center gap-2 truncate rounded-lg px-2 py-1.5 text-left text-[11px] text-slate-300 hover:bg-white/5">{getFileIcon(path)}<span className="truncate">{path}</span></button>)
        ) : (
          <FileTreeNode node={fileTree} depth={0} current={current} onOpen={openFile} />
        )}
      </div>
      </>}
      {tab === 'history' && <CheckpointHistory />}
      {tab === 'activity' && <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"><p className="text-[11px] text-slate-400">Actual file writes and command results from this chat. A completed write does not verify that the app builds.</p>{Object.values(actionStates).length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">No actions yet.</p>}{Object.values(actionStates).reverse().map((action) => <div key={action.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-[11px]"><div className="flex items-center gap-1.5"><Activity className={`h-3 w-3 ${action.status === 'failed' ? 'text-rose-400' : action.status === 'complete' ? 'text-emerald-400' : 'text-amber-400'}`} /><span className="min-w-0 flex-1 truncate text-slate-200" title={action.filePath || action.type}>{action.filePath || action.type}</span><span className="text-slate-400">{action.status}</span></div>{action.error && <p className="mt-1 break-words text-rose-300">{action.error}</p>}</div>)}</div>}
    </div>
  );
};
