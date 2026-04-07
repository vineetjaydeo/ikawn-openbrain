import { create } from 'zustand'
import type { Attachment } from '@/types/api'

interface StreamingTool {
  tool: string
  status: 'running' | 'done' | 'error'
  detail?: string
  error?: string
}

interface StreamingAgent {
  slug?: string
  name: string
  role?: string
}

interface StreamingTier {
  tier: string
  label: string
}

interface PendingGeneration {
  id: string
  agent: string
  prompt: string
  batchSize: number
}

interface ChatStore {
  // Active conversation
  activeConversationId: string | null
  setActiveConversation: (id: string | null) => void

  // Streaming state
  isStreaming: boolean
  streamingText: string
  streamingTools: StreamingTool[]
  streamingAgent: StreamingAgent | null
  streamingTier: StreamingTier | null
  pendingGenerations: PendingGeneration[]

  // Stream actions
  startStreaming: () => void
  appendStreamingText: (text: string) => void
  addStreamingTool: (tool: string, detail?: string) => void
  updateStreamingTool: (tool: string, status: 'done' | 'error', error?: string) => void
  setStreamingAgent: (agent: StreamingAgent | null) => void
  setStreamingTier: (tier: StreamingTier | null) => void
  addPendingGeneration: (gen: PendingGeneration) => void
  stopStreaming: () => void
  resetStream: () => void

  // Draft
  draftText: string
  setDraftText: (text: string) => void

  // Attachments
  pendingAttachments: Attachment[]
  addAttachment: (attachment: Attachment) => void
  removeAttachment: (index: number) => void
  clearAttachments: () => void

  // Model tier
  selectedTier: 'regular' | 'pro' | 'expert'
  setSelectedTier: (tier: 'regular' | 'pro' | 'expert') => void
}

export const useChatStore = create<ChatStore>((set) => ({
  // Active conversation
  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),

  // Streaming state
  isStreaming: false,
  streamingText: '',
  streamingTools: [],
  streamingAgent: null,
  streamingTier: null,
  pendingGenerations: [],

  // Stream actions
  startStreaming: () =>
    set({
      isStreaming: true,
      streamingText: '',
      streamingTools: [],
      streamingAgent: null,
      streamingTier: null,
      pendingGenerations: [],
    }),

  appendStreamingText: (text) =>
    set((state) => ({ streamingText: state.streamingText + text })),

  addStreamingTool: (tool, detail) =>
    set((state) => ({
      streamingTools: [...state.streamingTools, { tool, status: 'running' as const, detail }],
    })),

  updateStreamingTool: (tool, status, error) =>
    set((state) => ({
      streamingTools: state.streamingTools.map((t) =>
        t.tool === tool && t.status === 'running' ? { ...t, status, error } : t
      ),
    })),

  setStreamingAgent: (agent) => set({ streamingAgent: agent }),
  setStreamingTier: (tier) => set({ streamingTier: tier }),

  addPendingGeneration: (gen) =>
    set((state) => ({
      pendingGenerations: [...state.pendingGenerations, gen],
    })),

  stopStreaming: () => set({ isStreaming: false }),

  resetStream: () =>
    set({
      isStreaming: false,
      streamingText: '',
      streamingTools: [],
      streamingAgent: null,
      streamingTier: null,
      pendingGenerations: [],
    }),

  // Draft
  draftText: '',
  setDraftText: (text) => set({ draftText: text }),

  // Attachments
  pendingAttachments: [],
  addAttachment: (attachment) =>
    set((state) => ({
      pendingAttachments: [...state.pendingAttachments, attachment],
    })),
  removeAttachment: (index) =>
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((_, i) => i !== index),
    })),
  clearAttachments: () => set({ pendingAttachments: [] }),

  // Model tier
  selectedTier: 'pro',
  setSelectedTier: (tier) => set({ selectedTier: tier }),
}))
