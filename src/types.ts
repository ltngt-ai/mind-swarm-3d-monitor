// TypeScript types for Mind Swarm Backend API

export interface CyberInfo {
  type: string;
  state: string;
  premium: boolean;
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
export interface WebSocketMessage {
  type: string;
  data?: any;
}

export interface AgentCreatedEvent {
  name: string;
  cyber_type: string;
  config?: object;
}

export interface AgentTerminatedEvent {
  name: string;
}

export interface AgentStateChangedEvent {
  name: string;
  old_state: string;
  new_state: string;
}

export interface AgentThinkingEvent {
  name: string;
  thought?: string;
  token_count?: number;
}

export interface FileActivityEvent {
  path: string;
  action: string;
  activity_level?: number;
}

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