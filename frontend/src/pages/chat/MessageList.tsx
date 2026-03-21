import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { useSessionStore } from '@/store/sessionStore';
import { useRunningSessions } from '@/hooks/useRunningSessions';
import type { ProgressStep } from '@/types';
import type { SessionUsage } from '@/services/api';
import * as api from '@/services/api';
import MessageItem, { groupMessages, AssistantTurnGroup, SystemInjectCard, CronNotificationCard } from './MessageItem';
import styles from './MessageList.module.css';

/** Scroll-to-bottom floating button — appears when turn ends and user is not at bottom */
function ScrollToBottomButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      className={`${styles.scrollToBottom} ${visible ? styles.scrollToBottomVisible : ''}`}
      onClick={onClick}
      aria-label="滚动到底部"
    >
      <span className={styles.scrollToBottomArrow}>↓</span>
      <span className={styles.scrollToBottomText}>新消息</span>
    </button>
  );
}

/** A single progress step — supports expand/collapse for tool results */
function ProgressStepItem({ step }: { step: ProgressStep }) {
  const [expanded, setExpanded] = useState(false);

  if (step.type === 'tool_result' && step.content) {
    // Tool result with expandable detail: "↳ tool_name → summary ▸"
    return (
      <div className={styles.progressStep}>
        <span className={styles.progressArrow}>↳</span>
        <div className={styles.progressToolResult}>
          <div
            className={styles.progressToolResultHeader}
            onClick={() => setExpanded(!expanded)}
            title="点击展开/折叠详情"
          >
            <span className={styles.progressToolName}>{step.name || 'unknown'}</span>
            <span className={styles.progressToolSep}>→</span>
            {!expanded && (
              <span className={styles.progressToolSummary}>
                {_firstLine(step.content, 80)}
              </span>
            )}
            <span className={styles.progressToolExpand}>{expanded ? '▾' : '▸'}</span>
          </div>
          {expanded && (
            <pre className={styles.progressToolDetail}>{step.content}</pre>
          )}
        </div>
      </div>
    );
  }

  if (step.type === 'tool_hint') {
    // Tool call hint: "↳ exec("ls -la")"
    return (
      <div className={styles.progressStep}>
        <span className={styles.progressArrow}>↳</span>
        <span className={styles.progressText}>{step.text}</span>
      </div>
    );
  }

  if (step.type === 'user_inject') {
    // User injected message: "📝 User: message"
    return (
      <div className={`${styles.progressStep} ${styles.progressUserInject}`}>
        <span className={styles.progressText}>{step.text}</span>
      </div>
    );
  }

  if (step.type === 'system_inject') {
    // Subagent result notification: "🤖 subagent: result"
    return (
      <div className={`${styles.progressStep} ${styles.progressSystemInject}`}>
        <span className={styles.progressText}>{step.text}</span>
      </div>
    );
  }

  // Thinking text — no ↳ prefix, rendered as plain text with muted style
  return (
    <div className={styles.progressStep}>
      <span className={styles.progressThinkingText}>{step.text}</span>
    </div>
  );
}

/** Extract first meaningful line, truncated */
function _firstLine(content: string, maxLen: number): string {
  if (!content) return '(无输出)';
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed.length <= maxLen ? trimmed : trimmed.substring(0, maxLen) + '…';
    }
  }
  return content.length <= maxLen ? content : content.substring(0, maxLen) + '…';
}

