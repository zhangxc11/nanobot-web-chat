import { useState, useCallback } from 'react';
import type { Message, ContentBlock } from '@/types';
import { MarkdownRenderer } from '@/components/Markdown';
import styles from './MessageList.module.css';

/**
 * Module-level set tracking which collapsible/tool-call elements are expanded.
 * Keyed by stable IDs (tool call id, turn id, etc.).
 * This survives component unmount/remount caused by message list refreshes,
 * so user-expanded sections stay open across auto-refresh cycles.
 */
const _expandedIds = new Set<string>();

/** Hook that syncs expand/collapse state with the module-level set */
function usePersistedExpand(id: string): [boolean, () => void] {
  const [expanded, setExpanded] = useState(() => _expandedIds.has(id));
  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (next) _expandedIds.add(id);
      else _expandedIds.delete(id);
      return next;
    });
  }, [id]);
  return [expanded, toggle];
}

/** Copy button component for message bubbles */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  if (!text) return null;

  return (
    <button
      className={styles.bubbleCopyButton}
      onClick={handleCopy}
      title="复制消息"
    >
      {copied ? '✓' : '📋'}
    </button>
  );
}

/** Minimal usage record type (from api.SessionUsage.records) */
export interface UsageRecord {
  id: number;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  llm_calls: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
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

/** Extract text content from a message (handles both string and multimodal array).
 *  When role is 'user', system markers are stripped. Other roles are returned as-is.
 */
function getTextContent(content: string | ContentBlock[], role?: string): string {
  const shouldStrip = role === 'user';
  if (typeof content === 'string') return shouldStrip ? stripSystemMarker(content) : content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text' && b.text)
      .map(b => shouldStrip ? stripSystemMarker(b.text!) : b.text!)
      .join('\n');
  }
  return '';
}

/** Nanobot system marker — open/close tags for content hidden from display */
const SYSTEM_MARKER_OPEN = '<!-- nanobot:system -->';
const SYSTEM_MARKER_CLOSE = '<!-- /nanobot:system -->';

/** Strip content between nanobot system marker tags (if present).
 *  - Open + Close → remove tagged section, keep surrounding text
 *  - Open only (no close) → fallback: truncate from open tag onward (backward compat)
 *  - No open → return as-is
 */
