import crypto from 'node:crypto';

declare global {
  // eslint-disable-next-line no-var
  var __hedesSessionToken: string | undefined;
}

export function getServerSessionToken(): string {
  if (!globalThis.__hedesSessionToken) {
    const inherited = globalThis.process.env.HEDES_SESSION_TOKEN;
    globalThis.__hedesSessionToken = inherited && /^[a-f0-9]{64}$/i.test(inherited)
      ? inherited : crypto.randomBytes(32).toString('hex');
    // Also share with environment for main process / child worker alignment
    globalThis.process.env.HEDES_SESSION_TOKEN = globalThis.__hedesSessionToken;
  }
  return globalThis.__hedesSessionToken;
}

export function verifyLocalSessionRequest(request: Request): Response | null {
  try {
    const url = new URL(request.url);
    // Remix dev reconstructs request.url using Origin. The network Host remains authoritative.
    const hostHeader = request.headers.get('Host');
    const networkOrigin = hostHeader ? new URL(`${url.protocol}//${hostHeader}`).origin : url.origin;
    const networkHostname = new URL(networkOrigin).hostname;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(networkHostname)) {
      return new Response(JSON.stringify({ error: 'Local APIs require a loopback host' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const origin = request.headers.get('Origin');
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.origin !== networkOrigin) {
          return new Response(JSON.stringify({ error: 'Cross-origin local API requests are not allowed' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid Origin header' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const secFetchSite = request.headers.get('Sec-Fetch-Site');
    if (secFetchSite === 'cross-site') {
      return new Response(JSON.stringify({ error: 'Cross-site local API requests are rejected' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tokenHeader =
      request.headers.get('X-Hedes-Session-Token') ||
      request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');

    const expected = getServerSessionToken();
    if (!tokenHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing local session token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tokenBuf = Buffer.from(tokenHeader);
    const expectedBuf = Buffer.from(expected);
    if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
      return new Response(JSON.stringify({ error: 'Unauthorized: invalid local session token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return null;
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to authenticate local request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Internal server error');
  return raw
    .replace(/[a-zA-Z]:\\[^"'\n\r\t<>]+/g, '[path]')
    .replace(/(?:\/[a-zA-Z0-9._-]+){3,}/g, '[path]');
}
