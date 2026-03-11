/**
 * §49: Hook to poll subagent status for sessions with running subagents.
 * Only polls when the parent session has running children.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchSubagents } from '@/services/api';
import type { SubagentInfo } from '@/services/api';

const POLL_INTERVAL = 5_000; // 5 seconds

/**
 * Given a set of running session keys and a set of parent session keys to watch,
 * returns a map of parentSessionKey → SubagentInfo[].
 * Only polls parents that have at least one running child.
 */
export function useSubagentStatus(
  parentSessionKeys: string[],
  runningKeys: Set<string>,
): Map<string, SubagentInfo[]> {
  const [statusMap, setStatusMap] = useState<Map<string, SubagentInfo[]>>(new Map());
  const activeParentsRef = useRef<string[]>([]);

  // Determine which parents to poll: those that have at least one running child
  // We check if any key in runningKeys looks like a subagent of the parent
  const activeParents = parentSessionKeys.filter(() => {
    // Poll all provided parents when there are running sessions
    return runningKeys.size > 0;
  });

  const poll = useCallback(async () => {
    if (activeParents.length === 0) {
      setStatusMap(new Map());
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
    setStatusMap(newMap);
  }, [activeParents.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    activeParentsRef.current = activeParents;
    if (activeParents.length === 0) {
      setStatusMap(new Map());
      return;
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [poll, activeParents.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return statusMap;
}
