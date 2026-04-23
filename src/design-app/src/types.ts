export interface Design {
  id: string;
  user_id: string;
  brand_id: string;
  name: string;
  thumbnail_text: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignSnapshot {
  id: string;
  design_id: string;
  parent_id: string | null;
  type: 'initial' | 'edit' | 'fork';
  prompt: string | null;
  artifact_type: 'html' | 'react' | 'svg';
  artifact_source: string | null;
  message: string | null;
  created_at: string;
}

export interface ChatMessageRow {
  seq: number;
  design_id: string;
  kind: 'user' | 'assistant_text' | 'tool_call' | 'artifact_delivered' | 'error';
  payload: Record<string, unknown>;
  snapshot_id: string | null;
  created_at: string;
}

export interface TodoItem {
  label: string;
  done: boolean;
}

export type GenerationStage =
  | 'idle'
  | 'sending'
  | 'thinking'
  | 'streaming'
  | 'done'
  | 'error';

export interface AgentStreamEvent {
  type: string;
  [key: string]: unknown;
}
