import { useEffect, useRef } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Load messages when active session changes
  const loadMessages = useMessageStore((s) => s.loadMessages);
  const clearMessages = useMessageStore((s) => s.clearMessages);

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    } else {
      clearMessages();
    }
  }, [activeSessionId, loadMessages, clearMessages]);

  // Auto-scroll to bottom when new messages arrive or sending
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

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
    <div className={styles.messageList} ref={containerRef}>
      {hasMore && (
        <div className={styles.loadMore}>
          <span>↑ 更多历史消息</span>
        </div>
      )}
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
      {sending && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
