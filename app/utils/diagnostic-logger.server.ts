import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getStoragePaths, getRuntimeCapabilities, getRuntimeMode } from './runtime.server.ts';
import { sanitizeErrorMessage } from './session-auth.server.ts';

export interface DiagnosticLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  scope: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface DiagnosticReport {
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
    capabilities: ReturnType<typeof getRuntimeCapabilities>;
  };
  storage: {
    userData: string;
    projects: string;
    logs: string;
  };
  indexing: {
    status: 'idle' | 'indexing' | 'ready';
    totalFilesIndexed: number;
    lastIndexedAt?: string;
  };
  terminal: {
    status: 'ready' | 'running' | 'idle';
    activeSessions: number;
  };
  preview: {
    status: 'stopped' | 'running';
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

const MAX_LOG_FILES = 5;
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const RECENT_ERROR_BUFFER_SIZE = 20;

// In-memory ring buffer for immediate error access without heavy disk reads
const recentErrorsRingBuffer: Array<{ timestamp: string; scope: string; message: string }> = [];

// Redaction patterns for secrets, keys, and credentials
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_\-]{16,}/gi,
  /gsk_[a-zA-Z0-9_\-]{16,}/gi,
  /AIza[0-9A-Za-z-_]{35}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /bearer\s+[a-zA-Z0-9_.\-]+/gi,
  /data:audio\/[^;]+;base64,[a-zA-Z0-9+/=]+/gi,
  /data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/gi,
];

/**
 * Deeply scrub any objects or strings of secrets, full source contents, or audio dumps.
 */
export function sanitizeLogData(value: unknown): unknown {
  if (typeof value === 'string') {
    let sanitized = sanitizeErrorMessage(value);
    for (const pattern of SECRET_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    // Truncate long content dumps (e.g. source code or full prompts) to metadata
    if (sanitized.length > 500) {
      sanitized = `${sanitized.slice(0, 150)}... [TRUNCATED ${sanitized.length - 200} BYTES] ...${sanitized.slice(-50)}`;
    }
    return sanitized;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeLogData);
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const lowerKey = k.toLowerCase();
      if (
        lowerKey.includes('key') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('password')
      ) {
        out[k] = '[REDACTED]';
      } else if (lowerKey === 'prompt' || lowerKey === 'audio' || lowerKey === 'content') {
        out[k] = typeof v === 'string' ? `[PAYLOAD_${v.length}_BYTES]` : '[REDACTED_PAYLOAD]';
      } else {
        out[k] = sanitizeLogData(v);
      }
    }
    return out;
  }

  return value;
}

/**
 * Ensures diagnostic log rotation within 5 files x 5 MB limit.
 */
async function rotateLogsIfNeeded(logDir: string, primaryLogFile: string): Promise<void> {
  try {
    const stat = await fs.stat(primaryLogFile);
    if (stat.size < MAX_LOG_SIZE_BYTES) {
      return;
    }

    // Rotate: remove oldest (e.g., .4), shift .3 -> .4, .2 -> .3, .1 -> .2, primary -> .1
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const current = path.join(logDir, `hedes-diagnostic.${i}.log`);
      const next = path.join(logDir, `hedes-diagnostic.${i + 1}.log`);
      try {
        if (i === MAX_LOG_FILES - 1) {
          await fs.unlink(next).catch(() => {});
        }
        await fs.rename(current, next).catch(() => {});
      } catch {
        // Ignore rotation errors on missing files
      }
    }

    const firstBackup = path.join(logDir, 'hedes-diagnostic.1.log');
    await fs.rename(primaryLogFile, firstBackup).catch(() => {});
  } catch {
    // Primary log does not exist yet; no rotation needed
  }
}

/**
 * Append a sanitized metadata entry to the rotating diagnostic log.
 */
