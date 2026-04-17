import { useEffect, useRef } from 'react'
import { Menu } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <span className="mb-4 text-4xl text-primary" aria-hidden="true">
        {'\u2726'}
      </span>
      <h3 className="text-lg font-semibold text-foreground">
        Start a conversation
      </h3>
      <p
        className={cn(
          'mt-2 max-w-sm text-sm text-muted-foreground',
          'font-[var(--font-serif)]'
        )}
      >
        Ask Lucy anything about your brand, strategy, content, or data.
        She will research, analyze, and deliver actionable insights.
      </p>
    </div>
  )
}

export function ChatView() {
  const messages = useChatStore((s) => s.messages)
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const isMobile = useUIStore((s) => s.isMobile)
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  )

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex h-full w-full bg-background">
      {/* Desktop sidebar */}
      {!isMobile && <ConversationList />}

      {/* Main message area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
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
          <span className="truncate text-sm font-medium text-foreground">
            {activeConversation?.title ?? 'New conversation'}
          </span>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="flex flex-col gap-6">
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
