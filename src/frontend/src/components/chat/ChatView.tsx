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
import { ChatInput } from '@/components/chat/ChatInput'
import { useChatStore } from '@/stores/chat'
import { useUIStore } from '@/stores/ui'
import { useConversationDetail } from '@/hooks/useConversations'

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="mb-4 text-5xl gold-glow text-primary" aria-hidden="true">
        {'\u2726'}
      </span>
      <h3 className="text-xl font-semibold tracking-tight text-foreground">
        Start a conversation
      </h3>
      <p
        className={cn(
          'mt-3 max-w-sm text-sm text-muted-foreground leading-relaxed',
          'font-[var(--font-serif)]'
        )}
      >
        Ask Lucy anything about your brand, strategy, content, or data.
        She will research, analyze, and deliver actionable insights.
      </p>
      <p className="mt-6 text-xs text-muted-foreground/40">Press Enter to send</p>
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
  const isMobile = useUIStore((s) => s.isMobile)
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)

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

  const conversationTitle = detail?.conversation?.title

  // Auto-scroll to bottom on new messages or streaming updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const showEmpty = !activeConversationId && messages.length === 0
  const showSkeleton = !!activeConversationId && isLoadingMessages && messages.length === 0

  return (
    <div className="flex h-full w-full bg-background">
      {/* Desktop sidebar */}
      {!isMobile && <ConversationList />}

      {/* Main message area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-[rgba(255,255,255,0.06)] px-5 py-3.5 bg-[rgba(255,255,255,0.015)]">
          {isMobile && (
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon-sm" />
                }
              >
                <Menu className="text-muted-foreground" />
              </SheetTrigger>
              <SheetContent side="left" showCloseButton={false} className="w-80 p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Conversations</SheetTitle>
                </SheetHeader>
                <ConversationList />
              </SheetContent>
            </Sheet>
          )}
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
            {conversationTitle ?? 'New conversation'}
          </span>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
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
