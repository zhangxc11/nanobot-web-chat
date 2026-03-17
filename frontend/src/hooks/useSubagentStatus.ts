/**
 * §49: Hook to poll subagent status for sessions with running subagents.
 * Only polls when the parent session has running children.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchSubagents } from '@/services/api';
import type { SubagentInfo } from '@/services/api';

const POLL_INTERVAL = 5_000; // 5 seconds

/**
 * Shallow-compare two Maps of SubagentInfo arrays by serializing to JSON.
 * Returns true if they are equal.
 */
function mapsEqual(
  a: Map<string, SubagentInfo[]>,
  b: Map<string, SubagentInfo[]>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, aVal] of a) {
    const bVal = b.get(key);
    if (!bVal) return false;
    if (JSON.stringify(aVal) !== JSON.stringify(bVal)) return false;
  }
  return true;
}

/**
 * Given a list of parent session keys (pre-filtered to only those with running children),
 * returns a map of parentSessionKey → SubagentInfo[].
 * §58: Caller is responsible for filtering to only parents with running children.
 */
export function useSubagentStatus(
  parentSessionKeys: string[],
): Map<string, SubagentInfo[]> {
  const [statusMap, setStatusMap] = useState<Map<string, SubagentInfo[]>>(new Map());
  const activeParentsRef = useRef<string[]>([]);
  const prevMapRef = useRef<Map<string, SubagentInfo[]>>(new Map());

  // Determine which parents to poll: caller already filters to only parents with running children
  const activeParents = parentSessionKeys;

  const poll = useCallback(async () => {
    if (activeParents.length === 0) {
      if (prevMapRef.current.size > 0) {
        const empty = new Map<string, SubagentInfo[]>();
        prevMapRef.current = empty;
        setStatusMap(empty);
      }
      return;
    }

    const newMap = new Map<string, SubagentInfo[]>();
    const promises = activeParents.map(async (pk) => {
      try {
        const data = await fetchSubagents(pk);
        if (data.subagents && data.subagents.length > 0) {
          newMap.set(pk, data.subagents);
        }
      } catch {
        // ignore
      }
    });

    await Promise.all(promises);

    // Only update state when content actually changed (avoid unnecessary re-renders)
    if (!mapsEqual(newMap, prevMapRef.current)) {
      prevMapRef.current = newMap;
      setStatusMap(newMap);
    }
  }, [activeParents.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    activeParentsRef.current = activeParents;
    if (activeParents.length === 0) {
      if (prevMapRef.current.size > 0) {
        const empty = new Map<string, SubagentInfo[]>();
        prevMapRef.current = empty;
        setStatusMap(empty);
      }
      return;
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [poll, activeParents.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return statusMap;
}
