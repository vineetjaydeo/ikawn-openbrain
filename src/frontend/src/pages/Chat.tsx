import { useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useTheme } from '@/design/tokens'
import { Screen_Home } from '@/design/screens-a'
import type { ChatMessage } from '@/design/data'
import { useChatStore } from '@/stores/chat'
import { useStreamChat } from '@/hooks/useStreamChat'
import { useConversations, useConversationDetail } from '@/hooks/useConversations'

export default function Chat() {
  const params = useParams({ strict: false })
  const navigate = useNavigate()
  const t = useTheme()
  const conversationId = (params as { conversationId?: string }).conversationId ?? null

  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const setMessages = useChatStore((s) => s.setMessages)
  const clearMessages = useChatStore((s) => s.clearMessages)

  const { sendMessage } = useStreamChat()
  const { conversations, create: createConversation } = useConversations()
  const { data: conversationDetail } = useConversationDetail(conversationId)

  // Track active conversation
  useEffect(() => {
    setActiveConversation(conversationId)
    if (!conversationId) {
      clearMessages()
    }
  }, [conversationId, setActiveConversation, clearMessages])

  // Load messages from server -- but don't overwrite if we already have
  // messages in the store (e.g. from optimistic send or active streaming)
  useEffect(() => {
    // API returns messages directly on the conversation detail object
    const msgs = conversationDetail?.messages
    if (msgs && msgs.length > 0) {
      // Only load from server if store is empty (initial load)
      const currentMessages = useChatStore.getState().messages
      if (currentMessages.length === 0) {
        setMessages(msgs as any)
      }
    }
  }, [conversationDetail, setMessages])

  // Convert store messages to design ChatMessage format
  const designMessages: ChatMessage[] = messages.map((m) => ({
    role: m.role === 'assistant' ? 'agent' as const : 'user' as const,
    text: m.content,
    typing: m.isStreaming && !m.content,
  }))

  // Prevent double-creation of conversations
  const creatingRef = useRef(false)

  const handleSend = useCallback(
    async (text: string) => {
      let targetId = conversationId

      // If no active conversation, create one first
      if (!targetId) {
        if (creatingRef.current) return
        creatingRef.current = true
        try {
          const result = await createConversation(text.slice(0, 60))
          targetId = result.id
        } catch {
          creatingRef.current = false
          return
        }
        creatingRef.current = false
      }

      // Send message FIRST (adds optimistic messages to store),
      // then navigate (which may re-mount, but store persists via Zustand)
      sendMessage(targetId, text)

      // Navigate to conversation URL if we just created it
      if (!conversationId && targetId) {
        navigate({ to: `/chat/${targetId}` })
      }
    },
    [conversationId, createConversation, navigate, sendMessage],
  )

  const handleNavigate = useCallback(
    (screen: string) => {
      const routes: Record<string, string> = {
        chat: '/chat',
        memory: '/memory',
        vault: '/vault',
        tasks: '/tasks',
        settings: '/settings',
        admin: '/admin',
      }
      navigate({ to: routes[screen] || '/chat' })
    },
    [navigate],
  )

  // Find conversation title
  const currentConv = conversations?.find((c) => c.id === conversationId)
  const title = currentConv?.title || conversationDetail?.title

  return (
    <Screen_Home
      t={t}
      onNavigate={handleNavigate}
      messages={designMessages}
      onSend={handleSend}
      isStreaming={isStreaming}
      conversationTitle={title}
    />
  )
}
