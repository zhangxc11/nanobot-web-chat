import React, { useState } from 'react';
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

/** Single tool call line — ↳ style, consistent with streaming progress */
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
        <span className={styles.toolCallArrowIcon}>↳</span>
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

/** Collapsible group of all tool calls in a turn */
function ToolCallsCollapsible({ toolCalls }: { toolCalls: { name: string; content: string; id: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  const count = toolCalls.length;

  if (count === 0) return null;

  return (
    <div className={styles.toolCallsCollapsible}>
      <div
        className={styles.toolCallsToggle}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={styles.toolCallsIcon}>⚙</span>
        <span className={styles.toolCallsLabel}>
          使用了 {count} 个工具
        </span>
        <span className={styles.toolCallsArrow}>{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <div className={styles.toolCallsExpanded}>
          {toolCalls.map((tc) => (
            <ToolCallLine key={tc.id} name={tc.name} content={tc.content} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MessageItem({ message }: MessageItemProps) {
  const { role, content, timestamp } = message;

  // Standalone tool messages (shouldn't happen with grouping, but just in case)
  if (role === 'tool') {
    return (
      <div className={`${styles.message} ${styles.assistantMessage}`}>
        <div className={styles.bubble}>
          <ToolCallLine name={message.name || 'unknown'} content={content} />
        </div>
      </div>
    );
  }

  // Empty assistant message with only tool_calls — skip (handled by AssistantTurnGroup)
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
 * Tool calls are grouped into a collapsible section (default collapsed).
 * Only the final assistant text is shown by default.
 */
export function AssistantTurnGroup({ messages }: { messages: Message[] }) {
  // Collect tool calls with their results
  const toolCallItems: { name: string; content: string; id: string }[] = [];
  const textParts: React.JSX.Element[] = [];
  const matchedToolIds = new Set<string>();

  // First pass: match tool results to tool_calls
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        const toolResult = messages.find(
          m => m.role === 'tool' && m.toolCallId === tc.id
        );
        if (toolResult) matchedToolIds.add(toolResult.id);
        toolCallItems.push({
          id: tc.id,
          name: tc.name,
          content: toolResult?.content || '(等待结果…)',
        });
      }
    }
  }

  // Second pass: collect unmatched tool messages
  for (const msg of messages) {
    if (msg.role === 'tool' && !matchedToolIds.has(msg.id)) {
      toolCallItems.push({
        id: msg.id,
        name: msg.name || 'unknown',
        content: msg.content,
      });
    }
  }

  // Third pass: collect text content from assistant messages
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.content) {
      textParts.push(
        <div key={msg.id} className={styles.turnTextSegment}>
          <MarkdownRenderer content={msg.content} />
        </div>
      );
    }
  }

  // If nothing to render, skip
  if (toolCallItems.length === 0 && textParts.length === 0) return null;

  // Find last timestamp in the turn
  const lastTimestamp = [...messages].reverse().find(m => m.timestamp)?.timestamp || '';

  return (
    <div className={`${styles.message} ${styles.assistantMessage}`}>
      <div className={styles.bubble}>
        <div className={styles.turnContent}>
          {toolCallItems.length > 0 && (
            <ToolCallsCollapsible toolCalls={toolCallItems} />
          )}
          {textParts}
        </div>
        {lastTimestamp && (
          <div className={styles.timestamp}>{formatTimestamp(lastTimestamp)}</div>
        )}
      </div>
    </div>
  );
}
