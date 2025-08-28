/*
  Typed WebSocket event envelopes for Mind‑Swarm monitor.
  Shape: { type: string, data: object, timestamp: string }
  Usage:
    import { ServerEvent, isEvent, matchEvent } from './ws/events';
*/

export type EventType =
  | 'agent_state_changed'
  | 'agent_thinking'
  | 'message_sent'
  | 'file_activity'
  | 'system_metrics'
  | 'cycle_started'
  | 'cycle_completed'
  | 'stage_started'
  | 'stage_completed'
  | 'memory_changed'
  | 'message_activity'
  | 'brain_thinking'
  | 'file_operation'
  | 'token_usage'
  | 'agent_created'
  | 'agent_terminated'
  | 'question_created'
  | 'task_created'
  | 'announcement_updated'
  | 'announcements_cleared'
  | 'developer_registered'
  | 'token_boost_applied'
  | 'token_boost_cleared'
  | 'cyber_restarted'
  | 'cyber_paused'
  | 'ping';

export interface EventEnvelope<TType extends EventType = EventType, TData = any> {
  type: TType;
  data: TData;
  timestamp: string;
}

// Per-event typed aliases
export type AgentCreated = EventEnvelope<'agent_created', {
  name: string;
  cyber_type?: string;
  config?: Record<string, unknown>;
  current_location?: string;
}>
export type AgentTerminated = EventEnvelope<'agent_terminated', { name: string }>
export type QuestionCreated = EventEnvelope<'question_created', { question_id: string; text: string; created_by: string }>
export type TaskCreated = EventEnvelope<'task_created', { task_id: string; summary: string; created_by: string }>
export type AnnouncementUpdated = EventEnvelope<'announcement_updated', { title: string; message: string; priority: string }>
export type AnnouncementsCleared = EventEnvelope<'announcements_cleared', {}>
export type DeveloperRegistered = EventEnvelope<'developer_registered', { name: string; cyber_name: string }>
export type TokenBoostApplied = EventEnvelope<'token_boost_applied', { cyber_id: string; multiplier: number; duration_hours: number }>
export type TokenBoostCleared = EventEnvelope<'token_boost_cleared', { cyber_id: string }>
export type CyberRestarted = EventEnvelope<'cyber_restarted', { name: string }>
export type CyberPaused = EventEnvelope<'cyber_paused', { name: string }>
export type Ping = EventEnvelope<'ping', { }>

// Monitoring events (kept loose on purpose; refine as needed)
export type AgentStateChanged = EventEnvelope<'agent_state_changed', { name: string; old_state: string; new_state: string }>
export type AgentThinking = EventEnvelope<'agent_thinking', { name: string; thought: string; token_count?: number }>
export type MessageSent = EventEnvelope<'message_sent', { from: string; to: string; subject: string }>
export type FileActivity = EventEnvelope<'file_activity', { cyber: string; action: string; path: string }>
export type SystemMetrics = EventEnvelope<'system_metrics', Record<string, unknown>>
export type CycleStarted = EventEnvelope<'cycle_started', { cyber: string; cycle_number: number }>
export type CycleCompleted = EventEnvelope<'cycle_completed', { cyber: string; cycle_number: number; duration_ms: number }>
export type StageStarted = EventEnvelope<'stage_started', { cyber: string; cycle_number: number; stage: string }>
export type StageCompleted = EventEnvelope<'stage_completed', { cyber: string; cycle_number: number; stage: string; stage_data?: Record<string, unknown> }>
export type MemoryChanged = EventEnvelope<'memory_changed', { cyber: string; cycle_number: number; operation: string; memory_info: Record<string, unknown> }>
export type MessageActivity = EventEnvelope<'message_activity', { from: string; to: string; from_cycle: number; message_type: string; content: Record<string, unknown> }>
export type BrainThinking = EventEnvelope<'brain_thinking', { cyber: string; cycle_number: number; stage: string; request: Record<string, unknown>; response?: Record<string, unknown> }>
export type FileOperation = EventEnvelope<'file_operation', { cyber: string; cycle_number: number; operation: string; path: string; details?: Record<string, unknown> }>
export type TokenUsage = EventEnvelope<'token_usage', { cyber: string; cycle_number: number; stage: string; tokens: Record<string, number> }>

export type ServerEvent =
  | AgentCreated | AgentTerminated
  | QuestionCreated | TaskCreated
  | AnnouncementUpdated | AnnouncementsCleared
  | DeveloperRegistered
  | TokenBoostApplied | TokenBoostCleared
  | CyberRestarted | CyberPaused
  | AgentStateChanged | AgentThinking | MessageSent | FileActivity | SystemMetrics
  | CycleStarted | CycleCompleted | StageStarted | StageCompleted
  | MemoryChanged | MessageActivity | BrainThinking | FileOperation | TokenUsage
  | Ping
  | EventEnvelope; // fallback envelope for any future event

export function isEvent(x: unknown): x is EventEnvelope {
  return !!x && typeof x === 'object' &&
    typeof (x as any).type === 'string' &&
    typeof (x as any).timestamp === 'string' &&
    'data' in (x as any);
}

export function parseEvent(raw: string | unknown): EventEnvelope | null {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as EventEnvelope; } catch { return null; }
  }
  if (isEvent(raw)) return raw;
  return null;
}

export type EventHandlers = Partial<{ [K in EventType]: (e: Extract<ServerEvent, { type: K }>) => void } & { '*': (e: ServerEvent) => void }>

export function matchEvent(e: ServerEvent, handlers: EventHandlers): void {
  const h = (handlers as any)[e.type];
  if (typeof h === 'function') { h(e as any); return; }
  const star = (handlers as any)['*'];
  if (typeof star === 'function') { star(e); }
}

// Example tiny helper to safely read known event payloads
export function getEventData<T extends ServerEvent['type']>(e: ServerEvent, type: T): Extract<ServerEvent, { type: T }>['data'] | null {
  return e.type === type ? (e as any).data : null;
}