function stripSystemMarker(text: string): string {
  const openIdx = text.indexOf(SYSTEM_MARKER_OPEN);
  if (openIdx === -1) return text;

  const visiblePart = text.substring(0, openIdx).trim();
  const closeIdx = text.indexOf(SYSTEM_MARKER_CLOSE, openIdx);

  if (closeIdx !== -1) {
    // Has close tag → remove tagged section
    const afterClose = text.substring(closeIdx + SYSTEM_MARKER_CLOSE.length).trim();
    if (afterClose) {
      return visiblePart ? `${visiblePart}\n\n${afterClose}` : afterClose;
    }
    return visiblePart;
  }

  // No close tag → do NOT hide: show full content as-is (legacy messages should remain visible)
  return text;
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
function ToolCallLine({ id, name, content, args }: { id: string; name: string; content: string; args?: string }) {
  const [expanded, toggle] = usePersistedExpand(`tool_${id}`);
  const summary = truncateToolOutput(content);
  const formattedArgs = args ? formatToolArgs(args) : '';

  return (
    <div className={styles.toolCallLine}>
      <div
        className={styles.toolCallLineHeader}
        onClick={toggle}
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
  // Derive a stable ID from the first tool item for persisted expand state
  const firstToolId = items.find(i => i.type === 'tool')?.id
    || (items[0]?.type === 'text' ? items[0].key : 'unknown');
  const [expanded, toggle] = usePersistedExpand(`collapsible_${firstToolId}`);

  if (items.length === 0) return null;

  return (
    <div className={styles.toolCallsCollapsible}>
      <div
        className={styles.toolCallsToggle}
        onClick={toggle}
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
            return <ToolCallLine key={item.id} id={item.id} name={item.name} content={item.content} args={item.args} />;
          })}
          {usageRecords && usageRecords.length > 0 && (() => {
            const totalTokens = usageRecords.reduce((sum, r) => sum + r.total_tokens, 0);
            const promptTokens = usageRecords.reduce((sum, r) => sum + r.prompt_tokens, 0);
            const completionTokens = usageRecords.reduce((sum, r) => sum + r.completion_tokens, 0);
            const llmCalls = usageRecords.reduce((sum, r) => sum + r.llm_calls, 0);
            const cacheRead = usageRecords.reduce((sum, r) => sum + (r.cache_read_input_tokens ?? 0), 0);
            const cacheCreation = usageRecords.reduce((sum, r) => sum + (r.cache_creation_input_tokens ?? 0), 0);
            return (
              <div className={styles.toolUsageSummary}>
                <span className={styles.toolUsageIcon}>📊</span>
                <span className={styles.toolUsageText}>
                  {formatTokens(totalTokens)} tokens
                  {' '}({formatTokens(promptTokens)} 输入
                  {' '}/ {formatTokens(completionTokens)} 输出)
                  {' '}· {llmCalls} 次调用
                  {cacheRead > 0 && <> · <span style={{ color: '#4caf50' }}>缓存 {formatTokens(cacheRead)}</span></>}
                  {cacheCreation > 0 && <> · <span style={{ color: '#ff9800' }}>写入 {formatTokens(cacheCreation)}</span></>}
                </span>
              </div>
            );
          })()}
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
          <ToolCallLine id={message.id} name={message.name || 'unknown'} content={getTextContent(content)} />
        </div>
      </div>
    );
  }

  // Empty assistant message with only tool_calls — skip (handled by AssistantTurnGroup)
  if (role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && !content) {
    return null;
  }

  const isUser = role === 'user';
  const textContent = getTextContent(content, role);
  const imageUrls = isUser ? getImageUrls(content) : [];
  const isError = !isUser && isErrorMessage(content);
  const displayContent = isError ? getErrorText(content) : textContent;

  return (
    <div className={`${styles.message} ${isUser ? styles.userMessage : styles.assistantMessage}`}>
      <div className={`${styles.bubble} ${styles.bubbleWithCopy} ${isError ? styles.errorBubble : ''}`}>
        <CopyButton text={displayContent} />
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
  type: 'user' | 'assistant-turn' | 'system' | 'system-inject' | 'cron-notify';
  messages: Message[];
}

/** Check if a message is a subagent/system inject notification (by content prefix) */
function isSystemInjectByContent(content: string | ContentBlock[]): boolean {
  const text = typeof content === 'string' ? content : getTextContent(content);
  return text.startsWith('[Message from session');
}

/** Check if a message is a cron scheduled task notification (by content prefix) */
function isCronNotification(content: string | ContentBlock[]): boolean {
  const text = typeof content === 'string' ? content : getTextContent(content);
  return text.startsWith('⏰');
}

