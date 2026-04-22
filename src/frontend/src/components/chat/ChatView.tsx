import { useEffect, useRef } from 'react'
import { Menu } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ConversationList } from '@/components/chat/ConversationList'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { TaskProgressCard } from '@/components/chat/TaskProgressCard'
import { ChatInput } from '@/components/chat/ChatInput'
import { useChatStore } from '@/stores/chat'
import { useUIStore } from '@/stores/ui'
import { useConversationDetail } from '@/hooks/useConversations'
import { useTaskPolling } from '@/hooks/useTaskPolling'
import { apiFetch } from '@/lib/api'

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        textAlign: 'center',
        padding: '0 24px',
      }}
    >
      <span
        style={{
          fontSize: 48,
          color: '#FFC01C',
          fontFamily: 'Parkinsans, sans-serif',
          marginBottom: 16,
        }}
        aria-hidden="true"
      >
        {'\u2726'}
      </span>
      <h3
        style={{
          fontFamily: 'Parkinsans, sans-serif',
          fontSize: 26,
          fontWeight: 600,
          color: '#F5F5F5',
          letterSpacing: '-0.4px',
          margin: 0,
        }}
      >
        What can I help with?
      </h3>
      <p
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 14,
          color: '#A8A8A8',
          maxWidth: 400,
          lineHeight: 1.6,
          marginTop: 12,
        }}
      >
        Ask Lucy anything about your brand, strategy, content, or data.
        She will research, analyze, and deliver actionable insights.
      </p>
    </div>
  )
}

function MessagesSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {/* User message skeleton */}
      <div className="flex justify-end">
        <Skeleton className="h-12 w-2/3 rounded-2xl" />
      </div>
      {/* Assistant message skeleton */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
      {/* Another user message */}
      <div className="flex justify-end">
        <Skeleton className="h-8 w-1/2 rounded-2xl" />
      </div>
      {/* Another assistant message */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  )
}

export function ChatView() {
  const messages = useChatStore((s) => s.messages)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const setMessages = useChatStore((s) => s.setMessages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const activeTasks = useChatStore((s) => s.activeTasks)
  const isMobile = useUIStore((s) => s.isMobile)
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)

  useTaskPolling()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch conversation detail (messages) when activeConversationId changes
  const { data: detail, isLoading: isLoadingMessages } =
    useConversationDetail(activeConversationId)

  // Sync fetched messages into store (only when not streaming, to avoid overwriting)
  useEffect(() => {
    if (detail?.messages && !isStreaming) {
      setMessages(detail.messages)
    }
  }, [detail?.messages, isStreaming, setMessages])

  // Restore active tasks on page load / conversation switch
  const addActiveTask = useChatStore((s) => s.addActiveTask)
  const clearActiveTasks = useChatStore((s) => s.clearActiveTasks)
  useEffect(() => {
    if (!activeConversationId || isStreaming) return
    apiFetch<Array<{ id: number; task_type: string; status: string; progress: unknown; result: unknown; error_message: string | null; created_at: string }>>(
      `/api/tasks/active/${activeConversationId}`
    ).then((tasks) => {
      clearActiveTasks()
      for (const t of tasks) {
        if (t.status === 'pending' || t.status === 'running') {
          addActiveTask({
            taskId: t.id,
            taskType: t.task_type || 'unknown',
            status: t.status as 'pending' | 'running' | 'completed' | 'failed',
            progress: t.progress as undefined,
            result: t.result as undefined,
            error: t.error_message || undefined,
          })
        }
      }
    }).catch(() => { /* best-effort */ })
  }, [activeConversationId, isStreaming, addActiveTask, clearActiveTasks])

  const conversationTitle = detail?.title

  // Auto-scroll to bottom on new messages or streaming updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const showEmpty = !activeConversationId && messages.length === 0
  const showSkeleton = !!activeConversationId && isLoadingMessages && messages.length === 0

  return (
    <div className="flex h-full w-full" style={{ background: '#0A0A0A' }}>
      {/* Conversation list as overlay sheet — triggered from header */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-80 p-0" style={{ background: '#111113' }}>
          <SheetHeader className="sr-only">
            <SheetTitle>Conversations</SheetTitle>
          </SheetHeader>
          <ConversationList />
        </SheetContent>
      </Sheet>

      {/* Main message area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div
          style={{
            height: 60,
            padding: '0 28px',
            borderBottom: '1px solid #2A2A2A',
            background: '#0A0A0A',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#A8A8A8',
              flexShrink: 0,
            }}
            aria-label="Open conversations"
          >
            <Menu size={16} />
          </button>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#F5F5F5',
              letterSpacing: '0.1px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {conversationTitle ?? 'New conversation'}
          </span>
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 999,
              border: '1px solid #2A2A2A',
              fontSize: 11,
              color: '#6B6B6B',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Details
          </span>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div
            style={{
              maxWidth: 760,
              margin: '0 auto',
              padding: '24px 32px 8px',
            }}
          >
            {showSkeleton ? (
              <MessagesSkeleton />
            ) : showEmpty ? (
              <EmptyState />
            ) : messages.length === 0 && activeConversationId ? (
              <EmptyState />
            ) : (
              <div className="flex flex-col gap-8">
                <AnimatePresence mode="popLayout">
                  {messages.map((msg) => (
                    <ChatMessage key={msg.id} message={msg} />
                  ))}
                </AnimatePresence>
                {activeTasks.map((task) => (
                  <TaskProgressCard key={task.taskId} task={task} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <ChatInput />
      </div>
    </div>
  )
}
