// Session state store
import { create } from 'zustand';
import type { Session } from '../types';
import * as api from '../services/api';

interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  loading: boolean;
  error: string | null;
  fetchSessions: () => Promise<void>;
  setActiveSession: (id: string) => void;
  createSession: () => Promise<Session | null>;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  loading: false,
  error: null,

  fetchSessions: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.fetchSessions();
      const sessions = data.sessions || [];
      set({ sessions, loading: false });
      // Auto-select first session if none active
      if (!get().activeSessionId && sessions.length > 0) {
        set({ activeSessionId: sessions[0].id });
      }
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id });
  },

  createSession: async () => {
    try {
      const session = await api.createSession();
      set((s) => ({
        sessions: [session, ...s.sessions],
        activeSessionId: session.id,
      }));
      return session;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },
}));
