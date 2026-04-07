import { useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUIStore } from '@/stores/ui-store'

interface KeyboardShortcutOptions {
  onNewChat: () => void
  onDeleteConversation?: () => void
  onFocusCompose?: () => void
}

export function useKeyboardShortcuts({
  onNewChat,
  onDeleteConversation,
  onFocusCompose,
}: KeyboardShortcutOptions) {
  const { toggleSidebar } = useUIStore()
  const navigate = useNavigate()
  const { id: conversationId } = useParams<{ id: string }>()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      // Escape — close modals/dropdowns, blur inputs
      if (e.key === 'Escape') {
        if (isInput) {
          ;(target as HTMLElement).blur()
          return
        }
        // Let individual modal handlers deal with Escape via their own listeners
        return
      }

      // Cmd/Ctrl + K — focus compose bar
      if (meta && e.key === 'k') {
        e.preventDefault()
        onFocusCompose?.()
        return
      }

      // Cmd/Ctrl + N — new conversation
      if (meta && e.key === 'n') {
        e.preventDefault()
        onNewChat()
        return
      }

      // Cmd/Ctrl + / — toggle sidebar
      if (meta && e.key === '/') {
        e.preventDefault()
        toggleSidebar()
        return
      }

      // Cmd/Ctrl + Shift + Backspace — delete current conversation
      if (meta && e.shiftKey && e.key === 'Backspace') {
        e.preventDefault()
        if (conversationId && onDeleteConversation) {
          onDeleteConversation()
        }
        return
      }
    },
    [onNewChat, onDeleteConversation, onFocusCompose, toggleSidebar, conversationId],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
