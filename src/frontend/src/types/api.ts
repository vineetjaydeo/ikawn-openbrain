// ── API Data Types ──
// Derived from chat-api.js, actions.js, mission-control.js, upload.js, auth-routes.js

export interface User {
  id: number
  email: string
  name: string
  role: 'user' | 'admin'
  status?: string
}

export interface Conversation {
  id: string // UUID
  title: string
  hashtags: string[]
  updated_at: string
  draft_text?: string | null
  share_token?: string | null
  context_summary?: ContextSummary | null
}

export interface ContextSummary {
  topic?: string
  complexity?: 'casual' | 'standard' | 'complex'
  bullets?: Array<{ text: string }>
  decisions?: string[]
  open_questions?: string[]
}

export interface Message {
  id: number
  conversation_id: number // internal integer id
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
  model?: string
  tier?: string
  created_at: string
}

export interface Attachment {
  type: 'image' | 'document' | 'link'
  url: string
  name?: string
  filename?: string
  contentType?: string
  extracted_text?: string
}

export interface ConversationDetail extends Conversation {
  messages: Message[]
}

export interface GalleryImage {
  url: string
  thumbnail: string
  filename: string
  source: 'generation' | 'chat'
  agent?: string
  conversation?: string
  date: string
}

export interface MentionItem {
  type: 'agent' | 'person'
  slug: string
  name: string
  role?: string
}

export interface ToolItem {
  name: string
  description: string
  tier: string
}

export interface PresignResponse {
  uploadUrl: string
  publicUrl: string
  key: string
}

export interface DirectUploadResponse {
  url: string
  key: string
  extracted_text?: string
}

// ── SSE Event Types ──
// Mirrors the exact event shapes written by chat-api.js res.write()

export type ChatSSEEvent =
  | { type: 'chunk'; text: string }
  | { type: 'tool_start'; tool: string; detail?: string }
  | { type: 'tool_done'; tool: string; success: boolean; error?: string }
  | { type: 'tool_gated'; tool: string; approvalRequired?: string }
  | { type: 'tool_error'; tool: string; error?: string; suspended?: boolean; needsReview?: boolean }
  | { type: 'generation_started'; generationId: string; agent: string; prompt: string; batchSize: number }
  | { type: 'agent_identity'; slug?: string; name: string; role?: string; agent?: string }
  | { type: 'tier_switch'; tier: string; label: string }
  | { type: 'title'; title: string }
  | { type: 'done'; message_id?: number; conversation_id?: string; context_summary?: ContextSummary }
  | { type: 'error'; error: string }
