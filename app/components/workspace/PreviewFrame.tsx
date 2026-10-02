import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { previewUrl, isBuilding, files, terminalStore } from '~/stores/workspace';
import { currentChatId } from '~/stores/chat';
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

function isSelfPreview(targetUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const target = new URL(targetUrl, window.location.href);
    const targetPort = target.port || (target.protocol === 'https:' ? '443' : '80');
    const currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const isLoopbackTarget = target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname === '[::1]';
    const isLoopbackCurrent = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '[::1]';

    if (isLoopbackTarget && isLoopbackCurrent && targetPort === currentPort) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const PreviewFrame: React.FC = () => {
  const url = useStore(previewUrl);
  const building = useStore(isBuilding);
  const workspaceFiles = useStore(files);
  const chatId = useStore(currentChatId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [address, setAddress] = useState(url || '');
  const [serverRunning, setServerRunning] = useState(false);
  const [previewError, setPreviewError] = useState('');
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

  useEffect(() => { setAddress(url || ''); }, [url]);
  useEffect(() => {
    if (url && isSelfPreview(url)) {
      setPreviewError('Self-preview of HEDES Studio interface is blocked for security.');
      previewUrl.set(null);
    }
  }, [url]);
  useEffect(() => {
    let active = true;
    const refreshStatus = () => { void fetch(`/api/local/website?chatId=${encodeURIComponent(chatId)}`).then((response) => response.json()).then((status) => {
      if (!active) return;
      setServerRunning(Boolean(status.running));
      if (status.running && status.url && !previewUrl.get()) {
        if (isSelfPreview(status.url)) {
          setPreviewError('Self-preview of HEDES Studio interface is blocked for security.');
        } else {
          previewUrl.set(status.url);
        }
      }
      if (!status.running && status.error && status.url === previewUrl.get()) setPreviewError(status.error);
    }).catch(() => undefined); };
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [chatId]);

  const handleReload = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleOpenExternal = () => {
    if (url) window.open(url, '_blank');
  };

  const commitAddress = () => {
    try {
      const value = address.trim();
      if (!value) { previewUrl.set(null); setPreviewError(''); return; }
      const parsed = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter a website URL, for example http://localhost:5174');
      if (isSelfPreview(parsed.href)) {
        throw new Error('Self-preview of HEDES Studio interface is blocked for security.');
      }
      previewUrl.set(parsed.href);
      setAddress(parsed.href);
      setPreviewError('');
    } catch (error) { setPreviewError((error as Error).message); }
  };

  const handleStartDevServer = async () => {
    try {
      setIsStartingServer(true);
      setPreviewError('');
      const response = await fetch('/api/local/website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, action: 'start' }),
      });
      const status = await response.json();
      if (!response.ok || !status.running || !status.url) throw new Error(status.error || 'Website did not start');
      terminalStore.boltTerminal.write(`\r\n\x1b[32m❯ ${status.command}\x1b[0m\r\n${(status.logs || []).slice(-8).join('\r\n')}\r\n\x1b[36mWebsite: ${status.url}\x1b[0m\r\n`);
      setServerRunning(true);
      previewUrl.set(status.url);
      setRefreshKey((key) => key + 1);
    } catch (error) { setPreviewError((error as Error).message); }
    finally { setIsStartingServer(false); }
  };

  const handleStopDevServer = async () => {
    try {
      const response = await fetch('/api/local/website', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, action: 'stop' }) });
      if (!response.ok) throw new Error(await response.text());
      setServerRunning(false);
      previewUrl.set(null);
      setPreviewError('');
    } catch (error) { setPreviewError((error as Error).message); }
  };

  return (
    <div className="flex-1 flex flex-col h-full app-background overflow-hidden">
      {/* Browser Address Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e3a] app-surface gap-3 text-xs">
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
        <div className="flex-1 flex items-center gap-2 px-3 py-1 rounded-xl bg-black/40 border border-white/5 text-slate-300 font-mono text-[11px] max-w-sm">
          <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <input value={address} onChange={(event) => setAddress(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') commitAddress(); }} onBlur={commitAddress} placeholder="http://localhost:5174" aria-label="Preview URL" className="w-full min-w-0 bg-transparent text-slate-200 outline-none placeholder:text-slate-500" />
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
          <button type="button" onClick={serverRunning ? () => { void handleStopDevServer(); } : () => { void handleStartDevServer(); }} disabled={isStartingServer} className={`rounded-lg p-1 ${serverRunning ? 'text-rose-300' : 'text-emerald-300'} hover:bg-white/5 disabled:opacity-50`} title={serverRunning ? 'Stop project website' : 'Start project website'}>{isStartingServer ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : serverRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
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
      {previewError && <div role="alert" className="border-b border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200">{previewError}</div>}
      <div className="flex-1 w-full h-full relative bg-[#0b0f19] overflow-hidden">
        {url ? (
          deviceMode === 'desktop' ? (
            <iframe
              key={refreshKey}
              ref={iframeRef}
              src={url}
              title="Local Live Preview"
              sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
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
                  sandbox="allow-scripts allow-forms allow-same-origin allow-modals"
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
                onClick={handleStartDevServer}
                disabled={isStartingServer}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/40 text-xs font-mono font-medium transition-all disabled:opacity-50 cursor-pointer"
              >
                {isStartingServer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
                <span>{isStartingServer ? 'Starting website...' : 'Run Website'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
