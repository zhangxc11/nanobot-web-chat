/**
 * §48-§49: Hook to poll running session keys.
 * Returns a Set<string> of session keys that are currently running.
 * Also triggers session list refresh when new sessions appear.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchRunningSessions } from '@/services/api';
import { useSessionStore } from '@/store/sessionStore';

const POLL_INTERVAL = 10_000; // 10 seconds

export function useRunningSessions(): Set<string> {
  const [runningKeys, setRunningKeys] = useState<Set<string>>(new Set());
  const prevKeysRef = useRef<Set<string>>(new Set());
  const fetchSessions = useSessionStore((s) => s.fetchSessions);

  const poll = useCallback(async () => {
    try {
      const data = await fetchRunningSessions();
      const newKeys = new Set(data.running || []);
      setRunningKeys(newKeys);

      // Check if there are new keys compared to previous poll
      const prev = prevKeysRef.current;
      let hasNew = false;
      for (const k of newKeys) {
        if (!prev.has(k)) {
          hasNew = true;
          break;
        }
      }
      // Also check if sessions finished (were running, now not)
      let hasFinished = false;
      for (const k of prev) {
        if (!newKeys.has(k)) {
          hasFinished = true;
          break;
        }
      }

      if (hasNew || hasFinished) {
        // Refresh session list to pick up new sessions or updated state
        fetchSessions();
      }

      prevKeysRef.current = newKeys;
    } catch {
      // Silently ignore errors — graceful degradation
    }
  }, [fetchSessions]);

  useEffect(() => {
    // Initial poll
    poll();
    const timer = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [poll]);

  return runningKeys;
}
