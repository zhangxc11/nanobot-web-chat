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
    set((s) => ({ messages: [...s.messages, userMsg], sending: true, error: null }));

    try {
      const data = await api.sendMessage(sessionId, content);
      const assistantMsg: Message = {
        id: `reply_${Date.now()}`,
        role: 'assistant',
        content: data.reply || '',
        timestamp: new Date().toISOString(),
      };
      set((s) => ({ messages: [...s.messages, assistantMsg], sending: false }));
      // Refresh session list to update ordering and summary
      useSessionStore.getState().fetchSessions();
    } catch (err) {
      set({ sending: false, error: String(err) });
    }
  },

  clearMessages: () => {
    set({ messages: [], hasMore: false, error: null });
  },
}));