export function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === 'system-local') {
      groups.push({ type: 'system', messages: [msg] });
      i++;
      continue;
    }

    // Injected system messages (subagent results, etc.) — show as notification card
    // Supports both old role="system" and new role="user" with content prefix detection
    if (msg.role === 'system') {
      groups.push({ type: 'system-inject', messages: [msg] });
      i++;
      continue;
    }

    if (msg.role === 'user') {
      // Check if this is a subagent notification disguised as user message
      if (isSystemInjectByContent(msg.content)) {
        groups.push({ type: 'system-inject', messages: [msg] });
        i++;
        continue;
      }
      // Check if this is a cron scheduled task notification
      if (isCronNotification(msg.content)) {
        groups.push({ type: 'cron-notify', messages: [msg] });
        i++;
        continue;
      }
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

  // Step 1b: Fallback — if no final reply found, check for `message` tool calls.
  // When the agent uses the `message` tool as its final output, the subsequent
  // assistant message has content=null (suppressed by the loop). Extract the
  // content from the *last* `message` tool call's arguments so it still renders.
  let messageToolContent: string | null = null;
  let messageToolTimestamp: string | null = null;
  if (!finalReplyMsg) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
          const tc = msg.toolCalls[j];
          if (tc.name === 'message') {
            try {
              const args = JSON.parse(tc.arguments || '{}');
              if (args.content && typeof args.content === 'string') {
                messageToolContent = args.content;
                messageToolTimestamp = msg.timestamp || null;
              }
            } catch { /* ignore parse errors */ }
            break;
          }
        }
        if (messageToolContent) break;
      }
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

  // Determine effective final content (real reply or message-tool fallback)
  const hasEffectiveFinalReply = finalReplyMsg || messageToolContent;

  // If nothing to render, skip
  if (processItems.length === 0 && !hasEffectiveFinalReply) return null;

  // Find last timestamp in the turn
  const lastTimestamp = [...messages].reverse().find(m => m.timestamp)?.timestamp || '';

  // Determine the text to copy for the entire turn
  const copyText = finalReplyText || messageToolContent || '';

  return (
    <div className={`${styles.message} ${styles.assistantMessage}`}>
      <div className={`${styles.bubble} ${styles.bubbleWithCopy} ${finalReplyIsError && processItems.length === 0 ? styles.errorBubble : ''}`}>
        <CopyButton text={copyText} />
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
          {!finalReplyMsg && messageToolContent && (
            <div className={styles.turnTextSegment}>
              <MarkdownRenderer content={messageToolContent} />
            </div>
          )}
        </div>
        {(lastTimestamp || messageToolTimestamp) && (
          <div className={styles.timestamp}>{formatTimestamp(lastTimestamp || messageToolTimestamp || '')}</div>
        )}
      </div>
    </div>
  );
}

// ── System Inject Card (subagent results, etc.) ──

/** Parse a system inject message into structured parts */
function parseSystemInject(content: string): { source: string; label: string; body: string } {
  // Format: "[Message from session subagent:xxx]\n[Subagent Result Notification]\n..."
  const lines = content.split('\n');
  let source = '';
  let label = '';
  let bodyStart = 0;

  // Line 0: [Message from session subagent:xxx_id]
  const sourceMatch = lines[0]?.match(/^\[Message from session (.+?)\]$/);
  if (sourceMatch) {
    source = sourceMatch[1];
    bodyStart = 1;
  }

  // Line 1: [Subagent Result Notification] or similar bracket label
  const labelMatch = lines[bodyStart]?.match(/^\[(.+?)\]$/);
  if (labelMatch) {
    label = labelMatch[1];
    bodyStart++;
  }

  // Skip "A previously spawned subagent 'xxx' has completed successfully." boilerplate
  while (bodyStart < lines.length) {
    const line = lines[bodyStart];
    if (line.match(/^A previously spawned subagent .+ has completed/)) {
      bodyStart++;
      continue;
    }
    // Skip empty lines after boilerplate
    if (line.trim() === '' && bodyStart > 0) {
      bodyStart++;
      continue;
    }
    break;
  }

  // Find and skip "Original task:" section — go to "Subagent result:" section
  let resultStart = bodyStart;
  for (let i = bodyStart; i < lines.length; i++) {
    if (lines[i].match(/^Subagent result:/i)) {
      resultStart = i + 1;
      break;
    }
  }

  const body = lines.slice(resultStart).join('\n').trim();

  return { source, label: label || 'System Notification', body: body || lines.slice(bodyStart).join('\n').trim() };
}

/** Extract a short subagent label from source like "subagent:webchat_xxx_abc123" */
function formatSubagentSource(source: string): string {
  // "subagent:webchat_1772950145_f60a77e9" → "subagent f60a77e9"
  const m = source.match(/subagent:.*?_([a-f0-9]{6,})$/);
  if (m) return `subagent ${m[1].slice(0, 8)}`;
  // "subagent:xxx" → "subagent"
  if (source.startsWith('subagent')) return 'subagent';
  return source;
}

