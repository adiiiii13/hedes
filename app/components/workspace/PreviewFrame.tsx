import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { previewUrl, isBuilding, files } from '~/stores/workspace';
import {
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Play,
  Terminal,
  Monitor,
  Tablet,
  Smartphone,
  RotateCw,
  Square,
} from 'lucide-react';

export const PreviewFrame: React.FC = () => {
  const url = useStore(previewUrl);
  const building = useStore(isBuilding);
  const workspaceFiles = useStore(files);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isLandscape, setIsLandscape] = useState(false);

  // Automatically switch viewport to mobile frame if viewing a Flutter or mobile project
  const isMobileProject = Boolean(
    workspaceFiles['pubspec.yaml'] || 
    workspaceFiles['lib/main.dart'] || 
    workspaceFiles['app.json']
  );

  useEffect(() => {
    if (isMobileProject) {
      setDeviceMode('mobile');
    }
  }, [isMobileProject]);

  const handleReload = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleOpenExternal = () => {
    const target = url || 'http://localhost:5173';
    window.open(target, '_blank');
  };

  const handleStartDevServer = async () => {
    try {
      setIsStartingServer(true);
      const { currentChatId } = await import('~/stores/chat');
      const chatId = currentChatId.get();

      // Determine correct start command for project stack
      let command = 'npm run dev';
      if (workspaceFiles['pubspec.yaml'] && !workspaceFiles['package.json']) {
        command = 'flutter run -d web-server --web-port 5173';
      } else if ((workspaceFiles['app.py'] || workspaceFiles['main.py']) && !workspaceFiles['package.json']) {
        command = 'python app.py';
      }
      
      fetch('/api/local/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, command }),
      }).catch(console.error);

      // Probe port 5173 until ready
      let attempts = 0;
      const timer = setInterval(async () => {
        attempts++;
        try {
          await fetch('http://localhost:5173', { mode: 'no-cors' });
          previewUrl.set('http://localhost:5173');
          clearInterval(timer);
          setIsStartingServer(false);
        } catch {
          if (attempts >= 10) {
            clearInterval(timer);
            setIsStartingServer(false);
            previewUrl.set('http://localhost:5173');
          }
        }
      }, 1000);
    } catch {
      setIsStartingServer(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0a1a] overflow-hidden">
      {/* Browser Address Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e3a] bg-[#0d0d22] gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400">
          <button
            onClick={handleReload}
            className="p-1 rounded-lg hover:bg-white/5 hover:text-white transition-colors"
            title="Reload Preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* URL Pill */}
        <div className="flex-1 flex items-center gap-2 px-3 py-1 rounded-xl bg-black/40 border border-white/5 text-slate-300 font-mono text-[11px] max-w-sm truncate">
          <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">{url || 'http://localhost:5173'}</span>
        </div>

        {/* Device Mode Switcher (Desktop, Tablet, Mobile) */}
        <div className="flex items-center bg-black/40 rounded-lg border border-white/5 p-0.5 text-slate-400 shrink-0">
          <button
            type="button"
            onClick={() => setDeviceMode('desktop')}
            className={`p-1 rounded transition-colors ${
              deviceMode === 'desktop' ? 'bg-[#1e1e3a] text-cyan-400' : 'hover:text-white'
            }`}
            title="Desktop Mode (Full Width)"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeviceMode('tablet')}
            className={`p-1 rounded transition-colors ${
              deviceMode === 'tablet' ? 'bg-[#1e1e3a] text-cyan-400' : 'hover:text-white'
            }`}
            title="Tablet Viewport (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeviceMode('mobile')}
            className={`p-1 rounded transition-colors ${
              deviceMode === 'mobile' ? 'bg-[#1e1e3a] text-cyan-400' : 'hover:text-white'
            }`}
            title="Mobile Viewport (375px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
          {deviceMode !== 'desktop' && (
            <button
              type="button"
              onClick={() => setIsLandscape(!isLandscape)}
              className={`p-1 rounded transition-colors ml-0.5 ${
                isLandscape ? 'bg-emerald-500/20 text-emerald-400' : 'hover:text-white'
              }`}
              title="Rotate Device Orientation"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {building && (
            <div className="flex items-center gap-1.5 text-[11px] text-cyan-400 font-mono">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Compiling...</span>
            </div>
          )}
          {url && (
            <button
              onClick={() => previewUrl.set(null)}
              className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
              title="Clear Live Preview"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleOpenExternal}
            className="p-1 rounded-lg hover:bg-white/5 hover:text-white transition-colors"
            title="Open in New Tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Frame / Fallback */}
      <div className="flex-1 w-full h-full relative bg-[#0b0f19] overflow-hidden">
        {url ? (
          deviceMode === 'desktop' ? (
            <iframe
              key={refreshKey}
              ref={iframeRef}
              src={url}
              title="Local Live Preview"
              className="w-full h-full border-none bg-white"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4 overflow-auto bg-[#060613] modern-scrollbar">
              <div
                style={
                  deviceMode === 'mobile'
                    ? isLandscape
                      ? { width: '667px', height: '375px', borderRadius: '24px' }
                      : { width: '375px', height: '667px', borderRadius: '32px' }
                    : isLandscape
                    ? { width: '1024px', height: '768px', borderRadius: '20px' }
                    : { width: '768px', height: '960px', borderRadius: '20px' }
                }
                className="relative bg-black shadow-[0_0_40px_rgba(0,0,0,0.8)] border-4 border-[#222244] overflow-hidden flex flex-col transition-all duration-200 shrink-0"
              >
                {/* Mobile notch */}
                {deviceMode === 'mobile' && !isLandscape && (
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 w-24 h-3.5 bg-[#222244] rounded-b-xl z-20 pointer-events-none" />
                )}
                <iframe
                  key={refreshKey}
                  ref={iframeRef}
                  src={url}
                  title="Responsive Live Preview"
                  className="w-full h-full border-none bg-white"
                />
              </div>
            </div>
          )
        ) : (
          <div className="absolute inset-0 bg-[#0a0a1a] flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              <Globe className="w-7 h-7" />
            </div>
            <span className="text-base font-semibold text-slate-200 mb-1">Live Preview Ready</span>
            <span className="text-xs max-w-sm text-slate-400 mb-5 leading-relaxed">
              Connect to your active Vite development server to preview your application in real time.
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => previewUrl.set('http://localhost:5173')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-xs font-mono font-medium transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Connect (http://localhost:5173)</span>
              </button>
              <button
                onClick={handleStartDevServer}
                disabled={isStartingServer}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/40 text-xs font-mono font-medium transition-all disabled:opacity-50 cursor-pointer"
              >
                {isStartingServer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
                <span>{isStartingServer ? 'Starting Vite...' : 'Start Dev Server'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
