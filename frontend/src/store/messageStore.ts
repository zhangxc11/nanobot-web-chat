// Message state store — v17 (task binding + kill + recovery)
import { create } from 'zustand';
import type { Message } from '../types';
import * as api from '../services/api';
import { useSessionStore } from './sessionStore';

// Build version marker for cache busting
const _BUILD_VERSION = '17.0';
console.debug('[messageStore] version:', _BUILD_VERSION);

interface MessageStore {
  messages: Message[];
  hasMore: boolean;
  loading: boolean;
  sending: boolean;
  sendingSessionId: string | null;   // which session owns the running task
  error: string | null;
  progressSteps: string[];           // real-time progress steps from SSE
  recovering: boolean;               // polling task status after SSE disconnect
  abortController: AbortController | null;  // for cancelling SSE fetch
  draftBySession: Record<string, string>;   // per-session input draft text
  loadMessages: (sessionId: string) => Promise<void>;
  loadMoreMessages: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, content: string) => Promise<void>;
  cancelTask: () => Promise<void>;
  checkRunningTask: (sessionId: string) => Promise<void>;
  clearMessages: () => void;
  setDraft: (sessionId: string, text: string) => void;
  getDraft: (sessionId: string) => string;
}

const PAGE_SIZE = 30;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 100;  // 5 minutes max

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: [],
  hasMore: false,
  loading: false,
  sending: false,
  sendingSessionId: null,
  error: null,
  progressSteps: [],
  recovering: false,
  abortController: null,
  draftBySession: {},

  loadMessages: async (sessionId) => {
    set({ loading: true, error: null, messages: [], hasMore: false });
    try {
      const data = await api.fetchMessages(sessionId, PAGE_SIZE);
      set({
        messages: data.messages || [],
        hasMore: data.hasMore ?? false,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  loadMoreMessages: async (sessionId) => {
    const { messages, hasMore, loading } = get();
    if (!hasMore || loading) return;
    set({ loading: true });
    try {
      const earliest = messages[0]?.timestamp;
      const data = await api.fetchMessages(sessionId, PAGE_SIZE, earliest);
      set((s) => ({
        messages: [...(data.messages || []), ...s.messages],
        hasMore: data.hasMore ?? false,
        loading: false,
      }));
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  sendMessage: async (sessionId, content) => {
    // Prevent sending if another task is running
    const { sending } = get();
    if (sending) return;

    // Optimistic update: add user message
    const userMsg: Message = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({
      messages: [...s.messages, userMsg],
      sending: true,
      sendingSessionId: sessionId,
      error: null,
      progressSteps: [],
      recovering: false,
      abortController: null,
    }));

    try {
      await new Promise<void>((resolve, reject) => {
        const controller = api.sendMessageStream(sessionId, content, {
          onProgress: (text) => {
            set((s) => ({
              progressSteps: [...s.progressSteps, text],
            }));
          },
          onDone: () => resolve(),
          onError: (msg) => reject(new Error(msg)),
        });
        set({ abortController: controller });
      });

      // Task completed normally via SSE — reload messages from JSONL
      await _reloadMessages(sessionId, set);
    } catch (err) {
      // Check if this was a user-initiated cancel
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled — just reset state, don't show error
        set({
          sending: false,
          sendingSessionId: null,
          progressSteps: [],
          recovering: false,
          abortController: null,
        });
        return;
      }

      // SSE stream broke — try graceful recovery via polling
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`SSE error: ${errorMsg}, attempting recovery...`);

      // Check if this looks like a connection error (not a business error)
      const isConnectionError = /fetch|network|abort|reset|refused/i.test(errorMsg);

      if (isConnectionError) {
        set({ recovering: true, error: null, abortController: null });
        const recovered = await _pollTaskStatus(sessionId, set);
        if (recovered) {
          await _reloadMessages(sessionId, set);
        } else {
          set({
            sending: false,
            sendingSessionId: null,
            recovering: false,
            progressSteps: [],
            abortController: null,
            error: `⚠️ ${errorMsg}（任务可能仍在后台执行，请稍后刷新页面查看结果）`,
          });
        }
      } else {
        // Business error (e.g. nanobot returned error)
        set({
          sending: false,
          sendingSessionId: null,
          progressSteps: [],
          abortController: null,
          error: `⚠️ ${errorMsg}`,
        });
      }
    }
  },

  cancelTask: async () => {
    const { abortController, sendingSessionId } = get();

    // Abort the SSE fetch connection
    if (abortController) {
      abortController.abort();
    }

    // Kill the backend task
    if (sendingSessionId) {
      try {
        await api.killTask(sendingSessionId);
      } catch (err) {
        console.warn('Failed to kill backend task:', err);
      }
    }

    set({
      sending: false,
      sendingSessionId: null,
      progressSteps: [],
      recovering: false,
      abortController: null,
      error: null,
    });

    // Reload messages to show whatever was saved before kill
    if (sendingSessionId) {
      const activeSessionId = useSessionStore.getState().activeSessionId;
      if (activeSessionId === sendingSessionId) {
        try {
          const data = await api.fetchMessages(sendingSessionId, PAGE_SIZE);
          set({
            messages: data.messages || [],
            hasMore: data.hasMore ?? false,
          });
        } catch {
          // Ignore reload errors after cancel
        }
      }
    }
  },

  checkRunningTask: async (sessionId) => {
    const { sending, sendingSessionId } = get();

    // If sending is stuck for a DIFFERENT session, verify it's still running
    if (sending && sendingSessionId && sendingSessionId !== sessionId) {
      try {
        const otherStatus = await api.fetchTaskStatus(sendingSessionId);
        if (otherStatus.status !== 'running') {
          console.log(`Stale sending state for ${sendingSessionId} (status: ${otherStatus.status}), clearing`);
          set({
            sending: false,
            sendingSessionId: null,
            progressSteps: [],
            recovering: false,
            abortController: null,
          });
          // Reload messages for the stale session if it completed
          // (we don't switch to it, just clear the lock)
        }
      } catch {
        // Can't reach worker — clear stale state to unblock UI
        console.warn('Cannot verify stale sending state, clearing');
        set({
          sending: false,
          sendingSessionId: null,
          progressSteps: [],
          recovering: false,
          abortController: null,
        });
      }
    }

    try {
      const status = await api.fetchTaskStatus(sessionId);
      if (status.status !== 'running') return;

      // There's a running task for this session — recover state
      // Restore full progress history from backend
      const restoredSteps = status.progress || [];
      set({
        sending: true,
        sendingSessionId: sessionId,
        progressSteps: restoredSteps,
        recovering: false,
        error: null,
      });

      // Attach to the running task via polling
      await new Promise<void>((resolve, reject) => {
        const controller = api.attachTask(sessionId, {
          onProgress: (text) => {
            set((s) => ({
              progressSteps: [...s.progressSteps, text],
            }));
          },
          onDone: () => resolve(),
          onError: (msg) => reject(new Error(msg)),
        });
        set({ abortController: controller });
      });

      // Task completed — reload messages
      await _reloadMessages(sessionId, set);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isConnectionError = /fetch|network|abort|reset|refused/i.test(errorMsg);

      if (isConnectionError && get().sending) {
        // Connection broke during attach — poll for recovery
        set({ recovering: true, abortController: null });
        const recovered = await _pollTaskStatus(sessionId, set);
        if (recovered) {
          await _reloadMessages(sessionId, set);
        } else {
          set({
            sending: false,
            sendingSessionId: null,
            recovering: false,
            progressSteps: [],
            abortController: null,
          });
        }
      } else if (get().sending) {
        // Non-connection error — task might have ended
        set({
          sending: false,
          sendingSessionId: null,
          progressSteps: [],
          recovering: false,
          abortController: null,
        });
      }
    }
  },

  clearMessages: () => {
    set({ messages: [], hasMore: false, error: null });
    // NOTE: do NOT clear sending/sendingSessionId/progressSteps here
    // because the task might still be running for another session
  },

  setDraft: (sessionId, text) => {
    set((s) => ({
      draftBySession: { ...s.draftBySession, [sessionId]: text },
    }));
  },

  getDraft: (sessionId) => {
    return get().draftBySession[sessionId] || '';
  },
}));


