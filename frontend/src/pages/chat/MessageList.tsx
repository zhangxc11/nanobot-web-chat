import { useEffect, useRef, useCallback, useState } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { useSessionStore } from '@/store/sessionStore';
import type { ProgressStep } from '@/types';
import MessageItem, { groupMessages, AssistantTurnGroup } from './MessageItem';
import styles from './MessageList.module.css';

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
  const { messages, loading, hasMore, sending, sendingSessionId, error, progressSteps, recovering } = useMessageStore();
  const { activeSessionId } = useSessionStore();
  const isCurrentSessionSending = sending && sendingSessionId === activeSessionId;
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadMessages = useMessageStore((s) => s.loadMessages);
  const loadMoreMessages = useMessageStore((s) => s.loadMoreMessages);
  const clearMessages = useMessageStore((s) => s.clearMessages);
  const checkRunningTask = useMessageStore((s) => s.checkRunningTask);

  // Track whether the current load is an initial load (vs loadMore)
  const isInitialLoadRef = useRef(false);

  // Load messages when active session changes
  useEffect(() => {
    if (activeSessionId) {
      isInitialLoadRef.current = true;
      loadMessages(activeSessionId);
      // Check if there's a running task for this session (e.g. after page refresh)
      checkRunningTask(activeSessionId);
    } else {
      clearMessages();
    }
  }, [activeSessionId, loadMessages, clearMessages, checkRunningTask]);

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

    // Subsequent updates: only auto-scroll if a small number of messages were appended
    if (messages.length > prevMsgCountRef.current) {
      const diff = messages.length - prevMsgCountRef.current;
      if (diff <= 3) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages]);

  // Auto-scroll when new progress steps arrive or sending state changes
  useEffect(() => {
    if (isCurrentSessionSending) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isCurrentSessionSending, progressSteps]);

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
    <div className={styles.messageList} ref={scrollContainerRef}>
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
          // assistant-turn: render compactly
          return <AssistantTurnGroup key={`turn-${idx}`} messages={group.messages} />;
        })}
        {isCurrentSessionSending && <ProgressIndicator steps={progressSteps} recovering={recovering} />}
        {error && messages.length > 0 && (
          <div className={styles.errorBanner}>
            ⚠️ {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
