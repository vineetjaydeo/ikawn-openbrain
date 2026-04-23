import type { Design, DesignSnapshot, ChatMessageRow } from './types';

const BASE = '';

async function json<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// Designs
export const listDesigns = () => json<Design[]>('/api/designs');
export const createDesign = (name?: string) => json<Design>('/api/designs', { method: 'POST', body: JSON.stringify({ name }) });
export const renameDesign = (id: string, name: string) => json<Design>(`/api/designs/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
export const deleteDesign = (id: string) => json<Design>(`/api/designs/${id}`, { method: 'DELETE' });
export const duplicateDesign = (id: string, name: string) => json<Design>(`/api/designs/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ name }) });

// Snapshots
export const listSnapshots = (designId: string) => json<DesignSnapshot[]>(`/api/designs/${designId}/snapshots`);
export const createSnapshot = (designId: string, data: Partial<DesignSnapshot>) =>
  json<DesignSnapshot>(`/api/designs/${designId}/snapshots`, { method: 'POST', body: JSON.stringify(data) });

// Chat
export const listChat = (designId: string) => json<ChatMessageRow[]>(`/api/designs/${designId}/chat`);
export const appendChat = (designId: string, kind: string, payload: unknown, snapshotId?: string) =>
  json<ChatMessageRow>(`/api/designs/${designId}/chat`, { method: 'POST', body: JSON.stringify({ kind, payload, snapshot_id: snapshotId }) });

// Generation (SSE via POST + ReadableStream)
export function streamGeneration(
  params: { designId: string; prompt: string; history?: Array<{ role: string; content: string }>; model?: string },
  onEvent: (event: Record<string, unknown>) => void,
  onError?: (err: Error) => void,
  onDone?: () => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch('/api/design/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Generation failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              onEvent(parsed);
            } catch { /* ignore parse errors */ }
          }
        }
      }
      onDone?.();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onError?.(err as Error);
      }
    }
  })();

  return () => controller.abort();
}