/**
 * Poll task status until done/error or timeout.
 * Returns true if task completed successfully.
 */
async function _pollTaskStatus(
  sessionId: string,
  set: (fn: (s: MessageStore) => Partial<MessageStore>) => void,
): Promise<boolean> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const status = await api.fetchTaskStatus(sessionId);

      if (status.status === 'done') {
        console.log('Task recovered: done');
        return true;
      }
      if (status.status === 'error') {
        set(() => ({
          sending: false,
          sendingSessionId: null,
          recovering: false,
          abortController: null,
          error: `⚠️ 后台任务失败: ${status.error || '未知错误'}`,
        }));
        return false;
      }
      if (status.status === 'unknown') {
        // Worker doesn't know about this task — might have restarted too
        if (i > 5) {
          set(() => ({
            sending: false,
            sendingSessionId: null,
            recovering: false,
            abortController: null,
            error: '⚠️ 无法恢复任务状态，请刷新页面查看结果',
          }));
          return false;
        }
      }
      // status === 'running' — keep polling
      if (status.progress_count) {
        set(() => ({
          progressSteps: [`⏳ 任务后台执行中... (${status.progress_count} 步)`],
        }));
      }
    } catch {
      // Gateway still down — keep trying
      console.warn(`Poll attempt ${i + 1} failed, retrying...`);
    }
  }

  // Timeout
  set(() => ({
    sending: false,
    sendingSessionId: null,
    recovering: false,
    abortController: null,
    error: '⚠️ 轮询超时，请刷新页面查看结果',
  }));
  return false;
}

/**
 * Reload messages from JSONL and reset sending state.
 */
async function _reloadMessages(
  sessionId: string,
  set: (fn: (s: MessageStore) => Partial<MessageStore>) => void,
) {
  try {
    const data = await api.fetchMessages(sessionId, PAGE_SIZE);
    set(() => ({
      messages: data.messages || [],
      hasMore: data.hasMore ?? false,
      sending: false,
      sendingSessionId: null,
      progressSteps: [],
      recovering: false,
      abortController: null,
    }));
    // Refresh session list
    useSessionStore.getState().fetchSessions();
  } catch {
    set(() => ({
      sending: false,
      sendingSessionId: null,
      recovering: false,
      abortController: null,
      error: '⚠️ 消息重载失败，请刷新页面',
    }));
  }
}
