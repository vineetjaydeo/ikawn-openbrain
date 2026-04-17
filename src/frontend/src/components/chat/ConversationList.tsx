import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useChatStore } from '@/stores/chat'
import { useUIStore } from '@/stores/ui'

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
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

export function ConversationList() {
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)
  const isMobile = useUIStore((s) => s.isMobile)

  function handleSelect(id: string) {
    setActiveConversation(id)
    if (isMobile) {
      setSidebarOpen(false)
    }
  }

  function handleNewChat() {
    setActiveConversation(null)
    if (isMobile) {
      setSidebarOpen(false)
    }
  }

  return (
    <div className="flex h-full w-80 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleNewChat}
          aria-label="New conversation"
        >
          <Plus className="text-primary" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleSelect(conv.id)}
              className={cn(
                'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                'hover:bg-accent/50',
                activeConversationId === conv.id
                  ? 'border-l-2 border-l-primary bg-accent'
                  : 'border-l-2 border-l-transparent'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {conv.title}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(conv.updatedAt)}
                </span>
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {conv.lastMessage}
              </span>
            </button>
          ))}

          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">No conversations yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Start a new chat with Lucy
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
