/**
 * Provider state management — tracks active provider/model and available list.
 * Fetches from worker via /api/provider endpoint.
 */

import { create } from 'zustand';
import { getProvider, setProvider, type ProviderInfo } from '@/services/api';

interface ProviderStore {
  // State
  active: ProviderInfo | null;
  available: ProviderInfo[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchProvider: () => Promise<void>;
  switchProvider: (provider: string, model?: string) => Promise<void>;
}

export const useProviderStore = create<ProviderStore>((set) => ({
  active: null,
  available: [],
  loading: false,
  error: null,

  fetchProvider: async () => {
    set({ loading: true, error: null });
    try {
      const data = await getProvider();
      set({
        active: data.active,
        available: data.available,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch provider',
      });
    }
  },

  switchProvider: async (provider: string, model?: string) => {
    set({ loading: true, error: null });
    try {
      const data = await setProvider(provider, model);
      set({
        active: data.active,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to switch provider',
      });
      throw err;  // Re-throw so callers can handle
    }
  },
}));
