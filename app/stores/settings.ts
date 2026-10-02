import { atom, map } from 'nanostores';
import type { CustomProviderConfig } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';
import { listCustomModels, saveCustomModel, deleteCustomModel as dbDeleteModel } from '~/persistence/db';

export const DEFAULT_GROQ_KEY = '';
export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

export const isSettingsOpen = atom<boolean>(false);
export const activeProvider = atom<string>(DEFAULT_PROVIDER);
export const activeModel = atom<string>(DEFAULT_MODEL);
export const ollamaBaseUrl = atom<string>(DEFAULT_OLLAMA_URL);
export const ollamaDetectedModels = atom<Array<{ name: string; label: string; provider: string }>>([]);

export const terminalShellType = atom<'powershell' | 'cmd'>('powershell');
export const terminalFontSize = atom<number>(12);
export const terminalCursorStyle = atom<'bar' | 'block'>('bar');
export const isSettingsBackendSynced = atom<boolean>(false);

export interface CredentialStatus {
  configured: boolean;
  masked: string;
  updatedAt?: number;
}

export const vaultCredentials = map<Record<string, CredentialStatus>>({});

export const apiKeys = map<Record<string, string>>({
  Groq: DEFAULT_GROQ_KEY,
});

export const customProviders = atom<CustomProviderConfig[]>([]);
export const customSystemPrompt = atom<string>('');

export async function loadInitialSettings() {
  if (typeof window === 'undefined') return;

  try {
    // 1. Load credentials status from secure backend vault
    try {
      const vRes = await fetch('/api/local/vault');
      const vData = await vRes.json();
      if (vData.ok && vData.credentials) {
        vaultCredentials.set(vData.credentials);
      }
    } catch {}

    // 2. Check for legacy plaintext keys in localStorage and migrate them to secure vault
    const savedKeys = localStorage.getItem('hedes_api_keys');
    if (savedKeys) {
      try {
        const parsed = JSON.parse(savedKeys);
        if (parsed && typeof parsed === 'object') {
          // Perform atomic migration to vault
          const migRes = await fetch('/api/local/vault', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'migrate', credentials: parsed }),
          });
          const migData = await migRes.json();
          if (migData.ok) {
            // Decryption verified and stored in vault: wipe plaintext from localStorage!
            localStorage.removeItem('hedes_api_keys');
            const vRes = await fetch('/api/local/vault');
            const vData = await vRes.json();
            if (vData.ok && vData.credentials) {
              vaultCredentials.set(vData.credentials);
            }
          }
        }
      } catch (migErr) {
        console.warn('Legacy key migration skipped:', migErr);
      }
    }

    const savedOllamaUrl = localStorage.getItem('hedes_ollama_base_url');
    if (savedOllamaUrl) {
      ollamaBaseUrl.set(savedOllamaUrl);
    }

    const savedProvider = localStorage.getItem('hedes_active_provider');
    if (savedProvider) {
      activeProvider.set(savedProvider);
    } else {
      activeProvider.set(DEFAULT_PROVIDER);
    }

    const savedModel = localStorage.getItem('hedes_active_model');
    if (savedModel) {
      activeModel.set(savedModel);
    } else {
      activeModel.set(DEFAULT_MODEL);
    }

    const savedShell = localStorage.getItem('hedes_terminal_shell');
    if (savedShell === 'powershell' || savedShell === 'cmd') {
      terminalShellType.set(savedShell);
    }

    const savedFontSize = localStorage.getItem('hedes_terminal_font_size');
    if (savedFontSize) {
      terminalFontSize.set(parseInt(savedFontSize, 10) || 12);
    }

    const models = await listCustomModels();
    customProviders.set(models);

    const savedSystemPrompt = localStorage.getItem('hedes_custom_system_prompt');
    if (savedSystemPrompt) {
      customSystemPrompt.set(savedSystemPrompt);
    }

    // Attempt backend sync
    fetch('/api/local/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.settings) {
          isSettingsBackendSynced.set(true);
          if (data.settings.terminalShellType) {
            terminalShellType.set(data.settings.terminalShellType);
          }
          if (data.settings.terminalFontSize) {
            terminalFontSize.set(data.settings.terminalFontSize);
          }
          if (data.settings.ollamaBaseUrl) {
            ollamaBaseUrl.set(data.settings.ollamaBaseUrl);
          }
        }
      })
      .catch(() => {});

  } catch (err) {
    console.error('Failed to load settings from storage', err);
  }
}

