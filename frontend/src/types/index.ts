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

export type TabKey = 'chat' | 'config' | 'memory' | 'skills';

export interface MessagesResponse {
  messages: Message[];
  hasMore: boolean;
}

export interface SessionsResponse {
  sessions: Session[];
}
