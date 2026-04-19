import { Plus, Trash2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useChatStore } from '@/stores/chat'
import { useUIStore } from '@/stores/ui'
import { useConversations } from '@/hooks/useConversations'

function timeAgo(date: Date | string | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

function ConversationsSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5 px-3 py-2.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  )
}

export function ConversationList() {
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)
  const isMobile = useUIStore((s) => s.isMobile)
  const navigate = useNavigate()

  const {
    conversations,
    isLoading,
    create,
    isCreating,
    remove,
  } = useConversations()

  function handleSelect(id: string) {
    navigate({ to: '/chat/$conversationId', params: { conversationId: id } })
    if (isMobile) setSidebarOpen(false)
  }

  async function handleNewChat() {
    clearMessages()
    setActiveConversation(null)
    navigate({ to: '/chat' })
    if (isMobile) setSidebarOpen(false)
    try {
      const result = await create('New conversation')
      const newId = result.id
      navigate({ to: '/chat/$conversationId', params: { conversationId: newId } })
    } catch {
      // Creation failed - stay on new chat screen
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    try {
      await remove(id)
      if (activeConversationId === id) {
        clearMessages()
        setActiveConversation(null)
        navigate({ to: '/chat' })
      }
    } catch {
      // Delete failed silently
    }
  }

  return (
    <div className="flex h-full w-80 flex-col border-r border-border bg-[#111113]">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
      </div>

      <Button
        variant="secondary"
        className="mx-3 mb-2 mt-3 w-auto justify-start gap-2 text-sm"
        onClick={handleNewChat}
        disabled={isCreating}
      >
        <Plus size={16} />
        <span>{isCreating ? 'Creating...' : 'New chat'}</span>
      </Button>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <ConversationsSkeleton />
        ) : (
          <div className="flex flex-col gap-0.5 px-2 pb-2">
            {conversations?.map((conv) => {
              const isActive = activeConversationId === conv.id
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelect(conv.id)}
                  className={cn(
                    'group flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left',
                    'border-l-2 transition-all duration-150',
                    'hover:bg-[rgba(255,255,255,0.04)] hover:translate-x-0.5',
                    isActive
                      ? 'bg-[rgba(255,192,28,0.08)] border-l-primary'
                      : 'border-l-transparent'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'truncate text-sm',
                        isActive
                          ? 'text-foreground font-semibold'
                          : 'text-foreground/80 font-medium'
                      )}
                    >
                      {conv.title || 'Untitled'}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(conv.updated_at ?? conv.updatedAt)}
                      </span>
                      <button
                        onClick={(e) => handleDelete(e, conv.id)}
                        className="hidden rounded p-0.5 text-muted-foreground/50 hover:text-destructive group-hover:block"
                        aria-label="Delete conversation"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {conv.lastMessage && (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {conv.lastMessage}
                    </span>
                  )}
                </button>
              )
            })}

            {(!conversations || conversations.length === 0) && (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <span className="text-5xl text-primary/30 mb-3">{'\u2726'}</span>
                <p className="text-sm text-muted-foreground">No conversations yet</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Start a new chat with Lucy
                </p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
