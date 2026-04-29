import { create } from 'zustand'

export interface Artifact {
  /** Tool that produced this artifact. */
  tool: string
  /** Public R2 url to the rendered artifact (HTML for now). */
  url: string
  /** Display title (used in card header and PDF filename). */
  title?: string
  /** Underlying filename on R2 (e.g. "report-2026-04-29-abc12345.html"). */
  filename?: string
  /** MIME type / artifact type. Defaults to 'html'. */
  type?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  timestamp?: Date
  attachments?: { name: string; type: string; url: string }[]
  /** Tool-produced artifacts attached to this assistant turn. */
  artifacts?: Artifact[]
  isStreaming?: boolean
  incomplete?: boolean
}

export interface Conversation {
  id: string
  title: string
  created_at?: string
  updated_at?: string
  /** Derived client-side from last message or updated_at */
  lastMessage?: string
  updatedAt?: Date
}

export interface TaskProgress {
  current_slide: number
  total_slides: number
  phase: string
}

export interface ActiveTask {
  taskId: number
  taskType: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress?: TaskProgress
  result?: { url: string; filename: string; slideCount: number }
  error?: string
  startedAt: number
}

interface ChatState {
  activeConversationId: string | null
  messages: Message[]
  isStreaming: boolean
  draftText: string
  activeTasks: ActiveTask[]
  setActiveConversation: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateStreamingMessage: (content: string) => void
  attachArtifactToStreamingMessage: (artifact: Artifact) => void
  setIsStreaming: (streaming: boolean) => void
  setDraftText: (text: string) => void
  clearMessages: () => void
  addActiveTask: (task: Omit<ActiveTask, 'startedAt'>) => void
  updateActiveTask: (taskId: number, updates: Partial<ActiveTask>) => void
  markLastMessageIncomplete: () => void
  clearActiveTasks: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  draftText: '',
  activeTasks: [],
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateStreamingMessage: (content) =>
    set((state) => {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.isStreaming) {
        msgs[msgs.length - 1] = { ...last, content }
      }
      return { messages: msgs }
    }),
  attachArtifactToStreamingMessage: (artifact) =>
    set((state) => {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant') {
        const existing = last.artifacts || []
        // Dedupe by url — same tool can fire artifact_ready twice on retries.
        if (existing.some((a) => a.url === artifact.url)) return state
        msgs[msgs.length - 1] = { ...last, artifacts: [...existing, artifact] }
      }
      return { messages: msgs }
    }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setDraftText: (text) => set({ draftText: text }),
  clearMessages: () => set({ messages: [], activeTasks: [] }),
  markLastMessageIncomplete: () =>
    set((state) => {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, incomplete: true, isStreaming: false }
      }
      return { messages: msgs }
    }),
  addActiveTask: (task) => set((state) => {
    if (state.activeTasks.some(t => t.taskId === task.taskId)) return state;
    return { activeTasks: [...state.activeTasks, { ...task, startedAt: Date.now() }] };
  }),
  updateActiveTask: (taskId, updates) => set((state) => ({
    activeTasks: state.activeTasks.map(t => t.taskId === taskId ? { ...t, ...updates } : t)
  })),
  clearActiveTasks: () => set({ activeTasks: [] }),
}))