export function SystemInjectCard({ message }: { message: Message }) {
  const [expanded, toggle] = usePersistedExpand(`inject_${message.id}`);
  const content = getTextContent(message.content, 'user');
  const { source, body } = parseSystemInject(content);
  const displaySource = formatSubagentSource(source);

  return (
    <div className={styles.systemInjectCard}>
      <div
        className={styles.systemInjectHeader}
        onClick={toggle}
      >
        <span className={styles.systemInjectIcon}>🤖</span>
        <span className={styles.systemInjectLabel}>
          {displaySource} 返回结果
        </span>
        <span className={styles.systemInjectArrow}>{expanded ? '▾' : '▸'}</span>
        {message.timestamp && (
          <span className={styles.systemInjectTime}>{formatTimestamp(message.timestamp)}</span>
        )}
      </div>
      {expanded && (
        <div className={styles.systemInjectBody}>
          <MarkdownRenderer content={body} />
        </div>
      )}
    </div>
  );
}

// ── Cron Notification Card (scheduled task reminders) ──

/** Parse a cron notification message into structured parts */
function parseCronNotification(content: string): { source: string; body: string } {
  const lines = content.split('\n');
  let source = '';
  let bodyStart = 0;

  // New Format A: "⏰ [cron:{source}] {message}" (send_to_session with source)
  const cronSourceMatch = lines[0]?.match(/^⏰\s*\[cron:(.+?)\]\s*(.*)$/);
  if (cronSourceMatch) {
    source = cronSourceMatch[1];
    // The rest of line 0 after the prefix is part of the body
    const restOfFirstLine = cronSourceMatch[2];
    const bodyLines = restOfFirstLine ? [restOfFirstLine] : [];
    for (let i = 1; i < lines.length; i++) {
      bodyLines.push(lines[i]);
    }
    const body = bodyLines.join('\n').trim();
    return { source, body: body || content };
  }

  // New Format B: "⏰ {job.name}\n\n{job.payload.message}" (execute_job)
  const emojiMatch = lines[0]?.match(/^⏰\s*(.*)$/);
  if (emojiMatch) {
    source = emojiMatch[1];
    bodyStart = 1;
  } else {
    // Legacy Format A: "[Scheduled Task from cron:xxx]\n{message}"
    const fromMatch = lines[0]?.match(/^\[Scheduled Task from cron:(.+?)\]$/);
    if (fromMatch) {
      source = fromMatch[1];
      bodyStart = 1;
    } else {
      // Legacy Format B: "[Scheduled Task] Timer finished.\nTask 'xxx' has been triggered.\nScheduled instruction: ..."
      const timerMatch = lines[0]?.match(/^\[Scheduled Task\]/);
      if (timerMatch) {
        bodyStart = 0;
        for (let i = 0; i < lines.length; i++) {
          const taskMatch = lines[i].match(/^Task '(.+?)' has been triggered/);
          if (taskMatch) {
            source = taskMatch[1];
            break;
          }
        }
      }
    }
  }

  // Skip empty lines after header
  while (bodyStart < lines.length && lines[bodyStart].trim() === '') {
    bodyStart++;
  }

  // Extract the meaningful body content
  const bodyLines: string[] = [];
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    // Skip "Scheduled instruction:" label (legacy), keep the actual instruction
    const instrMatch = line.match(/^Scheduled instruction:\s*(.*)$/);
    if (instrMatch) {
      if (instrMatch[1]) bodyLines.push(instrMatch[1]);
      continue;
    }
    bodyLines.push(line);
  }

  const body = bodyLines.join('\n').trim();
  return { source, body: body || content };
}

export function CronNotificationCard({ message }: { message: Message }) {
  const content = getTextContent(message.content, 'user');
  const { source, body } = parseCronNotification(content);

  return (
    <div className={styles.cronNotifyCard}>
      <div className={styles.cronNotifyHeader}>
        <span className={styles.cronNotifyIcon}>⏰</span>
        <span className={styles.cronNotifyLabel}>
          定时提醒{source ? ` · ${source}` : ''}
        </span>
        {message.timestamp && (
          <span className={styles.cronNotifyTime}>{formatTimestamp(message.timestamp)}</span>
        )}
      </div>
      {body && (
        <div className={styles.cronNotifyBody}>
          <MarkdownRenderer content={body} />
        </div>
      )}
    </div>
  );
}
