import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  apiKeys,
  activeProvider,
  activeModel,
  customProviders,
  customSystemPrompt,
  setApiKey,
  addCustomProvider,
  removeCustomProvider,
  setCustomSystemPrompt,
  ollamaBaseUrl,
  ollamaDetectedModels,
  setOllamaBaseUrl,
  setActiveModelAndProvider,
  DEFAULT_OLLAMA_URL,
} from '~/stores/settings';
import { GlowButton } from '~/components/ui/GlowButton';
import { normalizeCustomBaseUrl } from '~/utils/custom-models';
import { Check, Cpu, ExternalLink, HardDrive, Key, Loader2, MessageSquare, Plus, RefreshCw, RotateCcw, Save, Server, Trash2, Zap } from 'lucide-react';

export const LLMConfigurator: React.FC = () => {
  const keys = useStore(apiKeys);
  const customs = useStore(customProviders);
  const selectedProvider = useStore(activeProvider);
  const selectedModel = useStore(activeModel);
  const [doctor, setDoctor] = useState<{ loading: boolean; ok?: boolean; message?: string; latencyMs?: number }>({ loading: false });
  const savedSystemPrompt = useStore(customSystemPrompt);

  // Local system prompt state for the textarea
  const [localSystemPrompt, setLocalSystemPrompt] = useState(savedSystemPrompt);
  const [promptSaved, setPromptSaved] = useState(false);

  React.useEffect(() => {
    setLocalSystemPrompt(savedSystemPrompt);
  }, [savedSystemPrompt]);

  // New custom model form state
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434/v1');
  const [modelId, setModelId] = useState('');
  const [apiKey, setCustomApiKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scannedModels, setScannedModels] = useState<Array<{ id: string; label: string }>>([]);
  const scanVersion = React.useRef(0);
  const scanInitialized = React.useRef(false);

  const scanCustomModels = async (): Promise<{ baseUrl: string; models: Array<{ id: string; label: string }> } | null> => {
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeCustomBaseUrl(baseUrl);
    } catch (error) {
      setScanMessage(error instanceof Error ? error.message : 'Invalid endpoint URL.');
      return null;
    }
    const version = ++scanVersion.current;
    setIsScanning(true);
    setScanMessage('Scanning models...');
    try {
      const response = await fetch('/api/custom-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: normalizedUrl, apiKey: apiKey.trim() }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Could not scan models.');
      if (version === scanVersion.current) {
        setScannedModels(data.models);
        setModelId((current) => current || data.models[0].id);
        setScanMessage(`${data.models.length} model${data.models.length === 1 ? '' : 's'} found. Select one below or enter an ID.`);
      }
      return { baseUrl: data.baseUrl, models: data.models };
    } catch (error) {
      if (version === scanVersion.current) {
        setScannedModels([]);
        setScanMessage(`${error instanceof Error ? error.message : 'Scan failed.'} Manual model ID is available.`);
      }
      return null;
    } finally {
      if (version === scanVersion.current) setIsScanning(false);
    }
  };

  React.useEffect(() => {
    if (!scanInitialized.current) {
      scanInitialized.current = true;
      return;
    }
    scanVersion.current += 1;
    setScannedModels([]);
    if (scannedModels.some((model) => model.id === modelId)) setModelId('');
    setScanMessage(null);
    try {
      normalizeCustomBaseUrl(baseUrl);
    } catch {
      return;
    }
    const timer = window.setTimeout(() => { void scanCustomModels(); }, 900);
    return () => window.clearTimeout(timer);
  }, [baseUrl, apiKey]);

  // Local state for API keys to implement Save button behavior
  const [localKeys, setLocalKeys] = useState<Record<string, string>>({});

  // Sync when store changes externally initially
  React.useEffect(() => {
    setLocalKeys(keys);
  }, [keys]);

  // Ollama local state & test handler
  const activeOllamaUrl = useStore(ollamaBaseUrl);
  const detectedOllamaModels = useStore(ollamaDetectedModels);
  const [localOllamaUrl, setLocalOllamaUrl] = useState(activeOllamaUrl);
  const [ollamaStatus, setOllamaStatus] = useState<{ loading: boolean; success?: boolean; message?: string }>({ loading: false });

  React.useEffect(() => {
    setLocalOllamaUrl(activeOllamaUrl);
  }, [activeOllamaUrl]);

  const handleTestOllama = async () => {
    setOllamaStatus({ loading: true });
    setOllamaBaseUrl(localOllamaUrl.trim() || DEFAULT_OLLAMA_URL);
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'Ollama',
          baseUrl: localOllamaUrl.trim() || DEFAULT_OLLAMA_URL,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.models && Array.isArray(data.models)) {
          ollamaDetectedModels.set(data.models);
        }
        setOllamaStatus({
          loading: false,
          success: true,
          message: data.message || `Connected to Ollama (${data.latencyMs}ms)`,
        });
      } else {
        setOllamaStatus({
          loading: false,
          success: false,
          message: data.error || 'Connection to Ollama failed',
        });
      }
    } catch (err: any) {
      setOllamaStatus({
        loading: false,
        success: false,
        message: err.message || 'Failed to reach Ollama endpoint',
      });
    }
  };

  const handleSaveAndTest = async (providerId: string) => {
    const key = localKeys[providerId] !== undefined ? localKeys[providerId] : (keys[providerId] || '');
    setApiKey(providerId, key);
    await handleTestProvider(providerId, key);
  };

  // Per-provider connection test state
  const [testStatuses, setTestStatuses] = useState<
    Record<string, { loading: boolean; success?: boolean; message?: string }>
  >({});

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim()) return;

    setIsTesting(true);
    setStatusMessage('Adding custom model...');

    try {
      const normalizedUrl = normalizeCustomBaseUrl(baseUrl);
      const scan = !modelId.trim() && scannedModels.length === 0 ? await scanCustomModels() : null;
      const selectedModel = modelId.trim() || scan?.models[0]?.id || scannedModels[0]?.id;
      if (!selectedModel) {
        setStatusMessage('Enter a model ID manually, or connect an endpoint that lists models.');
        return;
      }
      const detectedModels = (scan?.models || scannedModels).map((model) => model.id);
      const saved = await addCustomProvider({
        name: name.trim(),
        baseUrl: normalizedUrl,
        modelId: selectedModel,
        detectedModels: [...new Set([selectedModel, ...detectedModels])],
        apiKey: apiKey.trim() || undefined,
        enabled: true,
      });

      setActiveModelAndProvider(saved.id, selectedModel);
      setStatusMessage(`Custom model ${selectedModel} added and selected.`);
      setName('');
      setModelId('');
      setScannedModels([]);
      setCustomApiKey('');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestProvider = async (providerId: string, directKey?: string) => {
    const key = directKey !== undefined ? directKey : (keys[providerId] || '');
    setTestStatuses((prev) => ({
      ...prev,
      [providerId]: { loading: true },
    }));

    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId,
          apiKey: key,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setTestStatuses((prev) => ({
          ...prev,
          [providerId]: {
            loading: false,
            success: true,
            message: `Connected (${data.latencyMs}ms)`,
          },
        }));
      } else {
        setTestStatuses((prev) => ({
          ...prev,
          [providerId]: {
            loading: false,
            success: false,
            message: data.error || 'Connection failed',
          },
        }));
      }
    } catch (err: any) {
      setTestStatuses((prev) => ({
        ...prev,
        [providerId]: {
          loading: false,
          success: false,
          message: err.message,
        },
      }));
    }
  };

  const runModelDoctor = async () => {
    setDoctor({ loading: true });
    try {
      const custom = customs.find((item) => item.id === selectedProvider);
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, model: selectedModel, apiKey: custom?.apiKey || keys[selectedProvider], baseUrl: activeOllamaUrl, customProviders: customs }),
      });
      const data = await response.json();
      setDoctor({ loading: false, ok: Boolean(data.ok), message: data.error || data.message || 'No result', latencyMs: data.latencyMs });
    } catch (error) {
      setDoctor({ loading: false, ok: false, message: (error as Error).message });
    }
  };

  const builtInProviders = [
    {
      id: 'Groq',
      label: 'Groq API Key (Ultra Fast Inference)',
      placeholder: 'gsk_...',
      link: 'https://console.groq.com/keys',
      badge: 'Recommended',
    },
    {
      id: 'DeepSeek',
      label: 'DeepSeek API Key (DeepSeek-V3 & DeepSeek-R1)',
      placeholder: 'sk-...',
      link: 'https://platform.deepseek.com/api_keys',
      badge: 'High Reasoning',
    },
    {
      id: 'OpenAI',
      label: 'OpenAI API Key (GPT-4o, o1, o3-mini)',
      placeholder: 'sk-proj-...',
      link: 'https://platform.openai.com/api-keys',
    },
    {
      id: 'Anthropic',
      label: 'Anthropic API Key (Claude 3.5 Sonnet)',
      placeholder: 'sk-ant-...',
      link: 'https://console.anthropic.com',
    },
    {
      id: 'Google',
      label: 'Google Gemini API Key (Gemini 2.0 Flash/Pro)',
      placeholder: 'AIzaSy...',
      link: 'https://aistudio.google.com',
    },
    {
      id: 'Mistral',
      label: 'Mistral AI API Key (Mistral Large, Codestral)',
      placeholder: '...',
      link: 'https://console.mistral.ai/api-keys',
    },
    {
      id: 'Together',
      label: 'Together AI API Key (Llama 3.3, Qwen 2.5)',
      placeholder: '...',
      link: 'https://api.together.xyz/settings/api-keys',
    },
    {
      id: 'Grok',
      label: 'Grok / xAI API Key',
      placeholder: 'xai-...',
      link: 'https://console.x.ai',
    },
    {
      id: 'OpenRouter',
      label: 'OpenRouter API Key (Universal Hub)',
      placeholder: 'sk-or-...',
      link: 'https://openrouter.ai/keys',
    },
  ];

  return (
    <div className="space-y-6 text-xs text-slate-300">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
        <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-white">Model Doctor</h3><p className="mt-1 text-[11px] text-slate-400">Selected: {selectedProvider} / {selectedModel}. Checks connection and a short answer. Local Ollama check currently tests model discovery.</p>{doctor.message && <p role="status" className={`mt-2 text-xs ${doctor.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{doctor.message}{doctor.latencyMs ? ` (${doctor.latencyMs} ms)` : ''}</p>}</div>
        <button type="button" onClick={() => void runModelDoctor()} disabled={doctor.loading} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-50">{doctor.loading ? 'Checking…' : 'Run diagnostic'}</button>
      </div>
      {/* Built-in API Keys Section */}
      <div className="p-4 rounded-2xl bg-[#0e0e24] border border-[#1e1e3a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-violet-400" />
            <h3 className="font-bold text-sm text-white">Built-in Provider API Keys</h3>
          </div>
          <span className="text-[11px] text-slate-500">Groq, Grok, OpenAI, Claude, Gemini, OpenRouter</span>
        </div>

        <div className="space-y-3.5">
          {builtInProviders.map((item) => {
            const test = testStatuses[item.id];
            const currentValue = localKeys[item.id] !== undefined ? localKeys[item.id] : (keys[item.id] || '');
            
            return (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-medium text-slate-300">
                      {item.label}
                    </label>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {test && (
                      <span
                        className={`text-[10px] font-medium ${
                          test.success ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {test.message}
                      </span>
                    )}
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
                    >
                      <span>Get key</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={item.placeholder}
                    value={currentValue}
                    onChange={(e) => setLocalKeys(prev => ({ ...prev, [item.id]: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-[#1e1e3a] focus:border-violet-500/50 outline-none text-white text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveAndTest(item.id)}
                    disabled={test?.loading}
                    className="px-3 py-2 rounded-xl bg-[#151532] hover:bg-[#1f1f45] border border-white/10 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {test?.loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                    ) : test?.success ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>Save & Test</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dedicated Ollama Local AI Section */}
      <div className="p-4 rounded-2xl bg-[#0e0e24] border border-cyan-500/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-white">Ollama (Local AI Models)</h3>
            <span className="px-2 py-0.5 text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full">
              OFFLINE / 100% FREE
            </span>
          </div>
          <a
            href="https://ollama.com/download"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
          >
            <span>Download Ollama</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>

        <p className="text-slate-400 mb-3 text-[11px] leading-relaxed">
          Run open-source models completely locally on your machine with 100% privacy, zero token costs, and offline support.
        </p>

        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="http://127.0.0.1:11434"
              value={localOllamaUrl}
              onChange={(e) => setLocalOllamaUrl(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-[#1e1e3a] focus:border-cyan-500/50 outline-none text-white text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleTestOllama}
              disabled={ollamaStatus.loading}
              className="px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {ollamaStatus.loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              ) : ollamaStatus.success ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span>Test & Sync Models</span>
            </button>
          </div>

          {ollamaStatus.message && (
            <div
              className={`p-2 rounded-xl text-[11px] font-medium border ${
                ollamaStatus.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {ollamaStatus.message}
            </div>
          )}

          {detectedOllamaModels.length > 0 && (
            <div className="pt-2 border-t border-[#1e1e3a]">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block mb-2">
                Detected Installed Models ({detectedOllamaModels.length}) — Click to Select:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {detectedOllamaModels.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => setActiveModelAndProvider('Ollama (Local)', m.name)}
                    className="px-2.5 py-1 rounded-lg bg-[#151532] hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/40 text-slate-200 text-[11px] transition-colors flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    <span>{m.label || m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Plug-Any-LLM Form */}
      <div className="p-4 rounded-2xl bg-[#0e0e24] border border-emerald-500/30">
        <div className="flex items-center gap-2 mb-3">
          <Server className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-sm text-white">Plug Any Custom LLM</h3>
        </div>
        <p className="text-slate-400 mb-4 leading-relaxed text-[11px]">
          Add any custom or self-hosted model endpoint (LM Studio, vLLM, Ollama, LocalAI, Together, or OpenAI-compatible server).
        </p>

        <form onSubmit={handleAddCustom} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Display Name
              </label>
              <input
                type="text"
                placeholder="e.g. My Local DeepSeek"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-[#1e1e3a] focus:border-emerald-500/50 outline-none text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Model Identifier (Optional)
              </label>
              <input
                type="text"
                placeholder="Auto detected, or enter manually"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-[#1e1e3a] focus:border-emerald-500/50 outline-none text-white text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Endpoint Base URL
              </label>
              <input
                type="text"
                placeholder="http://localhost:11434/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-[#1e1e3a] focus:border-emerald-500/50 outline-none text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                API Key (Optional)
              </label>
              <input
                type="password"
                placeholder="Bearer token if required"
                value={apiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-[#1e1e3a] focus:border-emerald-500/50 outline-none text-white text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { void scanCustomModels(); }} disabled={isScanning || !baseUrl.trim()} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50">
              {isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Scan models
            </button>
            <span aria-live="polite" className="text-[11px] text-slate-400">{scanMessage || 'Models scan automatically after you enter the endpoint and key.'}</span>
          </div>
          {scannedModels.length > 0 && (
            <label className="block text-[11px] font-medium text-slate-400">
              Available models ({scannedModels.length})
              <select value={scannedModels.some((model) => model.id === modelId) ? modelId : ''} onChange={(event) => setModelId(event.target.value)} className="mt-1 w-full rounded-xl border border-[#1e1e3a] bg-[#151532] px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50">
                <option value="">Use manual model ID above</option>
                {scannedModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
              </select>
            </label>
          )}

          <div className="flex items-center justify-between pt-2">
            {statusMessage && (
              <span className="text-[11px] text-emerald-400 font-medium">
                {statusMessage}
              </span>
            )}
            <div className="ml-auto">
              <GlowButton
                type="submit"
                size="sm"
                variant="emerald"
                loading={isTesting}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Register Custom Model
              </GlowButton>
            </div>
          </div>
        </form>

        {/* Existing Custom Models */}
        {customs.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#1e1e3a] space-y-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Registered Custom Models ({customs.length})
            </span>
            {customs.map((cm) => (
              <div
                key={cm.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5"
              >
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-violet-400" />
                  <div>
                    <div className="font-semibold text-slate-200">{cm.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {cm.modelId} • {cm.baseUrl}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => removeCustomProvider(cm.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Remove Model"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── System Prompt Section ── */}
      <div className="p-4 rounded-2xl bg-[#0e0e24] border border-[#1e1e3a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-white">Custom System Prompt</h3>
          </div>
          <span className="text-[11px] text-slate-500">Extend AI personality &amp; rules</span>
        </div>

        <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
          These instructions are appended to the Hedes system prompt. Use this to set project-specific rules,
          preferred tech stacks, coding style, or any persistent context you want the AI to always remember.
        </p>

        <textarea
          value={localSystemPrompt}
          onChange={(e) => {
            setLocalSystemPrompt(e.target.value);
            setPromptSaved(false);
          }}
          placeholder={`Examples:\n- Always use TypeScript strict mode\n- Prefer Tailwind CSS for styling\n- This project uses shadcn/ui components\n- Color scheme: dark with emerald accents`}
          rows={6}
          className="w-full bg-[#0a0a1a] border border-[#2e2e5c] rounded-xl px-4 py-3 text-xs text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 resize-y min-h-[100px] max-h-[300px] transition-colors"
        />

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => {
              setCustomSystemPrompt(localSystemPrompt);
              setPromptSaved(true);
              setTimeout(() => setPromptSaved(false), 2000);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all ${
              promptSaved
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:border-cyan-500/60'
            }`}
          >
            {promptSaved ? (
              <><Check className="w-3 h-3" /> SAVED</>
            ) : (
              <><Save className="w-3 h-3" /> SAVE PROMPT</>
            )}
          </button>

          <button
            onClick={() => {
              setLocalSystemPrompt('');
              setCustomSystemPrompt('');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/40 transition-all"
          >
            <RotateCcw className="w-3 h-3" /> RESET
          </button>

          <span className="ml-auto text-[10px] text-slate-500 font-mono">
            {localSystemPrompt.length} chars
          </span>
        </div>
      </div>
    </div>
  );
};
