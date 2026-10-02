import React, { useEffect, useState } from 'react';
import { Blocks } from 'lucide-react';

interface Plugin { id: string; name: string; description: string; installed: boolean }

export function PluginSettings() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => { void fetch('/api/local/plugins').then((r) => r.json()).then((data) => setPlugins(data.plugins || [])).catch((error) => setMessage(String(error))); }, []);
  async function toggle(plugin: Plugin) {
    try {
      const response = await fetch('/api/local/plugins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: plugin.installed ? 'uninstall' : 'install', id: plugin.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Plugin action failed');
      setPlugins(data.plugins || []); setMessage('');
    } catch (error) { setMessage((error as Error).message); }
  }
  return <div className="space-y-5 text-slate-200"><div className="rounded-2xl border border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-500/10 via-slate-950 to-cyan-500/10 p-5"><p className="flex items-center gap-2 font-semibold text-fuchsia-200"><Blocks size={18} /> Local plugins</p><p className="mt-2 text-xs leading-5 text-slate-400">Install local plugin manifests from the app’s plugins folder. Each plugin adds an MCP server. Review and enable its AI tools in the MCP tab.</p></div>{message && <p role="alert" className="text-sm text-rose-300">{message}</p>}<div className="space-y-3">{plugins.map((plugin) => <div key={plugin.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div><p className="font-semibold">{plugin.name}</p><p className="mt-1 text-xs text-slate-400">{plugin.description}</p></div><button onClick={() => void toggle(plugin)} className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold ${plugin.installed ? 'border border-white/15 text-slate-300' : 'bg-fuchsia-500 text-white'}`}>{plugin.installed ? 'Remove' : 'Install'}</button></div>)}</div></div>;
}