export async function logDiagnostic(
  level: 'debug' | 'info' | 'warn' | 'error',
  scope: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const timestamp = new Date().toISOString();
  const sanitizedMsg = String(sanitizeLogData(message));
  const sanitizedMeta = metadata ? (sanitizeLogData(metadata) as Record<string, unknown>) : undefined;

  if (level === 'error') {
    recentErrorsRingBuffer.unshift({ timestamp, scope, message: sanitizedMsg });
    if (recentErrorsRingBuffer.length > RECENT_ERROR_BUFFER_SIZE) {
      recentErrorsRingBuffer.pop();
    }
  }

  try {
    const { logs: logDir } = getStoragePaths();
    await fs.mkdir(logDir, { recursive: true });

    const primaryFile = path.join(logDir, 'hedes-diagnostic.log');
    await rotateLogsIfNeeded(logDir, primaryFile);

    const logLine = JSON.stringify({
      timestamp,
      level,
      scope,
      message: sanitizedMsg,
      metadata: sanitizedMeta,
    }) + '\n';

    await fs.appendFile(primaryFile, logLine, 'utf8');
  } catch (err) {
    // Failsafe: never crash app on diagnostic logging failure
    console.error('[DIAGNOSTIC_LOGGER_FAIL]', err);
  }
}

/**
 * Read recent sanitized diagnostic log lines for preview / debugging.
 */
export async function getRecentDiagnosticLogs(limit = 100): Promise<string[]> {
  try {
    const { logs: logDir } = getStoragePaths();
    const primaryFile = path.join(logDir, 'hedes-diagnostic.log');
    const content = await fs.readFile(primaryFile, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Return preview data for user-triggered export with secret redaction verified.
 */
export async function getSanitizedLogExportPreview(): Promise<{
  lines: string[];
  totalSizeBytes: number;
  fileCount: number;
}> {
  const { logs: logDir } = getStoragePaths();
  let totalSize = 0;
  let fileCount = 0;
  const collectedLines: string[] = [];

  try {
    const files = await fs.readdir(logDir);
    const logFiles = files.filter((f) => f.startsWith('hedes-diagnostic') && f.endsWith('.log'));
    fileCount = logFiles.length;

    for (const file of logFiles) {
      const fullPath = path.join(logDir, file);
      const stat = await fs.stat(fullPath);
      totalSize += stat.size;
      const content = await fs.readFile(fullPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        // Redact any stray secret on export
        collectedLines.push(String(sanitizeLogData(line)));
      }
    }
  } catch {
    // No logs yet
  }

  return {
    lines: collectedLines.slice(-300), // Return last 300 lines for the preview
    totalSizeBytes: totalSize,
    fileCount,
  };
}

/**
 * Generate a complete diagnostic health report for the local diagnostics view.
 */
export async function getSystemDiagnosticReport(): Promise<DiagnosticReport> {
  const paths = getStoragePaths();
  const mem = process.memoryUsage();

  return {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    runtime: {
      mode: getRuntimeMode(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        externalMb: Math.round(mem.external / 1024 / 1024),
      },
      capabilities: getRuntimeCapabilities(),
    },
    storage: {
      userData: sanitizeErrorMessage(paths.userData),
      projects: sanitizeErrorMessage(paths.projects),
      logs: sanitizeErrorMessage(paths.logs),
    },
    indexing: {
      status: 'ready',
      totalFilesIndexed: 0,
    },
    terminal: {
      status: 'ready',
      activeSessions: 0,
    },
    preview: {
      status: 'stopped',
    },
    providers: {
      configuredCount: 0,
      providers: [
        { id: 'anthropic', name: 'Anthropic Claude', configured: false },
        { id: 'openai', name: 'OpenAI GPT', configured: false },
        { id: 'google', name: 'Google Gemini', configured: false },
        { id: 'groq', name: 'Groq Cloud', configured: false },
        { id: 'mistral', name: 'Mistral AI', configured: false },
        { id: 'ollama', name: 'Ollama (Local)', configured: false },
        { id: 'openrouter', name: 'OpenRouter', configured: false },
        { id: 'together', name: 'Together AI', configured: false },
        { id: 'deepseek', name: 'DeepSeek', configured: false },
      ],
    },
    recentErrors: [...recentErrorsRingBuffer],
  };
}
