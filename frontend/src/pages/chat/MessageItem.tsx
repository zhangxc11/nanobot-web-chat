import { useState } from 'react';
import type { Message, ContentBlock } from '@/types';
import { MarkdownRenderer } from '@/components/Markdown';
import styles from './MessageList.module.css';

/** Minimal usage record type (from api.SessionUsage.records) */
export interface UsageRecord {
  id: number;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  llm_calls: number;
  started_at: string;
  finished_at: string;
}

/** Prefix used by the backend for LLM error responses stored in JSONL */
const LLM_ERROR_PREFIX = 'Error calling LLM:';

/** Check if a message is an LLM error response */
function isErrorMessage(content: string | ContentBlock[]): boolean {
  const text = typeof content === 'string' ? content : getTextContent(content);
  return text.startsWith(LLM_ERROR_PREFIX);
}

/** Strip the error prefix to get the user-facing error text */
function getErrorText(content: string | ContentBlock[]): string {
  const text = typeof content === 'string' ? content : getTextContent(content);
  return text.startsWith(LLM_ERROR_PREFIX)
    ? text.slice(LLM_ERROR_PREFIX.length).trim()
    : text;
}

/** Extract text content from a message (handles both string and multimodal array) */
function getTextContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text!)
      .join('\n');
  }
  return '';
}

/** Extract image URLs from multimodal content */
function getImageUrls(content: string | ContentBlock[]): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter(b => b.type === 'image_url' && b.image_url?.url)
    .map(b => b.image_url!.url);
}

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

/** Format tool arguments for display */
function formatToolArgs(argsJson: string): string {
  if (!argsJson) return '';
  try {
    const args = JSON.parse(argsJson);
    if (typeof args === 'object' && args !== null) {
      const entries = Object.entries(args);
      if (entries.length === 0) return '';
      // For single-arg tools, show just the value
      if (entries.length === 1) {
        const val = entries[0][1];
        return typeof val === 'string' ? val : JSON.stringify(val, null, 2);
      }
      // For multi-arg tools, show key=value pairs
      return entries.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n');
    }
    return argsJson;
  } catch {
    return argsJson;
  }
}

/** Single tool call line — ↳ style, consistent with streaming progress */
function ToolCallLine({ name, content, args }: { name: string; content: string; args?: string }) {
  const [expanded, setExpanded] = useState(false);
  const summary = truncateToolOutput(content);
  const formattedArgs = args ? formatToolArgs(args) : '';

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
        <span className={styles.toolCallExpandIcon}>{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <div className={styles.toolCallExpandedContent}>
          {formattedArgs && (
            <pre className={styles.toolCallArgs}>{formattedArgs}</pre>
          )}
          <div className={styles.toolCallResultSep}>→</div>
          <pre className={styles.toolCallDetail}>{content || '(无输出)'}</pre>
        </div>
      )}
    </div>
  );
}

/** A preceding text line inside the collapsible area — rendered as Markdown */
function PrecedingText({ content }: { content: string }) {
  return (
    <div className={styles.precedingText}>
      <MarkdownRenderer content={content} />
    </div>
  );
}

/** Item in the collapsible tool process section */
type ProcessItem =
  | { type: 'text'; content: string; key: string }
  | { type: 'tool'; name: string; content: string; args?: string; id: string };

