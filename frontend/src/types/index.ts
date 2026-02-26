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
  /** Step type: undefined = normal progress, 'tool_result' = tool execution result */
  type?: 'tool_result';
  /** Tool name (only for tool_result type) */
  name?: string;
  /** Full tool output content (only for tool_result type, for expand/collapse) */
  content?: string;
}

export type TabKey = 'chat' | 'usage' | 'config' | 'memory' | 'skills';

export interface MessagesResponse {
  messages: Message[];
  hasMore: boolean;
}

export interface SessionsResponse {
  sessions: Session[];
}
