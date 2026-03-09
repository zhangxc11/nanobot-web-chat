// Session state store
import { create } from 'zustand';
import type { Session } from '../types';
import * as api from '../services/api';

interface SessionStore {
  sessions: Session[];
  /** Map from child session id → parent session id */
  parentMap: Record<string, string>;
  /** Map from session id → tags (e.g. ["done"]) */
  tagsMap: Record<string, string[]>;
  /** Whether to hide sessions tagged as "done" */
  hideDone: boolean;
  activeSessionId: string | null;
  loading: boolean;
  error: string | null;
  fetchSessions: () => Promise<void>;
  setActiveSession: (id: string) => void;
  createSession: () => Promise<Session | null>;
  renameSession: (id: string, summary: string) => Promise<boolean>;
  deleteSession: (id: string) => Promise<boolean>;
  /** Toggle "done" tag for a session. Returns new tags array. */
  toggleDone: (session: Session) => Promise<void>;
  setHideDone: (v: boolean) => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  parentMap: {},
  tagsMap: {},
  hideDone: true,
  activeSessionId: null,
  loading: false,
  error: null,

  fetchSessions: async () => {
    set({ loading: true, error: null });
    try {
      const [sessionsData, parentMap, tagsMap] = await Promise.all([
        api.fetchSessions(),
        api.fetchSessionParents().catch(() => ({} as Record<string, string>)),
        api.fetchSessionTags().catch(() => ({} as Record<string, string[]>)),
      ]);
      const sessions = sessionsData.sessions || [];
      // Filter out _comment and other meta keys
      const cleanParentMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(parentMap)) {
        if (!k.startsWith('_') && typeof v === 'string') {
          cleanParentMap[k] = v;
        }
      }
      set({ sessions, parentMap: cleanParentMap, tagsMap, loading: false });
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

  renameSession: async (id, summary) => {
    try {
      await api.renameSession(id, summary);
      set((s) => ({
        sessions: s.sessions.map((session) =>
          session.id === id ? { ...session, summary } : session
        ),
      }));
      return true;
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },

  deleteSession: async (id) => {
    try {
      await api.deleteSession(id);
      const { sessions, activeSessionId } = get();
      const remaining = sessions.filter((s) => s.id !== id);
      const newActive =
        activeSessionId === id
          ? remaining.length > 0
            ? remaining[0].id
            : null
          : activeSessionId;
      set({ sessions: remaining, activeSessionId: newActive });
      return true;
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },

  toggleDone: async (session: Session) => {
    const { tagsMap } = get();
    const key = session.id;
    const currentTags = tagsMap[key] || [];
    const isDone = currentTags.includes('done');

    // Optimistic update
    const newTags = isDone
      ? currentTags.filter((t) => t !== 'done')
      : [...currentTags, 'done'];
    const newTagsMap = { ...tagsMap };
    if (newTags.length > 0) {
      newTagsMap[key] = newTags;
    } else {
      delete newTagsMap[key];
    }
    set({ tagsMap: newTagsMap });

    try {
      const patch = isDone ? { remove: ['done'] } : { add: ['done'] };
      await api.patchSessionTags(session.id, patch);
    } catch (err) {
      // Rollback on failure
      set({ tagsMap });
      console.error('Failed to toggle done:', err);
    }
  },

  setHideDone: (v: boolean) => {
    set({ hideDone: v });
  },
}));
