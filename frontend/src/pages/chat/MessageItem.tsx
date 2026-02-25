import type { Message } from '@/types';
import { MarkdownRenderer } from '@/components/Markdown';
import styles from './MessageList.module.css';

interface MessageItemProps {
  message: Message;
}

function formatTimestamp(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function MessageItem({ message }: MessageItemProps) {
  const { role, content, timestamp } = message;

  // Tool messages: collapsed by default
  if (role === 'tool') {
    return (
      <div className={`${styles.message} ${styles.toolMessage}`}>
        <details className={styles.toolDetails}>
          <summary className={styles.toolSummary}>
            🔧 工具调用结果: {message.name || 'unknown'}
          </summary>
          <pre className={styles.toolContent}>{content}</pre>
        </details>
      </div>
    );
  }

  // Assistant messages with tool_calls (no content, just show tool call info)
  if (role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && !content) {
    return (
      <div className={`${styles.message} ${styles.assistantMessage}`}>
        <div className={styles.toolCallInfo}>
          {message.toolCalls.map((tc) => (
            <span key={tc.id} className={styles.toolCallBadge}>
              ⚙️ 调用 {tc.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const isUser = role === 'user';

  return (
    <div className={`${styles.message} ${isUser ? styles.userMessage : styles.assistantMessage}`}>
      <div className={styles.bubble}>
        <div className={styles.content}>
          {isUser ? (
            // User messages: plain text with whitespace preserved
            content
          ) : (
            // Assistant messages: render as Markdown
            <MarkdownRenderer content={content} />
          )}
        </div>
        {timestamp && (
          <div className={styles.timestamp}>{formatTimestamp(timestamp)}</div>
        )}
      </div>
    </div>
  );
}
