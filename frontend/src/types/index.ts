// Types for nanobot Web Chat

export interface Session {
  id: string;
  summary: string;
  lastActiveAt: string;
  messageCount: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

/** A single progress step during task execution */
export interface ProgressStep {
  /** Display text (e.g. "exec → result summary") */
  text: string;
  /** Step type: undefined = thinking text, 'tool_hint' = tool call hint, 'tool_result' = tool execution result, 'user_inject' = user injected message */
  type?: 'tool_hint' | 'tool_result' | 'user_inject';
  /** Tool name (for tool_hint and tool_result types) */
  name?: string;
  /** Full tool output content (only for tool_result type, for expand/collapse) */
  content?: string;
}

export type TabKey = 'chat' | 'usage' | 'config' | 'memory' | 'skills';

/** Per-session task execution state */
export interface SessionTask {
  sending: boolean;
  progressSteps: ProgressStep[];
  recovering: boolean;
  abortController: AbortController | null;
}

export interface MessagesResponse {
  messages: Message[];
  hasMore: boolean;
}

export interface SessionsResponse {
  sessions: Session[];
}
