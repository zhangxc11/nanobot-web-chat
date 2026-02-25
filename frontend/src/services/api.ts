// API service layer — talks to gateway.py (port 8081 via Vite proxy)

import type { Session, Message } from '@/types';

const API_BASE = '/api';

// ── Sessions ──

export async function fetchSessions(): Promise<{ sessions: Session[] }> {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  return res.json();
}

export async function createSession(): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return res.json();
}

export async function renameSession(sessionId: string, summary: string): Promise<{ id: string; summary: string }> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary }),
  });
  if (!res.ok) throw new Error(`Failed to rename session: ${res.status}`);
  return res.json();
}

// ── Messages ──

export async function fetchMessages(
  sessionId: string,
  limit = 30,
  before?: string
): Promise<{ messages: Message[]; hasMore: boolean }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages?${params}`
  );
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
  return res.json();
}

export async function sendMessage(
  sessionId: string,
  message: string
): Promise<{ reply: string }> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }
  );
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
  return res.json();
}

// ── SSE Streaming ──

export interface StreamCallbacks {
  onProgress: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * Send a message and receive SSE progress events in real-time.
 * Returns an AbortController so the caller can cancel the request.
 */
export function sendMessageStream(
  sessionId: string,
  message: string,
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        callbacks.onError(`HTTP ${res.status}`);
        return;
      }

      const contentType = res.headers.get('Content-Type') || '';

      // SSE stream
      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';  // keep incomplete event in buffer

          for (const part of parts) {
            const lines = part.split('\n');
            let eventType = '';
            let eventData = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7);
              } else if (line.startsWith('data: ')) {
                eventData = line.slice(6);
              }
            }

            if (!eventType || !eventData) continue;

            try {
              const parsed = JSON.parse(eventData);
              switch (eventType) {
                case 'progress':
                  callbacks.onProgress(parsed.text || '');
                  break;
                case 'done':
                  callbacks.onDone();
                  return;
                case 'error':
                  callbacks.onError(parsed.message || '未知错误');
                  return;
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }

        // Stream ended without explicit done event
        callbacks.onDone();
      } else {
        // Fallback: legacy JSON response
        const data = await res.json();
        if (data.reply) {
          callbacks.onDone();
        } else {
          callbacks.onError('Unexpected response format');
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;  // Cancelled by user, not an error
      }
      callbacks.onError(err instanceof Error ? err.message : '网络错误');
    }
  })();

  return controller;
}
