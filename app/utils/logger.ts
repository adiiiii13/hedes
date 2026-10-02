export function createScopedLogger(scope: string) {
  return {
    debug: (...args: any[]) => console.debug(`[${scope}]`, ...args),
    info: (...args: any[]) => console.info(`[${scope}]`, ...args),
    warn: (...args: any[]) => console.warn(`[${scope}]`, ...args),
    error: (...args: any[]) => {
      console.error(`[${scope}]`, ...args);
      // Client-side error telemetry can be sent via fetch if needed
      if (typeof window !== 'undefined' && window.location) {
        try {
          const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
          // Non-blocking report to server diagnostics endpoint
          fetch('/api/local/diagnostics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'log_client_error', scope, message: msg }),
          }).catch(() => {});
        } catch {}
      }
    },
  };
}
