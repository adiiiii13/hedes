import React, { useEffect, useState } from 'react';
import { PlugZap, Plus, Trash2, RefreshCw, CheckCircle, AlertCircle, Radio } from 'lucide-react';

interface Server {
  id: string;
  name: string;
  transport?: 'stdio' | 'sse' | 'http';
  url?: string;
  command: string;
  args: string[];
  enabled: boolean;
  allowToolCalls: boolean;
}
interface RecommendedServer { id: string; name: string; description: string }

export function McpSettings() {
  const [servers, setServers] = useState<Server[]>([]);
  const [recommended, setRecommended] = useState<RecommendedServer[]>([]);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'sse'>('stdio');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('[]');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tools, setTools] = useState<Record<string, string[]>>({});
  const [healthMap, setHealthMap] = useState<Record<string, { healthy: boolean; latencyMs: number; toolCount?: number }>>({});

  useEffect(() => {
    void fetch('/api/local/mcp')
      .then((r) => r.json())
      .then((data) => {
        setServers(data.servers || []);
        setRecommended(data.recommended || []);
      })
      .catch((error) => setMessage(String(error)));
  }, []);

  async function checkHealth(id: string) {
    try {
      const response = await fetch('/api/local/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'health-check', id }),
      });
      const data = await response.json();
      if (response.ok) {
        setHealthMap((prev) => ({ ...prev, [id]: data }));
      }
    } catch {
      setHealthMap((prev) => ({ ...prev, [id]: { healthy: false, latencyMs: 0 } }));
    }
  }

  async function send(body: object) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/local/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'MCP request failed');
      if (data.servers) setServers(data.servers);
      if (data.tools) {
        setTools((value) => ({
          ...value,
          [(body as { id: string }).id]: data.tools.map((item: { name: string }) => item.name),
        }));
      }
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (transport === 'sse') {
      if (!url.trim()) {
        setMessage('Valid SSE URL is required.');
        return;
      }
      if (await send({ action: 'save', server: { name, transport: 'sse', url: url.trim(), command: '', args: [], enabled: true, allowToolCalls: false } })) {
        setName('');
        setUrl('');
      }
      return;
    }

    let parsed: string[];
    try {
      parsed = JSON.parse(args);
      if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) throw new Error();
    } catch {
      setMessage('Arguments must be a JSON array of strings, for example ["server.js"].');
      return;
    }
    if (await send({ action: 'save', server: { name, transport: 'stdio', command, args: parsed, enabled: false, allowToolCalls: false } })) {
      setName('');
      setCommand('');
      setArgs('[]');
    }
  }

  return (
    <div className="space-y-5 text-slate-200">
      <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-slate-950 to-violet-500/10 p-5">
        <div className="flex items-center gap-2 text-cyan-200 font-semibold"><PlugZap size={18} /> MCP servers</div>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Connect local MCP servers through stdio or remote/containerized servers through HTTP/SSE transport. Health checks run live pings against servers.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Recommended MCP servers</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {recommended.map((item) => {
            const installed = servers.some((server) => server.name === item.name);
            return (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3">
                <div>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.description}</p>
                </div>
                <button
                  disabled={busy || installed}
                  onClick={() => void send({ action: 'install-recommended', id: item.id })}
                  className="shrink-0 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:bg-slate-700 disabled:text-slate-300"
                >
                  {installed ? 'Installed' : 'Install'}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">Official open source servers. Filesystem server is strictly isolated to the active project folder.</p>
      </div>

      {/* Add Server Form */}
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
        <input
          aria-label="Server name"
          placeholder="Server name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
        />

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="transport"
              checked={transport === 'stdio'}
              onChange={() => setTransport('stdio')}
            />
            <span>Stdio (Local Command)</span>
          </label>
          <label className="text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer ml-3">
            <input
              type="radio"
              name="transport"
              checked={transport === 'sse'}
              onChange={() => setTransport('sse')}
            />
            <span>HTTP / SSE URL</span>
          </label>
        </div>

        {transport === 'stdio' ? (
          <>
            <input
              aria-label="Executable"
              placeholder="Executable, e.g. node or python"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500 sm:col-span-2"
            />
            <input
              aria-label="Arguments JSON"
              placeholder='Arguments JSON: ["server.js"]'
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500 sm:col-span-2"
            />
          </>
        ) : (
          <input
            aria-label="Server SSE URL"
            placeholder="http://localhost:8000/sse"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500 sm:col-span-2"
          />
        )}

        <button
          disabled={busy || !name || (transport === 'stdio' ? !command : !url)}
          onClick={add}
          className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50 sm:col-span-2"
        >
          <Plus size={15} /> Add server
        </button>
      </div>

      {message && <p role="alert" className="text-sm text-rose-300">{message}</p>}

      <div className="space-y-3">
        {servers.map((server) => {
          const health = healthMap[server.id];
          return (
            <div key={server.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{server.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-mono bg-white/5 border border-white/10 text-slate-400">
                      {server.transport || 'stdio'}
                    </span>
                    {health && (
                      <span className={`flex items-center gap-1 text-[11px] font-mono ${health.healthy ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {health.healthy ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                        {health.healthy ? `${health.latencyMs}ms (${health.toolCount || 0} tools)` : 'unreachable'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">
                    {server.transport === 'sse' ? server.url : `${server.command} ${server.args?.join(' ') || ''}`}
                  </p>
                </div>
                <button
                  title="Remove server"
                  onClick={() => void send({ action: 'delete', id: server.id })}
                  className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={server.enabled}
                    onChange={(e) => void send({ action: 'save', server: { ...server, enabled: e.target.checked } })}
                  />
                  <span>Enabled</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={server.allowToolCalls}
                    onChange={(e) => void send({ action: 'save', server: { ...server, allowToolCalls: e.target.checked } })}
                  />
                  <span>Allow AI tool calls</span>
                </label>
                <button
                  disabled={busy}
                  onClick={() => void checkHealth(server.id)}
                  className="flex items-center gap-1 text-cyan-300 hover:text-cyan-100"
                >
                  <Radio size={13} /> Check Health
                </button>
                <button
                  disabled={busy}
                  onClick={() => void send({ action: 'test', id: server.id })}
                  className="flex items-center gap-1 text-violet-300 hover:text-violet-100"
                >
                  <RefreshCw size={13} /> List Tools
                </button>
              </div>
              {tools[server.id] && (
                <p className="mt-3 text-xs text-slate-400">Tools: {tools[server.id].join(', ') || 'none'}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
