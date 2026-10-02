export function normalizeCustomBaseUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Enter an HTTP or HTTPS API base URL without credentials or query parameters.');
  }
  let pathname = url.pathname.replace(/\/+$/, '');
  if (pathname.endsWith('/chat/completions')) pathname = pathname.slice(0, -'/chat/completions'.length);
  if (pathname.endsWith('/models')) pathname = pathname.slice(0, -'/models'.length);
  if (!pathname.endsWith('/v1')) pathname += '/v1';
  url.pathname = pathname;
  return url.toString().replace(/\/+$/, '');
}

export function extractCustomModels(payload: unknown): Array<{ id: string; label: string }> {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  return data.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'string' || !id.trim() || id.length > 300 || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label: id }];
  }).slice(0, 200);
}