export function syncSettingsWithBackend() {
  if (typeof window === 'undefined') return;

  const payload = {
    activeProvider: activeProvider.get(),
    activeModel: activeModel.get(),
    ollamaBaseUrl: ollamaBaseUrl.get(),
    terminalShellType: terminalShellType.get(),
    terminalFontSize: terminalFontSize.get(),
    terminalCursorStyle: terminalCursorStyle.get(),
    customSystemPrompt: customSystemPrompt.get(),
  };

  fetch('/api/local/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) isSettingsBackendSynced.set(true);
    })
    .catch(() => isSettingsBackendSynced.set(false));
}

export function setTerminalShellType(type: 'powershell' | 'cmd') {
  terminalShellType.set(type);
  if (typeof window !== 'undefined') {
    localStorage.setItem('hedes_terminal_shell', type);
    syncSettingsWithBackend();
  }
}

export function setTerminalFontSize(size: number) {
  terminalFontSize.set(size);
  if (typeof window !== 'undefined') {
    localStorage.setItem('hedes_terminal_font_size', size.toString());
    syncSettingsWithBackend();
  }
}

export function setOllamaBaseUrl(url: string) {
  ollamaBaseUrl.set(url);
  if (typeof window !== 'undefined') {
    localStorage.setItem('hedes_ollama_base_url', url);
    syncSettingsWithBackend();
  }
}

export function setCustomSystemPrompt(prompt: string) {
  customSystemPrompt.set(prompt);
  if (typeof window !== 'undefined') {
    localStorage.setItem('hedes_custom_system_prompt', prompt);
    syncSettingsWithBackend();
  }
}

export async function setVaultKey(provider: string, secret: string) {
  try {
    const res = await fetch('/api/local/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', credentialId: provider, secret }),
    });
    const data = await res.json();
    if (data.ok && data.status) {
      vaultCredentials.set({
        ...vaultCredentials.get(),
        [provider]: data.status,
      });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('hedes_api_keys');
      }
    }
  } catch (err) {
    console.error('Failed to save vault key:', err);
  }
}

export async function deleteVaultKey(provider: string) {
  try {
    const res = await fetch('/api/local/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', credentialId: provider }),
    });
    const data = await res.json();
    if (data.ok) {
      const current = { ...vaultCredentials.get() };
      delete current[provider];
      vaultCredentials.set(current);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('hedes_api_keys');
      }
    }
  } catch (err) {
    console.error('Failed to delete vault key:', err);
  }
}

export function setApiKey(provider: string, key: string) {
  void setVaultKey(provider, key);
  const current = { ...apiKeys.get(), [provider]: '' };
  apiKeys.set(current);
}

export function setActiveModelAndProvider(provider: string, model: string) {
  activeProvider.set(provider);
  activeModel.set(model);
  if (typeof window !== 'undefined') {
    localStorage.setItem('hedes_active_provider', provider);
    localStorage.setItem('hedes_active_model', model);
    syncSettingsWithBackend();
  }
}

export async function addCustomProvider(config: Omit<CustomProviderConfig, 'id' | 'createdAt'>) {
  const id = `custom-${Date.now()}`;
  if (config.apiKey && config.apiKey.trim()) {
    await setVaultKey(config.name || id, config.apiKey.trim());
    await setVaultKey(id, config.apiKey.trim());
  }

  const safeConfig: CustomProviderConfig = {
    ...config,
    id,
    createdAt: Date.now(),
  };
  delete safeConfig.apiKey;

  await saveCustomModel(safeConfig);
  customProviders.set([...customProviders.get(), safeConfig]);
  syncSettingsWithBackend();
  return safeConfig;
}

export async function removeCustomProvider(id: string) {
  await dbDeleteModel(id);
  await deleteVaultKey(id);
  customProviders.set(customProviders.get().filter((c: CustomProviderConfig) => c.id !== id));
  syncSettingsWithBackend();
}
