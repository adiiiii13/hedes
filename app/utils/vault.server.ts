import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getStoragePaths } from './runtime.server.ts';

// In-memory session vault fallback when safeStorage is unavailable
const sessionVault = new Map<string, string>();

interface VaultData {
  version: number;
  encrypted: Record<string, string>; // base64 encrypted payloads
  masked: Record<string, string>;
  updatedAt: Record<string, number>;
}

function getVaultFilePath(): string {
  return path.join(getStoragePaths().vault, 'hedes-vault.enc');
}

export function maskSecret(secret: string): string {
  if (!secret) return '';
  const trimmed = secret.trim();
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  const suffix = trimmed.slice(-4);
  return `••••••••${suffix}`;
}

async function getElectronSafeStorage(): Promise<any | null> {
  if (typeof process === 'undefined' || !process.versions?.electron) {
    return null;
  }
  try {
    const electron = await import('electron');
    const safeStorage = electron.safeStorage || (electron as any).default?.safeStorage;
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      return safeStorage;
    }
  } catch {}
  return null;
}

async function readVaultFile(): Promise<VaultData> {
  const filePath = getVaultFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    return {
      version: data.version || 1,
      encrypted: data.encrypted || {},
      masked: data.masked || {},
      updatedAt: data.updatedAt || {},
    };
  } catch {
    return {
      version: 1,
      encrypted: {},
      masked: {},
      updatedAt: {},
    };
  }
}

async function writeVaultFile(data: VaultData): Promise<void> {
  const filePath = getVaultFilePath();
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tempFile = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempFile, filePath);
}

/**
 * Stores a credential securely.
 * On Windows Desktop with Electron, uses OS DPAPI safeStorage.
 * In session/fallback mode, stores in session vault.
 */
export async function saveCredential(
  credentialId: string,
  secret: string
): Promise<{ configured: boolean; masked: string }> {
  if (!credentialId || typeof credentialId !== 'string') {
    throw new Error('Valid credential ID required');
  }

  const cleanSecret = String(secret || '').trim();
  if (!cleanSecret) {
    await deleteCredential(credentialId);
    return { configured: false, masked: '' };
  }

  const safeStorage = await getElectronSafeStorage();
  const masked = maskSecret(cleanSecret);
  const now = Date.now();

  if (safeStorage) {
    const encryptedBuffer = safeStorage.encryptString(cleanSecret);
    const base64Encrypted = encryptedBuffer.toString('base64');

    const vault = await readVaultFile();
    vault.encrypted[credentialId] = base64Encrypted;
    vault.masked[credentialId] = masked;
    vault.updatedAt[credentialId] = now;

    await writeVaultFile(vault);
  } else {
    // Session fallback
    sessionVault.set(credentialId, cleanSecret);
  }

  return { configured: true, masked };
}

/**
 * Resolves credential plaintext.
 * SERVER-SIDE ONLY - Never expose plaintext to the renderer!
 */
export async function resolveCredential(credentialId: string): Promise<string | null> {
  if (!credentialId) return null;

  const safeStorage = await getElectronSafeStorage();

  if (safeStorage) {
    const vault = await readVaultFile();
    const base64 = vault.encrypted[credentialId];
    if (!base64) return null;

    try {
      const buffer = Buffer.from(base64, 'base64');
      const decrypted = safeStorage.decryptString(buffer);
      return decrypted;
    } catch (err) {
      console.error(`Failed to decrypt credential ${credentialId}:`, err);
      return null;
    }
  }

  return sessionVault.get(credentialId) || null;
}

export async function deleteCredential(credentialId: string): Promise<boolean> {
  sessionVault.delete(credentialId);

  const safeStorage = await getElectronSafeStorage();
  if (safeStorage) {
    const vault = await readVaultFile();
    delete vault.encrypted[credentialId];
    delete vault.masked[credentialId];
    delete vault.updatedAt[credentialId];
    await writeVaultFile(vault);
  }

  return true;
}

export async function listCredentialsStatus(): Promise<
  Record<string, { configured: boolean; masked: string; updatedAt: number }>
> {
  const result: Record<string, { configured: boolean; masked: string; updatedAt: number }> = {};
  const safeStorage = await getElectronSafeStorage();

  if (safeStorage) {
    const vault = await readVaultFile();
    for (const [id, masked] of Object.entries(vault.masked)) {
      result[id] = {
        configured: Boolean(vault.encrypted[id]),
        masked,
        updatedAt: vault.updatedAt[id] || Date.now(),
      };
    }
  }

  // Also include any active session credentials
  for (const [id, secret] of sessionVault.entries()) {
    if (!result[id]) {
      result[id] = {
        configured: true,
        masked: maskSecret(secret),
        updatedAt: Date.now(),
      };
    }
  }

  return result;
}

export async function resolveModelKey(
  provider: string,
  clientKey?: string,
  credentialId?: string
): Promise<string | undefined> {
  if (credentialId) {
    const cred = await resolveCredential(credentialId);
    if (cred) return cred;
  }

  const direct = await resolveCredential(provider);
  if (direct) return direct;

  const lower = await resolveCredential(provider.toLowerCase());
  if (lower) return lower;

  if (clientKey && typeof clientKey === 'string' && clientKey.trim()) {
    return clientKey.trim();
  }

  const p = provider.toLowerCase();
  if (p === 'groq') return process.env.GROQ_API_KEY;
  if (p === 'grok' || p === 'xai') return process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (p === 'openai') return process.env.OPENAI_API_KEY;
  if (p === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (p === 'google') return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (p === 'openrouter') return process.env.OPENROUTER_API_KEY;
  if (p.includes('deepseek')) return process.env.DEEPSEEK_API_KEY;
  if (p.includes('mistral')) return process.env.MISTRAL_API_KEY;
  if (p.includes('together')) return process.env.TOGETHER_API_KEY;

  return undefined;
}
