export async function readNdjson<T>(response: Response, onEvent: (event: T) => void): Promise<void> {
  if (!response.ok || !response.body) throw new Error(await response.text() || `Request failed (${response.status})`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  while (true) {
    const { done, value } = await reader.read();
    pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as T);
    if (done) {
      if (pending.trim()) onEvent(JSON.parse(pending) as T);
      break;
    }
  }
}
