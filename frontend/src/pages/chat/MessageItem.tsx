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
  // Take first non-empty line
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

  // Tool messages: render as compact line (used in grouped view)
  if (role === 'tool') {
    return (
      <ToolCallLine name={message.name || 'unknown'} content={content} />
    );
  }

  // Assistant messages with only tool_calls (no content) — render tool call names as compact lines
  if (role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && !content) {
    // These will be rendered inline in the message group, not as standalone items
    // Return null here; the grouping logic in MessageList handles them
    return null;
  }

  const isUser = role === 'user';

  return (
    <div className={`${styles.message} ${isUser ? styles.userMessage : styles.assistantMessage}`}>
      <div className={styles.bubble}>
        <div className={styles.content}>
          {isUser ? (
            content
          ) : (
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

/**
 * Group messages into "conversation turns" for compact rendering.
 * 
 * A group is:
 * - A user message (standalone)
 * - An assistant turn: optional text + tool calls + tool results + optional final text
 * 
 * Returns an array of groups, where each group is an array of messages.
 * Tool-related messages in a group are rendered compactly.
 */
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

    // Start of an assistant turn: collect all consecutive assistant+tool messages
    if (msg.role === 'assistant' || msg.role === 'tool') {
      const turnMessages: Message[] = [];
      while (i < messages.length && (messages[i].role === 'assistant' || messages[i].role === 'tool')) {
        turnMessages.push(messages[i]);
        i++;
      }
      groups.push({ type: 'assistant-turn', messages: turnMessages });
      continue;
    }

    // Fallback: treat as standalone
    groups.push({ type: 'user', messages: [msg] });
    i++;
  }

  return groups;
}

/** Render a grouped assistant turn compactly */
export function AssistantTurnGroup({ messages }: { messages: Message[] }) {
  // Separate into: content messages and tool-related messages
  const parts: JSX.Element[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'assistant' && msg.content) {
      // Assistant message with text content — render as bubble
      parts.push(
        <div key={msg.id} className={`${styles.message} ${styles.assistantMessage}`}>
          <div className={styles.bubble}>
            <div className={styles.content}>
              <MarkdownRenderer content={msg.content} />
            </div>
            {msg.timestamp && (
              <div className={styles.timestamp}>{formatTimestamp(msg.timestamp)}</div>
            )}
          </div>
        </div>
      );
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && !msg.content) {
      // Assistant with tool_calls but no content — collect subsequent tool results
      const toolLines: JSX.Element[] = [];
      for (const tc of msg.toolCalls) {
        // Find matching tool result
        const toolResult = messages.find(
          (m, j) => j > i && m.role === 'tool' && m.toolCallId === tc.id
        );
        toolLines.push(
          <ToolCallLine
            key={tc.id}
            name={tc.name}
            content={toolResult?.content || '(等待结果…)'}
          />
        );
      }
      if (toolLines.length > 0) {
        parts.push(
          <div key={msg.id} className={styles.toolCallGroup}>
            {toolLines}
          </div>
        );
      }
    } else if (msg.role === 'tool') {
      // Tool messages that weren't matched above — render standalone
      // Check if this tool message was already rendered via a tool_calls match
      const alreadyRendered = messages.some(
        (m, j) => j < i && m.role === 'assistant' && m.toolCalls?.some(tc => tc.id === msg.toolCallId)
      );
      if (!alreadyRendered) {
        parts.push(
          <ToolCallLine key={msg.id} name={msg.name || 'unknown'} content={msg.content} />
        );
      }
    }
  }

  return <>{parts}</>;
}