/** Format token count to human-readable string */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Collapsible group: preceding texts + tool calls */
function ToolProcessCollapsible({ items, toolCount, usageRecords }: { items: ProcessItem[]; toolCount: number; usageRecords?: UsageRecord[] }) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className={styles.toolCallsCollapsible}>
      <div
        className={styles.toolCallsToggle}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={styles.toolCallsIcon}>⚙</span>
        <span className={styles.toolCallsLabel}>
          使用了 {toolCount} 个工具
        </span>
        <span className={styles.toolCallsArrow}>{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <div className={styles.toolCallsExpanded}>
          {items.map((item) => {
            if (item.type === 'text') {
              return <PrecedingText key={item.key} content={item.content} />;
            }
            return <ToolCallLine key={item.id} name={item.name} content={item.content} args={item.args} />;
          })}
          {usageRecords && usageRecords.length > 0 && (
            <div className={styles.toolUsageSummary}>
              <span className={styles.toolUsageIcon}>📊</span>
              <span className={styles.toolUsageText}>
                {formatTokens(usageRecords.reduce((sum, r) => sum + r.total_tokens, 0))} tokens
                {' '}({formatTokens(usageRecords.reduce((sum, r) => sum + r.prompt_tokens, 0))} 输入
                {' '}/ {formatTokens(usageRecords.reduce((sum, r) => sum + r.completion_tokens, 0))} 输出)
                {' '}· {usageRecords.reduce((sum, r) => sum + r.llm_calls, 0)} 次调用
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessageItem({ message }: MessageItemProps) {
  const { role, content, timestamp } = message;

  // System-local messages (slash command responses)
  if (role === 'system-local') {
    return (
      <div className={styles.systemMessage}>
        <div className={styles.systemBubble}>
          {getTextContent(content)}
        </div>
      </div>
    );
  }

  // Standalone tool messages (shouldn't happen with grouping, but just in case)
  if (role === 'tool') {
    return (
      <div className={`${styles.message} ${styles.assistantMessage}`}>
        <div className={styles.bubble}>
          <ToolCallLine name={message.name || 'unknown'} content={getTextContent(content)} />
        </div>
      </div>
    );
  }

  // Empty assistant message with only tool_calls — skip (handled by AssistantTurnGroup)
  if (role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && !content) {
    return null;
  }

  const isUser = role === 'user';
  const textContent = getTextContent(content);
  const imageUrls = isUser ? getImageUrls(content) : [];
  const isError = !isUser && isErrorMessage(content);
  const displayContent = isError ? getErrorText(content) : textContent;

  return (
    <div className={`${styles.message} ${isUser ? styles.userMessage : styles.assistantMessage}`}>
      <div className={`${styles.bubble} ${isError ? styles.errorBubble : ''}`}>
        {imageUrls.length > 0 && (
          <div className={styles.messageImages}>
            {imageUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className={styles.messageImageLink}>
                <img src={url} alt={`image ${i + 1}`} className={styles.messageImage} loading="lazy" />
              </a>
            ))}
          </div>
        )}
        <div className={styles.content}>
          {isError && <span className={styles.errorIcon}>❌ </span>}
          {isUser ? displayContent : <MarkdownRenderer content={displayContent} />}
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
  type: 'user' | 'assistant-turn' | 'system';
  messages: Message[];
}

export function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === 'user' || msg.role === 'system-local') {
      groups.push({ type: msg.role === 'system-local' ? 'system' : 'user', messages: [msg] });
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
 *
 * Structure:
 *   [ToolProcessCollapsible]   ← preceding texts + tool calls (default collapsed)
 *   [Final reply text]         ← only the last assistant message without tool_calls
 *
 * "Final reply" = last assistant message that has NO tool_calls and has content.
 * Everything else (assistant messages with tool_calls + their content + tool results)
 * goes into the collapsible section.
 */
export function AssistantTurnGroup({ messages, usageRecords }: { messages: Message[]; usageRecords?: UsageRecord[] }) {
  // Step 1: Find the "final reply" — last assistant msg without tool_calls that has content
  let finalReplyMsg: Message | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const text = getTextContent(msg.content);
    if (msg.role === 'assistant' && (!msg.toolCalls || msg.toolCalls.length === 0) && text) {
      finalReplyMsg = msg;
      break;
    }
  }

  // Step 2: Build process items (preceding texts + tool calls) in message order
  const processItems: ProcessItem[] = [];
  const matchedToolIds = new Set<string>();
  let toolCount = 0;

  for (const msg of messages) {
    // Skip the final reply message
    if (msg === finalReplyMsg) continue;

    if (msg.role === 'assistant') {
      // Preceding text from assistant messages with tool_calls
      const text = getTextContent(msg.content);
      if (text && text.trim()) {
        processItems.push({
          type: 'text',
          content: text.trim(),
          key: `text_${msg.id}`,
        });
      }

      // Tool calls
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          const toolResult = messages.find(
            m => m.role === 'tool' && m.toolCallId === tc.id
          );
          if (toolResult) matchedToolIds.add(toolResult.id);
          processItems.push({
            type: 'tool',
            id: tc.id,
            name: tc.name,
            content: getTextContent(toolResult?.content || '(等待结果…)'),
            args: tc.arguments,
          });
          toolCount++;
        }
      }
    }
  }

  // Step 3: Collect unmatched tool messages
  for (const msg of messages) {
    if (msg === finalReplyMsg) continue;
    if (msg.role === 'tool' && !matchedToolIds.has(msg.id)) {
      processItems.push({
        type: 'tool',
        id: msg.id,
        name: msg.name || 'unknown',
        content: getTextContent(msg.content),
      });
      toolCount++;
    }
  }

  // Step 4: Match usage records to this turn by timestamp overlap
  // A usage record matches if its [started_at, finished_at] overlaps with the turn's [first, last] timestamp
  let matchedUsage: UsageRecord[] | undefined;
  if (usageRecords && usageRecords.length > 0 && toolCount > 0) {
    const timestamps = messages
      .map(m => m.timestamp)
      .filter(Boolean)
      .sort();
    if (timestamps.length > 0) {
      const turnStart = timestamps[0];
      const turnEnd = timestamps[timestamps.length - 1];
      matchedUsage = usageRecords.filter(r =>
        r.started_at <= turnEnd && r.finished_at >= turnStart
      );
      if (matchedUsage.length === 0) matchedUsage = undefined;
    }
  }

  // Detect if the final reply is an error message
  const finalReplyIsError = finalReplyMsg ? isErrorMessage(finalReplyMsg.content) : false;
  const finalReplyText = finalReplyMsg
    ? (finalReplyIsError ? getErrorText(finalReplyMsg.content) : getTextContent(finalReplyMsg.content))
    : '';

  // If nothing to render, skip
  if (processItems.length === 0 && !finalReplyMsg) return null;

  // Find last timestamp in the turn
  const lastTimestamp = [...messages].reverse().find(m => m.timestamp)?.timestamp || '';

  return (
    <div className={`${styles.message} ${styles.assistantMessage}`}>
      <div className={`${styles.bubble} ${finalReplyIsError && processItems.length === 0 ? styles.errorBubble : ''}`}>
        <div className={styles.turnContent}>
          {processItems.length > 0 && (
            <ToolProcessCollapsible items={processItems} toolCount={toolCount} usageRecords={matchedUsage} />
          )}
          {finalReplyMsg && (
            <div className={`${styles.turnTextSegment} ${finalReplyIsError ? styles.errorText : ''}`}>
              {finalReplyIsError && <span className={styles.errorIcon}>❌ </span>}
              <MarkdownRenderer content={finalReplyText} />
            </div>
          )}
        </div>
        {lastTimestamp && (
          <div className={styles.timestamp}>{formatTimestamp(lastTimestamp)}</div>
        )}
      </div>
    </div>
  );
}
