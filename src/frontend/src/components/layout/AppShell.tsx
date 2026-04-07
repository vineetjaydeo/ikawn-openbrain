import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUIStore } from '@/stores/ui-store'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { toast } from 'sonner'
import type { User } from '@/hooks/useAuth'
import type { Conversation } from '@/components/chat/ConversationItem'

interface AppShellProps {
  children: ReactNode
  user: User | null
  onLogout: () => void
}

const MOBILE_BREAKPOINT = 768

export function AppShell({ children, user, onLogout }: AppShellProps) {
  const navigate = useNavigate()
  const { id: activeConversationId } = useParams<{ id: string }>()
  const { isMobile, setIsMobile, sidebarExpanded } = useUIStore()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const composeRef = useRef<HTMLTextAreaElement>(null)

  // Detect mobile
  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [setIsMobile])

  // Fetch conversations
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      } else if (res.status === 401 || res.redirected) {
        // Session expired
        navigate('/login', { replace: true })
      }
    } catch {
      // Network error — silently ignore
    }
  }, [navigate])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Re-fetch on visibility change (tab comes back)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') loadConversations()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [loadConversations])

  async function handleNewChat() {
    navigate('/chat')
  }

  async function handleRename(uuid: string, newTitle: string) {
    // Optimistic: update title instantly
    const prev = conversations.find((c) => c.uuid === uuid)
    const oldTitle = prev?.title ?? ''
    setConversations((list) =>
      list.map((c) => (c.uuid === uuid ? { ...c, title: newTitle } : c))
    )
    try {
      const res = await fetch(`/api/conversations/${uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
      if (!res.ok) throw new Error('rename failed')
    } catch {
      // Rollback
      setConversations((list) =>
        list.map((c) => (c.uuid === uuid ? { ...c, title: oldTitle } : c))
      )
      toast.error('Failed to rename, reverted')
    }
  }

  async function handleDelete(uuid: string) {
    // Optimistic: remove from sidebar instantly
    const removed = conversations.find((c) => c.uuid === uuid)
    setConversations((list) => list.filter((c) => c.uuid !== uuid))
    const wasViewing = window.location.pathname.includes(uuid)
    if (wasViewing) navigate('/chat')

    try {
      const res = await fetch(`/api/conversations/${uuid}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
    } catch {
      // Rollback
      if (removed) {
        setConversations((list) => [...list, removed].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        ))
      }
      toast.error('Failed to delete, reverted')
    }
  }

  // Focus compose bar (Cmd+K shortcut)
  const focusCompose = useCallback(() => {
    // Find the compose textarea in the DOM
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder*="Message"]'
    )
    textarea?.focus()
  }, [])

  // Delete current conversation (Cmd+Shift+Backspace shortcut)
  const deleteCurrentConversation = useCallback(() => {
    if (activeConversationId) {
      const conv = conversations.find((c) => c.uuid === activeConversationId)
      if (conv && window.confirm(`Delete "${conv.title || 'this conversation'}"?`)) {
        handleDelete(activeConversationId)
      }
    }
  }, [activeConversationId, conversations])

  // Wire keyboard shortcuts
  useKeyboardShortcuts({
    onNewChat: handleNewChat,
    onDeleteConversation: deleteCurrentConversation,
    onFocusCompose: focusCompose,
  })

  // Listen for custom delete-conversation event from ChatPage (Cmd+Shift+Backspace)
  useEffect(() => {
    function handleCustomDelete(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.id) {
        const conv = conversations.find((c) => c.uuid === detail.id)
        if (conv && window.confirm(`Delete "${conv.title || 'this conversation'}"?`)) {
          handleDelete(detail.id)
        }
      }
    }
    window.addEventListener('delete-conversation', handleCustomDelete)
    return () => window.removeEventListener('delete-conversation', handleCustomDelete)
  }, [conversations]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[hsl(var(--background))]">
      <ChatSidebar
        user={user}
        conversations={conversations}
        onNewChat={handleNewChat}
        onRename={handleRename}
        onDelete={handleDelete}
        onLogout={onLogout}
      />

      {/* Main content area */}
      <main
        className={`flex-1 flex flex-col min-w-0 h-screen transition-[margin] duration-250 ${
          isMobile ? 'ml-0' : 'ml-12'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {children}
      </main>
    </div>
  )
}

/** Re-export for convenience — pages can call this to refresh the conversation list */
export { type Conversation }
