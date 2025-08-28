// TypeScript types for Mind Swarm Backend API

export interface CyberInfo {
  type: string;
  state: string;
  premium: boolean;
  current_location?: string;
}

export interface StatusResponse {
  Cybers: Record<string, CyberInfo>;
  community_questions: number;
  server_uptime: number;
  server_start_time: string;
  local_llm_status?: object;
}

export interface CybersAllResponse {
  Cybers: Array<{
    name: string;
    agent_id: string;
    type: string;
    state: string;
    premium: boolean;
  }>;
}

export interface CreateCyberRequest {
  name?: string;
  cyber_type: string;
  config?: object;
}

export interface SendMessageRequest {
  content: string;
  message_type: string;
}

export interface SendCommandRequest {
  command: string;
  params: any;
}

// WebSocket Event Types
// Source of truth moved to `src/ws/events.ts`.
// Re-export payload aliases for existing imports to remain stable.
import type {
  EventEnvelope,
  AgentCreated,
  AgentTerminated,
  AgentStateChanged,
  AgentThinking,
  FileActivity,
} from './ws/events';

export type WebSocketMessage = EventEnvelope;
export type AgentCreatedEvent = AgentCreated['data'];
export type AgentTerminatedEvent = AgentTerminated['data'];
export type AgentStateChangedEvent = AgentStateChanged['data'];
export type AgentThinkingEvent = AgentThinking['data'];
export type FileActivityEvent = FileActivity['data'] & { activity_level?: number };

// Developer System Types
export interface DeveloperInfo {
  name: string;
  registered_at: string;
}

export interface MailboxMessage {
  from: string;
  to: string;
  type: string;
  content?: string;
  timestamp: string;
  _read?: boolean;
  _file_path?: string;
}

export interface MailboxResponse {
  messages: MailboxMessage[];
  unread_count: number;
}

export interface MarkAsReadRequest {
  message_index: number;
}

// Filesystem structure types
export interface FilesystemNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  size?: number;
  children?: FilesystemNode[];
  activity_level?: number;
  last_accessed?: string;
}

export interface FilesystemStructure {
  grid: FilesystemNode;
  cyber_homes?: FilesystemNode[];
}

// Community Questions
export interface CommunityQuestion {
  id: number;
  title: string;
  content: string;
  author: string;
  timestamp: string;
  answers: number;
}

export interface CommunityQuestionsResponse {
  questions: CommunityQuestion[];
  total: number;
}
