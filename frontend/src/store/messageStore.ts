// Message state store
import { create } from 'zustand';
import type { Message } from '../types';
import * as api from '../services/api';
import { useSessionStore } from './sessionStore';

interface MessageStore {
  messages: Message[];
  hasMore: boolean;
  loading: boolean;
  sending: boolean;
  error: string | null;
  progressSteps: string[];    // real-time progress steps from SSE
  recovering: boolean;        // polling task status after SSE disconnect
  loadMessages: (sessionId: string) => Promise<void>;
  loadMoreMessages: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, content: string) => Promise<void>;
  clearMessages: () => void;
}

const PAGE_SIZE = 30;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 100;  // 5 minutes max

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: [],
  hasMore: false,
  loading: false,
  sending: false,
  error: null,
  progressSteps: [],
  recovering: false,

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
      error: null,
      progressSteps: [],
      recovering: false,
    }));

    try {
      await new Promise<void>((resolve, reject) => {
        api.sendMessageStream(sessionId, content, {
          onProgress: (text) => {
            set((s) => ({
              progressSteps: [...s.progressSteps, text],
            }));
          },
          onDone: () => resolve(),
          onError: (msg) => reject(new Error(msg)),
        });
      });

      // Task completed normally via SSE — reload messages from JSONL
      await _reloadMessages(sessionId, set);
    } catch (err) {
      // SSE stream broke — try graceful recovery via polling
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`SSE error: ${errorMsg}, attempting recovery...`);

      // Check if this looks like a connection error (not a business error)
      const isConnectionError = /fetch|network|abort|reset|refused/i.test(errorMsg);

      if (isConnectionError) {
        set({ recovering: true, error: null });
        const recovered = await _pollTaskStatus(sessionId, set);
        if (recovered) {
          await _reloadMessages(sessionId, set);
        } else {
          set({
            sending: false,
            recovering: false,
            progressSteps: [],
            error: `⚠️ ${errorMsg}（任务可能仍在后台执行，请稍后刷新页面查看结果）`,
          });
        }
      } else {
        // Business error (e.g. nanobot returned error)
        set({ sending: false, progressSteps: [], error: `⚠️ ${errorMsg}` });
      }
    }
  },

  clearMessages: () => {
    set({ messages: [], hasMore: false, error: null, progressSteps: [], recovering: false });
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
          recovering: false,
          error: `⚠️ 后台任务失败: ${status.error || '未知错误'}`,
        }));
        return false;
      }
      if (status.status === 'unknown') {
        // Worker doesn't know about this task — might have restarted too
        // Give it a few more tries
        if (i > 5) {
          set(() => ({
            sending: false,
            recovering: false,
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
    recovering: false,
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
      progressSteps: [],
      recovering: false,
    }));
    // Refresh session list
    useSessionStore.getState().fetchSessions();
  } catch {
    set(() => ({
      sending: false,
      recovering: false,
      error: '⚠️ 消息重载失败，请刷新页面',
    }));
  }
}
