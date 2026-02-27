// API service layer — talks to webserver.py (port 8081 via Vite proxy)

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

export async function deleteSession(sessionId: string): Promise<{ id: string; deleted: boolean }> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`);
  return res.json();
}

// ── Session Search ──

export interface SearchResult {
  id: string;
  summary: string;
  filename: string;
  titleMatch: boolean;
  matches: string[];
}

export async function searchSessions(query: string): Promise<SearchResult[]> {
  const res = await fetch(`${API_BASE}/sessions/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Failed to search sessions: ${res.status}`);
  const data = await res.json();
  return data.results;
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
  progress?: string[];  // full progress history
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

// ── Task Inject (user message injection during execution) ──

export async function injectMessage(sessionId: string, message: string): Promise<{ status: string; message?: string }> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/task-inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ status: 'error', message: `HTTP ${res.status}` }));
    return data;
  }
  return res.json();
}

// ── Task Attach (SSE) ──

export interface AttachCallbacks {
  /** Called with the FULL progress list each poll (replaces, not appends) */
  onProgressSync: (steps: string[]) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * Attach to a running task by polling task-status until completion.
 * Uses onProgressSync to deliver the full progress list each poll,
 * so the caller can replace (not append) the displayed steps.
 */
export function attachTask(
  sessionId: string,
  callbacks: AttachCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      while (!controller.signal.aborted) {
        const status = await fetchTaskStatus(sessionId);
        
        if (status.status === 'done') {
          // Final sync of progress before done
          if (status.progress && status.progress.length > 0) {
            callbacks.onProgressSync(status.progress);
          }
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
        
        // Still running — sync full progress list
        if (status.progress && status.progress.length > 0) {
          callbacks.onProgressSync(status.progress);
        } else if (status.progress_count) {
          // Fallback: webserver restarted, no full progress available
          callbacks.onProgressSync([`⏳ 任务后台执行中... (${status.progress_count} 步)`]);
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

// ── Usage Statistics ──

export interface UsageByModel {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  llm_calls: number;
}

export interface UsageBySession {
  session_id: string;
  summary: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  llm_calls: number;
  last_used: string;
  deleted?: boolean;
}

export interface UsageStats {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_llm_calls: number;
  by_model: Record<string, UsageByModel>;
  by_session: UsageBySession[];
}

export interface SessionUsage {
  session_key: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  llm_calls: number;
  records: Array<{
    id: number;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    llm_calls: number;
    started_at: string;
    finished_at: string;
  }>;
}

export interface DailyUsage {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  llm_calls: number;
}

export async function fetchUsage(): Promise<UsageStats> {
  const res = await fetch(`${API_BASE}/usage`);
  if (!res.ok) throw new Error(`Failed to fetch usage: ${res.status}`);
  return res.json();
}

export async function fetchSessionUsage(sessionKey: string): Promise<SessionUsage> {
  const res = await fetch(`${API_BASE}/usage?session=${encodeURIComponent(sessionKey)}`);
  if (!res.ok) throw new Error(`Failed to fetch session usage: ${res.status}`);
  return res.json();
}

export async function fetchDailyUsage(days: number = 30): Promise<DailyUsage[]> {
  const res = await fetch(`${API_BASE}/usage/daily?days=${days}`);
  if (!res.ok) throw new Error(`Failed to fetch daily usage: ${res.status}`);
  const data = await res.json();
  return data.days;
}

// ── SSE Streaming ──

export interface StreamCallbacks {
  onProgress: (step: import('@/types').ProgressStep) => void;
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
                  callbacks.onProgress({
                    text: parsed.text || '',
                    type: parsed.type,
                    name: parsed.name,
                    content: parsed.content,
                  });
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
        // If not, the connection was likely interrupted (e.g. webserver restart)
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
