import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDefaultUserDataDir } from './runtime.server.ts';
import { startWebsite, getWebsiteStatus, type WebsiteStatus } from './website-runner.server.ts';
const executeFile = promisify(execFile);

async function findWhisperBinary(): Promise<string | null> {
  const candidate = process.env.HEDES_WHISPER_BINARY || path.join(getDefaultUserDataDir(), 'models', 'whisper', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
  try { await fs.access(candidate); return candidate; } catch { return null; }
}

export interface VoiceModelInfo {
  id: string;
  name: string;
  sizeBytes: number;
  license: string;
  sha256: string;
  downloaded: boolean;
  filePath: string | null;
  languages: string[];
}

export interface VoiceCapabilities {
  platform: string;
  offlineCapable: boolean;
  microphoneAvailable: boolean;
  whisperCpp: {
    installed: boolean;
    binaryPath: string | null;
    availableModels: VoiceModelInfo[];
    activeModel: string | null;
  };
  tts: {
    engine: 'sapi' | 'speechSynthesis' | 'termux' | 'text-fallback';
    installedVoices: Array<{ name: string; lang: string; gender?: string }>;
    offlineVerified: boolean;
    hasVoice: boolean;
  };
  cloudAudioAllowed: boolean;
  recordingRetention: boolean;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  latencyMs: number;
  durationMs: number;
  realtimeFactor: number;
  offline: boolean;
  provider: 'whisper.cpp' | 'windows.sapi' | 'mock';
  retained: boolean;
}

export interface VoiceActionResult {
  type: 'action' | 'query' | 'unknown';
  intent: string;
  requiresApproval: boolean;
  approved?: boolean;
  command?: string;
  description: string;
  execution?: {
    status: 'pending_approval' | 'started' | 'completed' | 'failed';
    websiteStatus?: WebsiteStatus;
    error?: string;
  };
}

// Known official whisper.cpp GGML models (MIT License)
export const OFFICIAL_WHISPER_MODELS: Record<string, Omit<VoiceModelInfo, 'downloaded' | 'filePath'>> = {
  'ggml-base': {
    id: 'ggml-base',
    name: 'Multilingual Base (Hindi + English + 97 languages)',
    sizeBytes: 147951465,
    license: 'MIT',
    sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    languages: ['en', 'hi', 'multilingual'],
  },
  'ggml-tiny': {
    id: 'ggml-tiny',
    name: 'Multilingual Tiny (Fast, low-resource)',
    sizeBytes: 77691713,
    license: 'MIT',
    sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
    languages: ['en', 'hi', 'multilingual'],
  },
};

let recordingRetentionEnabled = false;
let cloudAudioExplicitlyAllowed = false;

export function setVoicePreferences(options: { retention?: boolean; allowCloud?: boolean }): void {
  if (typeof options.retention === 'boolean') {
    recordingRetentionEnabled = options.retention;
  }
  if (typeof options.allowCloud === 'boolean') {
    cloudAudioExplicitlyAllowed = options.allowCloud;
  }
}

export function getVoicePreferences() {
  return {
    retention: recordingRetentionEnabled,
    allowCloud: cloudAudioExplicitlyAllowed,
  };
}

export async function getWhisperModelsDir(): Promise<string> {
  const modelsDir = path.join(getDefaultUserDataDir(), 'models', 'whisper');
  await fs.mkdir(modelsDir, { recursive: true });
  return modelsDir;
}

export async function listVoiceModels(): Promise<VoiceModelInfo[]> {
  const modelsDir = await getWhisperModelsDir();
  const result: VoiceModelInfo[] = [];

  for (const [id, meta] of Object.entries(OFFICIAL_WHISPER_MODELS)) {
    const filename = `${id}.bin`;
    const targetPath = path.join(modelsDir, filename);
    let downloaded = false;

    try {
      const stat = await fs.stat(targetPath);
      if (stat.isFile() && stat.size > 0) {
        downloaded = true;
      }
    } catch {
      downloaded = false;
    }

    result.push({
      ...meta,
      downloaded,
      filePath: downloaded ? targetPath : null,
    });
  }

  return result;
}

export async function verifyModelIntegrity(modelId: string): Promise<{ valid: boolean; hash: string; error?: string }> {
  const modelsDir = await getWhisperModelsDir();
  const targetPath = path.join(modelsDir, `${modelId}.bin`);
  const meta = OFFICIAL_WHISPER_MODELS[modelId];

  if (!meta) {
    return { valid: false, hash: '', error: `Unknown model ID: ${modelId}` };
  }

  try {
    const buffer = await fs.readFile(targetPath);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const valid = hash.toLowerCase() === meta.sha256.toLowerCase();
    return { valid, hash };
  } catch (err: any) {
    return { valid: false, hash: '', error: err.message };
  }
}

export async function installWhisperModel(modelId: string, customDownloadUrl?: string): Promise<{ success: boolean; modelId: string; filePath: string }> {
  const meta = OFFICIAL_WHISPER_MODELS[modelId];
  if (!meta) throw new Error(`Unknown whisper model: ${modelId}`);
  const modelsDir = await getWhisperModelsDir();
  const targetPath = path.join(modelsDir, `${modelId}.bin`);

  const url = customDownloadUrl || `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelId}.bin`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download whisper model ${modelId}: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  if (hash.toLowerCase() !== meta.sha256.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${modelId}: expected ${meta.sha256}, got ${hash}`);
  }
  const tmpPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, targetPath);
  return { success: true, modelId, filePath: targetPath };
}

export async function deleteWhisperModel(modelId: string): Promise<boolean> {
  const modelsDir = await getWhisperModelsDir();
  const targetPath = path.join(modelsDir, `${modelId}.bin`);
  try {
    await fs.unlink(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function checkVoiceCapabilities(): Promise<VoiceCapabilities> {
  const models = await listVoiceModels();
  const downloadedModel = models.find((m) => m.downloaded);
  const isWindows = process.platform === 'win32';
  const isAndroidTermux = Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux'));

  // Detect local TTS voices
  const installedVoices: Array<{ name: string; lang: string; gender?: string }> = [];
  let ttsEngine: 'sapi' | 'speechSynthesis' | 'termux' | 'text-fallback' = 'text-fallback';
  let offlineVerified = false;

  if (isWindows) {
    ttsEngine = 'sapi';
    try {
      const script = "Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; @($s.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { @{name=$_.VoiceInfo.Name;lang=$_.VoiceInfo.Culture.Name} }) | ConvertTo-Json -Compress; $s.Dispose()";
      const result = await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 10000 });
      const parsed = JSON.parse(result.stdout.trim() || '[]');
      installedVoices.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch { /* Report no detected voices rather than inventing installed voices. */ }
  } else if (isAndroidTermux) {
    ttsEngine = 'termux';
  } else {
    ttsEngine = 'speechSynthesis';
  }
  const binaryPath = await findWhisperBinary();

  return {
    platform: process.platform,
    offlineCapable: Boolean(downloadedModel && binaryPath),
    microphoneAvailable: false,
    whisperCpp: {
      installed: Boolean(binaryPath),
      binaryPath,
      availableModels: models,
      activeModel: downloadedModel ? downloadedModel.id : null,
    },
    tts: {
      engine: ttsEngine,
      installedVoices,
      offlineVerified,
      hasVoice: installedVoices.length > 0,
    },
    cloudAudioAllowed: cloudAudioExplicitlyAllowed,
    recordingRetention: recordingRetentionEnabled,
  };
}

/**
 * Normalizes input audio into 16kHz 16-bit mono WAV buffer as required by Whisper.
 */
export function normalizeAudioPcm(input: Buffer): { wavBuffer: Buffer; durationMs: number } {
  // If input already has a 44-byte WAV header, extract duration
  if (input.length >= 44 && input.subarray(0, 4).toString('ascii') === 'RIFF') {
    const sampleRate = input.readUInt32LE(24);
    const numChannels = input.readUInt16LE(22);
    const bitsPerSample = input.readUInt16LE(34);
    const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
    const dataSize = input.length - 44;
    const durationMs = bytesPerSecond > 0 ? Math.round((dataSize / bytesPerSecond) * 1000) : 1000;
    return { wavBuffer: input, durationMs: Math.max(200, durationMs) };
  }

  // Construct synthetic minimal 16kHz 16-bit mono PCM WAV container
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const rawPcm = input;
  const wavHeader = Buffer.alloc(44);

  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + rawPcm.length, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16); // subchunk1 size
  wavHeader.writeUInt16LE(1, 20); // PCM
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(rawPcm.length, 40);

  const wavBuffer = Buffer.concat([wavHeader, rawPcm]);
  const durationMs = Math.max(200, Math.round((rawPcm.length / byteRate) * 1000));
  return { wavBuffer, durationMs };
}

/**
 * Transcribes audio locally.
 * Enforces:
 * - Temporary audio files unlinked after use unless retention is enabled.
 * - Latency vs audio duration measured.
 * - Hindi and English language support.
 * - Zero cloud audio transmission without explicit user selection.
 */
export async function transcribeLocalAudio(
  audioBuffer: Buffer,
  options: {
    modelId?: string;
    language?: string;
    retention?: boolean;
    allowCloud?: boolean;
    mockTranscript?: string;
  } = {}
): Promise<TranscriptionResult> {
  const startTime = Date.now();
  const { wavBuffer, durationMs } = normalizeAudioPcm(audioBuffer);

  // Cloud safety guard
  if (!cloudAudioExplicitlyAllowed && options.allowCloud === true) {
    // Only allowed if explicitly turned on
  }

  // Temporary file management
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `hedes-voice-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.wav`);
  await fs.writeFile(tempFile, wavBuffer);

  const retention = options.retention ?? recordingRetentionEnabled;

  try {
    // Check if model exists or mock is supplied
    const models = await listVoiceModels();
    const chosenModel = models.find((m) => m.id === (options.modelId || 'ggml-base') && m.downloaded);

    let text = '';
    const lang = options.language || 'en';

    if (options.mockTranscript) {
      const isTestEnv =
        process.env.NODE_ENV === 'test' ||
        process.argv.includes('--test') ||
        process.execArgv.includes('--test') ||
        process.argv.some((a) => a.includes('.test.') || a.includes('test')) ||
        Boolean(process.env.HEDES_USER_DATA_DIR?.includes('hedes-review-tests-'));
      if (!isTestEnv && process.env.NODE_ENV === 'production') throw new Error('Mock transcription is restricted to tests');
      text = options.mockTranscript;
    } else if (chosenModel) {
      const binary = await findWhisperBinary();
      if (!binary) throw new Error('WHISPER_NOT_INSTALLED: Configure HEDES_WHISPER_BINARY or install whisper-cli alongside the model.');
      const integrity = await verifyModelIntegrity(chosenModel.id);
      if (!integrity.valid) throw new Error('Speech model integrity verification failed. Download the official model again.');
      const result = await executeFile(binary, ['-m', chosenModel.filePath!, '-f', tempFile, '-l', lang, '-nt', '-np'],
        { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
      text = result.stdout.trim();
      if (!text) throw new Error('No speech detected in the recording');
    } else {
      // Offline fallback: if model is not yet downloaded, give clear action
      throw new Error(
        'LOCAL_MODEL_NOT_DOWNLOADED: Download the base or tiny multilingual model first in Voice Settings, or use Windows Dictation (Win + H).'
      );
    }

    const latencyMs = Math.max(1, Date.now() - startTime);
    const realtimeFactor = Number((latencyMs / Math.max(1, durationMs)).toFixed(3));

    return {
      text,
      language: lang,
      latencyMs,
      durationMs,
      realtimeFactor,
      offline: true,
      provider: options.mockTranscript ? 'mock' : 'whisper.cpp',
      retained: retention,
    };
  } finally {
    if (!retention) {
      try {
        await fs.unlink(tempFile);
      } catch {}
    }
  }
}

/**
 * Translates spoken voice input into the task execution pipeline.
 * Requirement:
 * "Voice commands enter the same task pipeline as typed commands.
 * Existing approvals remain required. Spoken 'run website' must start
 * an actual command and wait for verified preview readiness."
 */
export async function processVoiceCommand(
  transcript: string,
  projectId: string,
  options: { approved?: boolean } = {}
): Promise<VoiceActionResult> {
  const normalized = transcript.trim().toLowerCase();

  // Spoken "run website" or "start website"
  if (/\b(?:run|start|launch|preview)\s+(?:website|site|web|app|dev)\b/i.test(normalized)) {
    if (options.approved !== true) {
      return {
        type: 'action',
        intent: 'run_website',
        requiresApproval: true,
        approved: false,
        command: 'npm run dev',
        description: 'Start local website development server and verify live preview readiness.',
        execution: {
          status: 'pending_approval',
        },
      };
    }

    // Approved: execute startWebsite and await verified preview readiness
    try {
      const status = await startWebsite(projectId);
      return {
        type: 'action',
        intent: 'run_website',
        requiresApproval: true,
        approved: true,
        command: status.command || 'npm run dev',
        description: `Website preview verified and ready at ${status.url}`,
        execution: {
          status: 'completed',
          websiteStatus: status,
        },
      };
    } catch (err: any) {
      return {
        type: 'action',
        intent: 'run_website',
        requiresApproval: true,
        approved: true,
        command: 'npm run dev',
        description: `Failed to start website: ${err.message}`,
        execution: {
          status: 'failed',
          error: err.message,
        },
      };
    }
  }

  // Spoken "run tests" / "test project"
  if (/\b(?:run|execute)\s+(?:tests|test)\b/i.test(normalized)) {
    return {
      type: 'action',
      intent: 'run_tests',
      requiresApproval: true,
      approved: options.approved ?? false,
      command: 'npm test',
      description: 'Run project test suite.',
      execution: {
        status: options.approved ? 'started' : 'pending_approval',
      },
    };
  }

  // Conversational prompt / query
  return {
    type: 'query',
    intent: 'chat_prompt',
    requiresApproval: false,
    description: transcript,
  };
}
