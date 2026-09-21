import { createReadableStreamFromReadable } from '@remix-run/node';
import type { ServerBuild } from '@remix-run/node';
import mime from 'mime';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import { isDev } from './constants';

export async function loadServerBuild(): Promise<any> {
  if (isDev) {
    console.log('Dev mode: server build not loaded');
    return;
  }

  // Ensure browser globals expected by UMD packages (e.g. @xterm/addon-fit) exist in Node
  if (typeof (globalThis as any).self === 'undefined') {
    (globalThis as any).self = globalThis;
  }
  if (typeof (globalThis as any).window === 'undefined') {
    (globalThis as any).window = globalThis;
  }

  const appPath = app.getAppPath();
  const unpackedPath = appPath.replace(/app\.asar$/, 'app.asar.unpacked');

  // Build a list of candidate paths to try, in priority order
  const candidates: string[] = [];

  // 1. Unpacked server index.mjs & index.js (preferred - outside ASAR)
  candidates.push(path.join(unpackedPath, 'build', 'server', 'index.mjs'));
  candidates.push(path.join(unpackedPath, 'build', 'server', 'index.js'));

  // 2. ASAR server index.mjs & index.js (fallback)
  candidates.push(path.join(appPath, 'build', 'server', 'index.mjs'));
  candidates.push(path.join(appPath, 'build', 'server', 'index.js'));

  // 3. Scan unpacked assets directory for the actual server-build chunk
  try {
    const assetsDir = path.join(unpackedPath, 'build', 'server', 'assets');
    const files = await fs.readdir(assetsDir);
    const serverBuildChunk = files.find((f: string) => f.startsWith('server-build') && f.endsWith('.js'));
    if (serverBuildChunk) {
      candidates.push(path.join(assetsDir, serverBuildChunk));
    }
  } catch {
    // assets dir doesn't exist in unpacked, try ASAR
  }

  // 4. Scan ASAR assets directory for the actual server-build chunk
  try {
    const assetsDir = path.join(appPath, 'build', 'server', 'assets');
    const files = await fs.readdir(assetsDir);
    const serverBuildChunk = files.find((f: string) => f.startsWith('server-build') && f.endsWith('.js'));
    if (serverBuildChunk) {
      candidates.push(path.join(assetsDir, serverBuildChunk));
    }
  } catch {
    // ignore
  }

  for (const candidatePath of candidates) {
    try {
      // Check file exists
      await fs.stat(candidatePath);
    } catch {
      console.log(`Server build candidate not found: ${candidatePath}`);
      continue;
    }

    console.log(`Trying server build at: ${candidatePath}`);

    try {
      const fileUrl = pathToFileURL(candidatePath).href;
      const serverBuild = await import(fileUrl);

      // Validate the module actually has routes
      if (serverBuild && (serverBuild.routes || serverBuild.default?.routes)) {
        const resolved = serverBuild.routes ? serverBuild : serverBuild.default;
        console.log('Server build loaded successfully from:', candidatePath);
        console.log('Server build keys:', Object.keys(resolved));
        return resolved;
      }

      console.log(`Server build at ${candidatePath} loaded but has no routes. Keys:`, Object.keys(serverBuild));
    } catch (buildError) {
      console.log(`Failed to load server build from ${candidatePath}:`, {
        message: (buildError as Error)?.message,
        stack: (buildError as Error)?.stack,
      });
    }
  }

  console.error('CRITICAL: No valid server build found from any candidate path!');
  console.error('Tried:', candidates);
  return;
}

// serve assets built by vite.
export async function serveAsset(req: Request, assetsPath: string): Promise<Response | undefined> {
  const url = new URL(req.url);
  const fullPath = path.join(assetsPath, decodeURIComponent(url.pathname));
  console.log('Serving asset, path:', fullPath);

  if (!fullPath.startsWith(assetsPath)) {
    console.log('Path is outside assets directory:', fullPath);
    return;
  }

  const stat = await fs.stat(fullPath).catch((err) => {
    console.log('Failed to stat file:', fullPath, err);
    return undefined;
  });

  if (!stat?.isFile()) {
    console.log('Not a file:', fullPath);
    return;
  }

  const headers = new Headers();
  const mimeType = mime.getType(fullPath);

  if (mimeType) {
    headers.set('Content-Type', mimeType);
  }

  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  console.log('Serving file with mime type:', mimeType);

  const body = createReadableStreamFromReadable(createReadStream(fullPath));

  // eslint-disable-next-line consistent-return
  return new Response(body, { headers });
}
