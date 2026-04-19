import { useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import { ChatView } from '@/components/chat/ChatView'
import { useChatStore } from '@/stores/chat'

export default function Chat() {
  const params = useParams({ strict: false })
  const conversationId = (params as { conversationId?: string }).conversationId ?? null
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const clearMessages = useChatStore((s) => s.clearMessages)

  useEffect(() => {
    setActiveConversation(conversationId)
    if (!conversationId) {
      clearMessages()
    }
  }, [conversationId, setActiveConversation, clearMessages])

  return <ChatView />
}