function ProgressIndicator({ steps, recovering }: { steps: ProgressStep[]; recovering: boolean }) {
  return (
    <div className={`${styles.message} ${styles.assistantMessage}`}>
      <div className={styles.progressBubble}>
        {steps.length === 0 && !recovering ? (
          <div className={styles.typingBubble}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        ) : (
          <div className={styles.progressSteps}>
            {steps.map((step, i) => (
              <ProgressStepItem key={i} step={step} />
            ))}
            {recovering ? (
              <div className={styles.progressStep}>
                <span className={styles.progressArrow}>⏳</span>
                <span className={styles.progressText}>连接中断，正在恢复任务状态...</span>
              </div>
            ) : (
              <div className={styles.typingBubble}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessageList() {
  const { messages, loading, hasMore, getTask, getError } = useMessageStore();
  const { activeSessionId } = useSessionStore();
  const task = activeSessionId ? getTask(activeSessionId) : null;
  const error = activeSessionId ? getError(activeSessionId) : null;
  const isCurrentSessionSending = task?.sending ?? false;
  const progressSteps = task?.progressSteps ?? [];
  const recovering = task?.recovering ?? false;
  const runningKeys = useRunningSessions();

  // Compute whether the active session is in auto-refresh polling mode
  // (running in background but not connected via SSE/attach).
  // This is the case for subagent sessions viewed in the UI.
  const isInAutoRefreshMode = useMemo(() => {
    if (!activeSessionId || isCurrentSessionSending) return false;
    const idx = activeSessionId.indexOf('_');
    const sessionKey = idx > 0
      ? activeSessionId.substring(0, idx) + ':' + activeSessionId.substring(idx + 1)
      : activeSessionId;
    return runningKeys.has(sessionKey);
  }, [activeSessionId, isCurrentSessionSending, runningKeys]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [sessionUsage, setSessionUsage] = useState<SessionUsage | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Track previous sending state to detect turn end (sending: true → false)
  const prevSendingRef = useRef(false);

  const loadMessages = useMessageStore((s) => s.loadMessages);
  const refreshMessages = useMessageStore((s) => s.refreshMessages);
  const loadMoreMessages = useMessageStore((s) => s.loadMoreMessages);
  const clearMessages = useMessageStore((s) => s.clearMessages);
  const checkRunningTask = useMessageStore((s) => s.checkRunningTask);

  // True during the first loadMessages() after a session switch.
  // Triggers an instant (non-smooth) scroll-to-bottom once messages render.
  const isInitialLoadRef = useRef(false);

  // Track whether user just sent a message (should always scroll to bottom)
  const userSentRef = useRef(false);

  // Track previous running state to detect task completion (running → idle)
  const wasRunningRef = useRef(false);

  // Whether there's pending (unfetched) data from auto-refresh that was skipped
  // because the user was scrolled up. Applied when user scrolls back to bottom.
  const pendingRefreshRef = useRef(false);

  // Sticky flag: once the user scrolls away from bottom, stays true until they
  // explicitly return (scroll back / click "scroll to bottom" / send a message).
  // This is more stable than recalculating isNearBottom() each interval tick,
  // because content-height changes can't accidentally flip the flag back.
  const userScrolledAwayRef = useRef(false);

  /** Check if scroll position is near the bottom (within threshold) */
  const isNearBottom = useCallback((): boolean => {
    const container = scrollContainerRef.current;
    if (!container) return false; // No container yet → not at bottom (safe default)
    const threshold = 300; // ~2 message heights — generous to avoid false positives
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Listen for user-sent events (dispatched by messageStore.sendMessage)
  useEffect(() => {
    const onUserSent = () => {
      userSentRef.current = true;
      userScrolledAwayRef.current = false; // User is actively engaging → reset
    };
    window.addEventListener('user-message-sent', onUserSent);
    return () => window.removeEventListener('user-message-sent', onUserSent);
  }, []);

  // Distinguish user-initiated scrolls from programmatic/layout-driven ones.
  // Used to safely reset userScrolledAwayRef only on genuine user interaction,
  // since DOM height changes can trigger passive scroll events.
  const userInteractingRef = useRef(false);

  // Track when scrollContainerRef becomes available (after early-return conditions clear).
  // We need a state variable because ref changes don't trigger re-render / re-run effects.
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const scrollContainerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    setScrollContainer(node);
  }, []);

  useEffect(() => {
    const container = scrollContainer;
    if (!container) return;

    // Mark that user is actively interacting (wheel, touch, pointer)
    const onInteractionStart = () => { userInteractingRef.current = true; };
    const onInteractionEnd = () => {
      // Delay clearing so the subsequent scroll event still sees it
      setTimeout(() => { userInteractingRef.current = false; }, 150);
    };

    const onScroll = () => {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distFromBottom > 300) {
        // Scrolled away from bottom — always latch to true
        // (whether user-initiated or layout-driven, the user IS away from bottom)
        userScrolledAwayRef.current = true;
      } else if (userInteractingRef.current) {
        // Near bottom AND user is actively scrolling — reset flag
        userScrolledAwayRef.current = false;
      }
      // Near bottom but NOT user-initiated (e.g. DOM height change) — keep flag as-is
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('wheel', onInteractionStart, { passive: true });
    container.addEventListener('touchstart', onInteractionStart, { passive: true });
    container.addEventListener('pointerdown', onInteractionStart);
    container.addEventListener('wheel', onInteractionEnd, { passive: true });
    container.addEventListener('touchend', onInteractionEnd, { passive: true });
    container.addEventListener('pointerup', onInteractionEnd);

    return () => {
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('wheel', onInteractionStart);
      container.removeEventListener('touchstart', onInteractionStart);
      container.removeEventListener('pointerdown', onInteractionStart);
      container.removeEventListener('wheel', onInteractionEnd);
      container.removeEventListener('touchend', onInteractionEnd);
      container.removeEventListener('pointerup', onInteractionEnd);
    };
  }, [scrollContainer]);

  // Load messages when active session changes
  useEffect(() => {
    if (activeSessionId) {
      isInitialLoadRef.current = true;
      pendingRefreshRef.current = false; // Reset on session switch
      userScrolledAwayRef.current = false; // Reset on session switch
      prevSendingRef.current = false; // Reset to prevent false "turn end" detection
      wasRunningRef.current = false; // Reset to prevent false "task completed" detection
      loadMessages(activeSessionId);
      // Check if there's a running task for this session (e.g. after page refresh)
      checkRunningTask(activeSessionId);
    } else {
      clearMessages();
    }
  }, [activeSessionId, loadMessages, clearMessages, checkRunningTask]);

  // Auto-refresh for running sessions without SSE connection (e.g. subagent sessions).
  // Simplified approach: if user is scrolled up, SKIP the refresh entirely (no React
  // re-render = no scroll disruption). Mark pendingRefreshRef so the next scroll-to-bottom
  // triggers a refresh. If user is near bottom, refresh normally and stay at bottom.
  useEffect(() => {
    if (!activeSessionId || isCurrentSessionSending) return;

    // Convert id to sessionKey: replace first '_' with ':'
    const idx = activeSessionId.indexOf('_');
    const sessionKey = idx > 0
      ? activeSessionId.substring(0, idx) + ':' + activeSessionId.substring(idx + 1)
      : activeSessionId;

    const isRunning = runningKeys.has(sessionKey);

    // Session just finished running — do a final refresh to capture last messages
    if (wasRunningRef.current && !isRunning) {
      pendingRefreshRef.current = false;
      refreshMessages(activeSessionId).then(() => {
        // After final refresh, scroll to bottom if user was following along
        requestAnimationFrame(() => {
          if (!userScrolledAwayRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }
        });
      });
    }
    wasRunningRef.current = isRunning;

    if (!isRunning) return;

    const timer = setInterval(async () => {
      if (!userScrolledAwayRef.current) {
        // User is following along at bottom — refresh and scroll to bottom
        pendingRefreshRef.current = false;
        await refreshMessages(activeSessionId);
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      } else {
        // User has scrolled away — skip refresh entirely.
        // No React state update = no re-render = no scroll disruption.
        pendingRefreshRef.current = true;
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [activeSessionId, isCurrentSessionSending, runningKeys, refreshMessages]);

  // Fetch session usage for tool call token display
  useEffect(() => {
    if (!activeSessionId) {
      setSessionUsage(null);
      return;
    }
    const key = (() => {
      const idx = activeSessionId.indexOf('_');
      if (idx > 0) return activeSessionId.substring(0, idx) + ':' + activeSessionId.substring(idx + 1);
      return activeSessionId;
    })();

    let cancelled = false;
    api.fetchSessionUsage(key).then(data => {
      if (!cancelled) setSessionUsage(data);
    }).catch(() => {
      if (!cancelled) setSessionUsage(null);
    });

    // Also refresh on usage-updated event
    const onUsageUpdated = () => {
      api.fetchSessionUsage(key).then(data => {
        if (!cancelled) setSessionUsage(data);
      }).catch(() => {});
    };
    window.addEventListener('usage-updated', onUsageUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener('usage-updated', onUsageUpdated);
    };
  }, [activeSessionId]);

  // Auto-scroll to bottom on initial load or when new messages are appended
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (messages.length === 0) {
      prevMsgCountRef.current = 0;
      return;
    }

    if (isInitialLoadRef.current) {
      // Initial load: always scroll to bottom (like opening a chat in IM)
      isInitialLoadRef.current = false;
      // Use requestAnimationFrame to ensure DOM has rendered
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      });
      prevMsgCountRef.current = messages.length;
      return;
    }

    // Subsequent updates: check context
    if (messages.length > prevMsgCountRef.current) {
      if (isInAutoRefreshMode) {
        // Auto-refresh interval handles its own scroll — don't interfere
      } else {
        // Check if this is a turn-end reload (sending just went true → false)
        const isTurnEnd = prevSendingRef.current && !isCurrentSessionSending;
        if (isTurnEnd) {
          // Turn just ended — skip auto-scroll, let turn-end handler decide (show button or not)
        } else if (userSentRef.current) {
          // User just sent a message — always scroll to bottom
          userSentRef.current = false;
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else if (!userScrolledAwayRef.current && isNearBottom()) {
          // SSE/streaming update, user hasn't scrolled away, and is near bottom — follow along
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
        // If user has scrolled away — do nothing, don't disrupt browsing
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, isNearBottom, isInAutoRefreshMode]);

  // Auto-scroll when new progress steps arrive or sending state changes
  useEffect(() => {
    if (isInAutoRefreshMode) return; // Don't interfere during auto-refresh
    if (isCurrentSessionSending) {
      if (userSentRef.current) {
        // User just sent a message — always scroll to bottom
        userSentRef.current = false;
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else if (!userScrolledAwayRef.current && isNearBottom()) {
        // User hasn't scrolled away AND is near bottom — follow along
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      // If user has scrolled away — do nothing, don't disrupt browsing
    }
  }, [isCurrentSessionSending, progressSteps, isNearBottom, isInAutoRefreshMode]);

  // Detect turn end (sending: true → false) — show scroll-to-bottom button if not near bottom
  useEffect(() => {
    const wasSending = prevSendingRef.current;
    prevSendingRef.current = isCurrentSessionSending;

    if (wasSending && !isCurrentSessionSending) {
      // Turn just ended — after DOM settles, check if user is not near bottom → show button
      requestAnimationFrame(() => {
        if (!isNearBottom()) {
          setShowScrollToBottom(true);
        }
      });
    }
  }, [isCurrentSessionSending, isNearBottom]);

  // Hide scroll-to-bottom button when user scrolls to bottom manually
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (showScrollToBottom && isNearBottom()) {
        setShowScrollToBottom(false);
      }
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [showScrollToBottom, isNearBottom]);

  // Apply pending auto-refresh when user scrolls back to bottom.
  // During auto-refresh mode, if user is scrolled up, we skip refreshMessages
  // to avoid re-render/scroll disruption. When they scroll back to bottom,
  // apply the pending refresh to show latest content.
  useEffect(() => {
    if (!isInAutoRefreshMode) return; // Only relevant during auto-refresh mode
    const container = scrollContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (pendingRefreshRef.current && isNearBottom() && activeSessionId) {
        pendingRefreshRef.current = false;
        userScrolledAwayRef.current = false; // User scrolled back to bottom
        refreshMessages(activeSessionId).then(() => {
          requestAnimationFrame(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          });
        });
      }
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [isInAutoRefreshMode, activeSessionId, refreshMessages, isNearBottom]);

  // Hide scroll-to-bottom button when session changes
  useEffect(() => {
    setShowScrollToBottom(false);
  }, [activeSessionId]);

  /** Handle scroll-to-bottom button click */
  const handleScrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollToBottom(false);
    userScrolledAwayRef.current = false; // User explicitly returned to bottom
  }, []);

  // IntersectionObserver for infinite scroll (load older messages)
  const handleLoadMore = useCallback(() => {
    if (!activeSessionId || loading || !hasMore) return;
    // Save scroll height before loading
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;

    loadMoreMessages(activeSessionId).then(() => {
      // Restore scroll position so content doesn't jump
      if (container) {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - prevScrollHeight;
      }
    });
  }, [activeSessionId, loading, hasMore, loadMoreMessages]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  if (!activeSessionId) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>💬</span>
        <p>选择一个对话或创建新对话开始聊天</p>
      </div>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>加载中...</p>
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>⚠️</span>
        <p>加载失败：{error}</p>
        <button className={styles.retryButton} onClick={() => activeSessionId && loadMessages(activeSessionId)}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className={styles.messageList} ref={scrollContainerCallbackRef}>
      <div className={styles.messageContent}>
        {/* Sentinel for infinite scroll */}
        {hasMore && (
          <div ref={topSentinelRef} className={styles.loadMore}>
            {loading && <span>加载中...</span>}
          </div>
        )}
        {groupMessages(messages).map((group, idx) => {
          if (group.type === 'user') {
            return <MessageItem key={group.messages[0].id} message={group.messages[0]} />;
          }
          if (group.type === 'system') {
            return <MessageItem key={group.messages[0].id} message={group.messages[0]} />;
          }
          if (group.type === 'system-inject') {
            return <SystemInjectCard key={group.messages[0].id} message={group.messages[0]} />;
          }
          if (group.type === 'cron-notify') {
            return <CronNotificationCard key={group.messages[0].id} message={group.messages[0]} />;
          }
          // assistant-turn: render compactly
          return <AssistantTurnGroup key={`turn-${idx}`} messages={group.messages} usageRecords={sessionUsage?.records} />;
        })}
        {isCurrentSessionSending && <ProgressIndicator steps={progressSteps} recovering={recovering} />}
        {error && messages.length > 0 && (
          <div className={styles.errorBanner}>
            ⚠️ {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <ScrollToBottomButton visible={showScrollToBottom} onClick={handleScrollToBottom} />
    </div>
  );
}
