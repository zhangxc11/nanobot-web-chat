import { useEffect, useRef, useCallback } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { useSessionStore } from '@/store/sessionStore';
import MessageItem from './MessageItem';
import styles from './MessageList.module.css';

function TypingIndicator() {
  return (
    <div className={`${styles.message} ${styles.assistantMessage}`}>
      <div className={styles.typingBubble}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}

export default function MessageList() {
  const { messages, loading, hasMore, sending } = useMessageStore();
  const { activeSessionId } = useSessionStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadMessages = useMessageStore((s) => s.loadMessages);
  const loadMoreMessages = useMessageStore((s) => s.loadMoreMessages);
  const clearMessages = useMessageStore((s) => s.clearMessages);

  // Load messages when active session changes
  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    } else {
      clearMessages();
    }
  }, [activeSessionId, loadMessages, clearMessages]);

  // Auto-scroll to bottom when new messages arrive or sending starts
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    // Only auto-scroll if messages were appended (not prepended via loadMore)
    if (messages.length > prevMsgCountRef.current) {
      const diff = messages.length - prevMsgCountRef.current;
      // If a small number of messages were added at the end, scroll down
      if (diff <= 3) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (sending) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sending]);

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

  return (
    <div className={styles.messageList} ref={scrollContainerRef}>
      <div className={styles.messageContent}>
        {/* Sentinel for infinite scroll */}
        {hasMore && (
          <div ref={topSentinelRef} className={styles.loadMore}>
            {loading && <span>加载中...</span>}
          </div>
        )}
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
        {sending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
