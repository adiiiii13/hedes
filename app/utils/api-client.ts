import { requestActionReview } from './approval-client';
let clientSessionToken = '';
let isInterceptorInstalled = false;

export function setClientSessionToken(token: string): void {
  if (typeof token === 'string' && token) {
    clientSessionToken = token;
  }
}

export function getClientSessionToken(): string {
  return clientSessionToken;
}

export function initApiClient(initialToken?: string): void {
  if (typeof window === 'undefined' || !window.location || typeof window.fetch !== 'function') return;

  if (initialToken) {
    setClientSessionToken(initialToken);
  }

  // If in desktop electron runtime, sync token from desktop bridge
  const desktop = (window as unknown as { hedesDesktop?: { getSessionToken?: () => Promise<string> } }).hedesDesktop;
  if (desktop?.getSessionToken) {
    desktop.getSessionToken().then((token) => {
      if (token) setClientSessionToken(token);
    }).catch(() => undefined);
  }

  if (isInterceptorInstalled) return;
  isInterceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    let urlString = '';
    if (typeof input === 'string') {
      urlString = input;
    } else if (input instanceof URL) {
      urlString = input.href;
    } else if (input && typeof (input as Request).url === 'string') {
      urlString = (input as Request).url;
    }

    // Only attach session token to local app API endpoints
    // A generated project on another loopback port must never receive app credentials.
    let isAppApi = false;
    try {
      const target = new URL(urlString, window.location.href);
      isAppApi = target.origin === window.location.origin && target.pathname.startsWith('/api/');
    } catch { /* Leave malformed URLs to the native fetch implementation. */ }

    if (isAppApi) {
      const headers = new Headers(
        init.headers || (typeof input === 'object' && 'headers' in input && input.headers ? (input as Request).headers : {})
      );

      headers.set('X-Requested-With', 'HedesApp');
      const token = getClientSessionToken();
      if (token && !headers.has('X-Hedes-Session-Token')) {
        headers.set('X-Hedes-Session-Token', token);
      }

      const retryInput = input instanceof Request ? input.clone() : input;
      const response = await originalFetch(input, { ...init, headers });
      if (response.status === 428) {
        const body = await response.clone().json().catch(() => null);
        if (body?.approval) {
          if (!await requestActionReview(body.approval)) return Response.json({ error: 'Action rejected by user' }, { status: 403 });
          headers.set('X-Hedes-Approval', body.approval.id);
          const result = await originalFetch(retryInput, { ...init, headers });
          if (result.ok && body.approval.scope === 'file change') {
            const edit = await result.clone().json();
            window.dispatchEvent(new CustomEvent('hedes-edit-applied', { detail: edit }));
          }
          return result;
        }
      }
      return response;
    }

    return originalFetch(input, init);
  };
}

// Auto-run in browser environment
if (typeof window !== 'undefined') {
  initApiClient();
}

export const clientFetch: typeof fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  return window.fetch(input, init);
};
