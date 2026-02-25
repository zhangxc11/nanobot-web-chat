import { useState } from 'react';
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

/** Truncate tool output to a short summary */
function truncateToolOutput(content: string, maxLen = 60): string {
  if (!content) return '(无输出)';
  const firstLine = content.split('\n').find(l => l.trim()) || content;
  const trimmed = firstLine.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.substring(0, maxLen) + '…';
}

/** Compact tool call line — single line, expandable */
function ToolCallLine({ name, content }: { name: string; content: string }) {
  const [expanded, setExpanded] = useState(false);
  const summary = truncateToolOutput(content);

  return (
    <div className={styles.toolCallLine}>
      <div
        className={styles.toolCallLineHeader}
        onClick={() => setExpanded(!expanded)}
        title="点击展开/折叠详情"
      >
        <span className={styles.toolCallArrow}>{expanded ? '▾' : '▸'}</span>
        <span className={styles.toolCallName}>{name}</span>
        {!expanded && (
          <span className={styles.toolCallSummary}>{summary}</span>
        )}
      </div>
      {expanded && (
        <pre className={styles.toolCallDetail}>{content || '(无输出)'}</pre>
      )}
    </div>
  );
}

export default function MessageItem({ message }: MessageItemProps) {
  const { role, content, timestamp } = message;

  if (role === 'tool') {
    return <ToolCallLine name={message.name || 'unknown'} content={content} />;
  }

  if (role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && !content) {
    return null;
  }

  const isUser = role === 'user';

  return (
    <div className={`${styles.message} ${isUser ? styles.userMessage : styles.assistantMessage}`}>
      <div className={styles.bubble}>
        <div className={styles.content}>
          {isUser ? content : <MarkdownRenderer content={content} />}
        </div>
        {timestamp && (
          <div className={styles.timestamp}>{formatTimestamp(timestamp)}</div>
        )}
      </div>
    </div>
  );
}

// ── Grouping logic ──

export interface MessageGroup {
  type: 'user' | 'assistant-turn';
  messages: Message[];
}

export function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === 'user') {
      groups.push({ type: 'user', messages: [msg] });
      i++;
      continue;
    }

    if (msg.role === 'assistant' || msg.role === 'tool') {
      const turnMessages: Message[] = [];
      while (i < messages.length && (messages[i].role === 'assistant' || messages[i].role === 'tool')) {
        turnMessages.push(messages[i]);
        i++;
      }
      groups.push({ type: 'assistant-turn', messages: turnMessages });
      continue;
    }

    groups.push({ type: 'user', messages: [msg] });
    i++;
  }

  return groups;
}

/**
 * Render an entire assistant turn as ONE bubble.
 * Inside the bubble: text segments + compact tool call lines, all tightly packed.
 */
export function AssistantTurnGroup({ messages }: { messages: Message[] }) {
  // Build parts: each is either a text segment or a tool call line
  const parts: JSX.Element[] = [];
  // Track which tool messages have been matched to a tool_calls entry
  const matchedToolIds = new Set<string>();

  // First pass: identify matched tool results
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        const toolResult = messages.find(
          m => m.role === 'tool' && m.toolCallId === tc.id
        );
        if (toolResult) matchedToolIds.add(toolResult.id);
      }
    }
  }

  // Second pass: build parts
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'assistant' && msg.content) {
      // Text content — render inline as markdown
      parts.push(
        <div key={msg.id} className={styles.turnTextSegment}>
          <MarkdownRenderer content={msg.content} />
        </div>
      );
    }

    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      // Tool calls — render each as compact line with matched result
      for (const tc of msg.toolCalls) {
        const toolResult = messages.find(
          m => m.role === 'tool' && m.toolCallId === tc.id
        );
        parts.push(
          <ToolCallLine
            key={tc.id}
            name={tc.name}
            content={toolResult?.content || '(等待结果…)'}
          />
        );
      }
    }

    if (msg.role === 'tool' && !matchedToolIds.has(msg.id)) {
      // Unmatched tool message — render standalone
      parts.push(
        <ToolCallLine key={msg.id} name={msg.name || 'unknown'} content={msg.content} />
      );
    }
  }

  if (parts.length === 0) return null;

  // Find last timestamp in the turn
  const lastTimestamp = [...messages].reverse().find(m => m.timestamp)?.timestamp || '';

  return (
    <div className={`${styles.message} ${styles.assistantMessage}`}>
      <div className={styles.bubble}>
        <div className={styles.turnContent}>
          {parts}
        </div>
        {lastTimestamp && (
          <div className={styles.timestamp}>{formatTimestamp(lastTimestamp)}</div>
        )}
      </div>
    </div>
  );
}
