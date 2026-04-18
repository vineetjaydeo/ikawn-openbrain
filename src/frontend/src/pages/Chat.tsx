import { useEffect, useCallback } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useTheme } from '@/design/tokens'
import { Screen_Home } from '@/design/screens-a'
import { useChatStore } from '@/stores/chat'

export default function Chat() {
  const params = useParams({ strict: false })
  const navigate = useNavigate()
  const t = useTheme()
  const conversationId = (params as { conversationId?: string }).conversationId ?? null
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const clearMessages = useChatStore((s) => s.clearMessages)

  useEffect(() => {
    setActiveConversation(conversationId)
    if (!conversationId) {
      clearMessages()
    }
  }, [conversationId, setActiveConversation, clearMessages])

  const handleNavigate = useCallback(
    (screen: string) => {
      const routes: Record<string, string> = {
        chat: '/chat',
        memory: '/memory',
        brands: '/brands',
        knowledge: '/knowledge',
        insights: '/insights',
        settings: '/settings',
      }
      const target = routes[screen] || '/chat'
      navigate({ to: target })
    },
    [navigate],
  )

  return <Screen_Home t={t} onNavigate={handleNavigate} />
}
