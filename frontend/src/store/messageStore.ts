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
  loadMessages: (sessionId: string) => Promise<void>;
  loadMoreMessages: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, content: string) => Promise<void>;
  clearMessages: () => void;
}

const PAGE_SIZE = 30;

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: [],
  hasMore: false,
  loading: false,
  sending: false,
  error: null,
  progressSteps: [],

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

      // Task completed — reload messages from JSONL for accurate display
      // (includes tool calls, proper message IDs, etc.)
      const data = await api.fetchMessages(sessionId, PAGE_SIZE);
      set({
        messages: data.messages || [],
        hasMore: data.hasMore ?? false,
        sending: false,
        progressSteps: [],
      });

      // Refresh session list to update ordering and summary
      useSessionStore.getState().fetchSessions();
    } catch (err) {
      set({ sending: false, progressSteps: [], error: String(err) });
    }
  },

  clearMessages: () => {
    set({ messages: [], hasMore: false, error: null, progressSteps: [] });
  },
}));
