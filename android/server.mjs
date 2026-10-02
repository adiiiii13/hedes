#!/usr/bin/env node
/**
 * HEDES Studio — Android Termux Standalone Server
 * Runs strictly on 127.0.0.1 loopback interface.
 * Zero Electron dependencies.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';

const PORT = parseInt(process.env.PORT || '5173', 10);
const HOST = '127.0.0.1'; // Strictly loopback

// Data directories for Termux
const HOME_DIR = process.env.HOME || os.homedir();
const DATA_ROOT = path.join(HOME_DIR, '.local', 'share', 'hedes-studio');
const PROJECTS_DIR = path.join(DATA_ROOT, 'projects');
const SESSIONS_DIR = path.join(DATA_ROOT, 'sessions');

fs.mkdirSync(PROJECTS_DIR, { recursive: true });
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Per-startup session token
const SESSION_TOKEN = crypto.randomBytes(32).toString('hex');
process.env.HEDES_SESSION_TOKEN = SESSION_TOKEN;
process.env.HEDES_RUNTIME = 'android-termux';
process.env.HEDES_USER_DATA_DIR = DATA_ROOT;
process.env.HEDES_PROJECTS_DIR = PROJECTS_DIR;

console.log('---------------------------------------------------------');
console.log('   HEDES STUDIO — ANDROID LOCAL TERMUX BACKEND');
console.log('---------------------------------------------------------');
console.log(`[Runtime] Mode: android-termux`);
console.log(`[Storage] Root: ${DATA_ROOT}`);
console.log(`[Projects] Path: ${PROJECTS_DIR}`);
console.log(`[Network] Listening: http://${HOST}:${PORT}`);
console.log(`[Auth] Session initialized. Loopback protection active.`);
console.log('---------------------------------------------------------');
console.log(`\nOpen Chrome or Firefox on your phone and navigate to:`);
console.log(`  http://localhost:${PORT}\n`);

// Static asset MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const CLIENT_ROOT = path.resolve('./build/client');

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const pathname = parsedUrl.pathname;

  // Enforce loopback check
  const hostHeader = req.headers.host || '';
  if (!hostHeader.startsWith('localhost') && !hostHeader.startsWith('127.0.0.1')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access denied: Hedes Studio only accepts local loopback connections.');
    return;
  }

  // Security headers
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', `http://localhost:${PORT}`);

  // Bootstrap session auth endpoint
  if (pathname === '/api/local/auth/bootstrap') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sessionToken: SESSION_TOKEN, runtime: 'android-termux' }));
    return;
  }

  // Local PTY terminal execution endpoint
  if (pathname === '/api/local/termux/exec' && req.method === 'POST') {
    const token = req.headers['x-hedes-session-token'];
    if (token !== SESSION_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized local request' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { command, cwd } = JSON.parse(body || '{}');
        const workingDir = cwd && fs.existsSync(cwd) ? cwd : PROJECTS_DIR;
        const ptyScript = path.resolve('./android/termux-pty.py');

        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        const child = fs.existsSync(ptyScript)
          ? spawn('python3', [ptyScript], { cwd: workingDir, env: { ...process.env, TERM: 'xterm-256color' } })
          : spawn('bash', ['-c', command || 'bash'], { cwd: workingDir, env: process.env });

        if (command) {
          child.stdin.write(command + '\n');
        }

        child.stdout.on('data', (chunk) => {
          res.write(JSON.stringify({ type: 'stdout', data: chunk.toString() }) + '\n');
        });

        child.stderr.on('data', (chunk) => {
          res.write(JSON.stringify({ type: 'stderr', data: chunk.toString() }) + '\n');
        });

        child.on('close', (code) => {
          res.write(JSON.stringify({ type: 'exit', data: String(code ?? 0) }) + '\n');
          res.end();
        });
      } catch (err) {
        res.write(JSON.stringify({ type: 'error', data: err.message }) + '\n');
        res.end();
      }
    });
    return;
  }

  // Serve static files from build/client
  let filePath = path.join(CLIENT_ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(CLIENT_ROOT, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><head><title>Hedes Studio (Termux)</title></head><body style="background:#0b0d14;color:#eee;font-family:sans-serif;padding:2rem;">
      <h1>Hedes Studio — Android Local Backend</h1>
      <p>Termux loopback backend is running on <code>http://127.0.0.1:${PORT}</code>.</p>
      <p>Build client assets with <code>npm run build</code> to view the full interface.</p>
    </body></html>`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server actively listening on http://${HOST}:${PORT}`);
});
