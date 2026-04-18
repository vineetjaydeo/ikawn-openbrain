import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  timestamp?: Date
  attachments?: { name: string; type: string; url: string }[]
  isStreaming?: boolean
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

interface ChatState {
  activeConversationId: string | null
  messages: Message[]
  isStreaming: boolean
  draftText: string
  setActiveConversation: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateStreamingMessage: (content: string) => void
  setIsStreaming: (streaming: boolean) => void
  setDraftText: (text: string) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  draftText: '',
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
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setDraftText: (text) => set({ draftText: text }),
  clearMessages: () => set({ messages: [] }),
}))
