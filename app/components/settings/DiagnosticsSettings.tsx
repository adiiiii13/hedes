import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Terminal,
  ShieldCheck,
  RefreshCw,
  Eye,
  AlertTriangle,
  Server,
  Layers,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
} from 'lucide-react';
import { clientFetch } from '~/utils/api-client';

interface DiagnosticReport {
  timestamp: string;
  version: string;
  runtime: {
    mode: string;
    node: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
    memory: {
      rssMb: number;
      heapTotalMb: number;
      heapUsedMb: number;
      externalMb: number;
    };
    capabilities: Record<string, boolean>;
  };
  storage: {
    userData: string;
    projects: string;
    logs: string;
  };
  indexing: {
    status: string;
    totalFilesIndexed: number;
  };
  terminal: {
    status: string;
    activeSessions: number;
  };
  preview: {
    status: string;
    activePort?: number;
  };
  providers: {
    configuredCount: number;
    providers: Array<{ id: string; name: string; configured: boolean }>;
  };
  recentErrors: Array<{
    timestamp: string;
    scope: string;
    message: string;
  }>;
}

export const DiagnosticsSettings: React.FC = () => {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewLines, setPreviewLines] = useState<string[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clientFetch('/api/local/diagnostics');
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
      } else {
        setError(data.error || 'Failed to load diagnostics');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching diagnostics');
    } finally {
      setLoading(false);
    }
  };

  const fetchExportPreview = async () => {
    setLoadingPreview(true);
    try {
      const res = await clientFetch('/api/local/diagnostics?action=preview-export');
      const data = await res.json();
      if (data.success && data.preview) {
        setPreviewLines(data.preview.lines);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const copyDiagnosticSummary = () => {
    if (!report) return;
    const summary = JSON.stringify(
      {
        timestamp: report.timestamp,
        version: report.version,
        runtime: report.runtime,
        storage: report.storage,
        indexing: report.indexing,
        terminal: report.terminal,
        preview: report.preview,
        providers: report.providers.providers.map((p) => ({ id: p.id, configured: p.configured })),
      },
      null,
      2
    );
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  if (loading && !report) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-violet-400" />
        <span className="text-sm">Collecting local runtime diagnostics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            System & Runtime Diagnostics
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Offline health telemetry, active process states, and sanitized error rings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copyDiagnosticSummary}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors border border-white/10"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Summary'}
          </button>
          <button
            onClick={fetchDiagnostics}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 transition-colors border border-violet-500/30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {report && (
        <>
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-sky-400" /> Platform & Node
              </span>
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                {report.runtime.platform} ({report.runtime.arch})
              </span>
              <span className="text-[10px] text-slate-400">Node {report.runtime.node}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-violet-400" /> Memory (RSS)
              </span>
              <span className="text-xs font-bold text-white">
                {report.runtime.memory.rssMb} MB
              </span>
              <span className="text-[10px] text-slate-400">Heap: {report.runtime.memory.heapUsedMb} / {report.runtime.memory.heapTotalMb} MB</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" /> Terminal Status
              </span>
              <span className="text-xs font-bold text-white capitalize">
                {report.terminal.status}
              </span>
              <span className="text-[10px] text-slate-400">{report.terminal.activeSessions} Active Session(s)</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-amber-400" /> Preview Runner
              </span>
              <span className="text-xs font-bold text-white capitalize">
                {report.preview.status}
              </span>
              <span className="text-[10px] text-slate-400">
                {report.preview.activePort ? `Port :${report.preview.activePort}` : 'No active server'}
              </span>
            </div>
          </div>

          {/* Capabilities & Storage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-violet-400" />
                Active Runtime Capabilities
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(report.runtime.capabilities).map(([k, enabled]) => (
                  <div key={k} className="flex items-center gap-2 p-1.5 rounded-lg bg-black/20">
                    {enabled ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    )}
                    <span className="text-slate-300 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-sky-400" />
                Authoritative Storage Roots
              </h4>
              <div className="space-y-2 text-xs">
                <div className="p-2 rounded-lg bg-black/20 flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">User Data:</span>
                  <span className="font-mono text-slate-200 truncate">{report.storage.userData}</span>
                </div>
                <div className="p-2 rounded-lg bg-black/20 flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Projects Root:</span>
                  <span className="font-mono text-slate-200 truncate">{report.storage.projects}</span>
                </div>
                <div className="p-2 rounded-lg bg-black/20 flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Diagnostic Logs:</span>
                  <span className="font-mono text-slate-200 truncate">{report.storage.logs}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Sanitized Errors Ring */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <h4 className="text-xs font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Recent Errors Ring Buffer (Sanitized)
            </h4>
            {report.recentErrors.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400 bg-black/20 rounded-xl">
                No recent errors recorded. System running smoothly.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {report.recentErrors.map((err, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-200 flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-rose-400">
                      <span>[{err.scope}]</span>
                      <span>{new Date(err.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <span className="truncate">{err.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Export Preview / Redaction Verification */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-sky-400" />
                  Sanitized Export Preview
                </h4>
                <p className="text-[11px] text-slate-400">
                  Verify that diagnostic exports contain zero tokens, secrets, or raw prompt buffers.
                </p>
              </div>
              <button
                onClick={fetchExportPreview}
                disabled={loadingPreview}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-white/10 hover:bg-white/15 text-white transition-colors border border-white/10"
              >
                <Eye className="w-3.5 h-3.5" />
                {loadingPreview ? 'Reading...' : 'Inspect Export Preview'}
              </button>
            </div>

            {previewLines && (
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 max-h-52 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1">
                {previewLines.length === 0 ? (
                  <span className="text-slate-500">No log entries found in active rotation.</span>
                ) : (
                  previewLines.map((line, idx) => (
                    <div key={idx} className="whitespace-pre-wrap break-all text-slate-400">
                      {line}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
