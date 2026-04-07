export interface Attachment {
  id: string
  type: 'image' | 'document' | 'link'
  url: string
  filename?: string
  mimeType?: string
  extractedText?: string
  thumbnailUrl?: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
  created_at: string
  agent_identity?: string
  tier?: string
  reply_to?: string
}

export interface ToolEvent {
  type: 'tool_start' | 'tool_done'
  name: string
  result?: string
  success?: boolean
}

export interface GenerationEvent {
  id: string
  agent: string
  prompt: string
  status: 'pending' | 'in_progress' | 'complete' | 'failed'
  images?: string[]
  error?: string
}

export interface ContextSummary {
  topic?: string
  complexity?: 'low' | 'medium' | 'high'
  bullets?: string[]
  decisions?: string[]
  open_questions?: string[]
  updated_at?: string
}

export type ModelTier = 'regular' | 'pro' | 'expert'

export interface SSEEvent {
  type: 'chunk' | 'tool_start' | 'tool_done' | 'agent_identity' | 'tier_switch' | 'generation_started' | 'generation_progress' | 'generation_complete' | 'generation_failed' | 'context_summary' | 'done' | 'error'
  data: string
}
