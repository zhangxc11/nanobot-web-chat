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

// ── Task Status (graceful degradation) ──

export interface TaskStatus {
  status: 'running' | 'done' | 'error' | 'unknown';
  pid?: number;
  started_at?: string;
  finished_at?: string;
  progress_count?: number;
  error?: string;
  message?: string;
}

export async function fetchTaskStatus(sessionId: string): Promise<TaskStatus> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/task-status`);
  if (!res.ok) return { status: 'unknown', message: `HTTP ${res.status}` };
  return res.json();
}

// ── Task Kill ──

export async function killTask(sessionId: string): Promise<{ status: string; message?: string }> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/task-kill`, {
    method: 'POST',
  });
  if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
  return res.json();
}

// ── Task Attach (SSE) ──

/**
 * Attach to a running task's SSE stream (for recovering after page refresh).
 * Reuses the same StreamCallbacks interface as sendMessageStream.
 */
export function attachTask(
  sessionId: string,
  callbacks: StreamCallbacks,
): AbortController {
  // We reuse sendMessageStream's SSE parsing by connecting to task-status
  // But actually, we need a dedicated attach endpoint.
  // For now, use the same execute-stream endpoint which auto-attaches to existing tasks.
  // The worker's execute-stream already handles "task already running → attach" case.
  // We just need to send a dummy message that won't start a new task.
  // 
  // Actually, the simplest approach: poll task-status until done.
  // This avoids needing a new SSE endpoint.
  const controller = new AbortController();

  (async () => {
    try {
      while (!controller.signal.aborted) {
        const status = await fetchTaskStatus(sessionId);
        
        if (status.status === 'done') {
          callbacks.onDone();
          return;
        }
        if (status.status === 'error') {
          callbacks.onError(status.error || status.message || 'Task failed');
          return;
        }
        if (status.status === 'unknown') {
          // Task not found — might have already completed and been cleaned up
          callbacks.onDone();
          return;
        }
        
        // Still running — report progress
        if (status.progress_count) {
          callbacks.onProgress(`⏳ 任务执行中... (${status.progress_count} 步)`);
        }
        
        // Wait before next poll
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      callbacks.onError(err instanceof Error ? err.message : '网络错误');
    }
  })();

  return controller;
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
        let receivedDoneOrError = false;

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
                  receivedDoneOrError = true;
                  callbacks.onDone();
                  return;
                case 'error':
                  receivedDoneOrError = true;
                  callbacks.onError(parsed.message || '未知错误');
                  return;
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }

        // Stream ended — check if we received an explicit done/error event.
        // If not, the connection was likely interrupted (e.g. gateway restart)
        // and the task may still be running in the worker background.
        if (!receivedDoneOrError) {
          callbacks.onError('SSE connection reset — task may still be running');
        }
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
