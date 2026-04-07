import { useRef, useEffect, useState, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MessageBubble, DateSeparator } from '@/components/chat/MessageBubble'
import { StreamingMessage } from '@/components/chat/StreamingMessage'
import { GenerationCard } from '@/components/chat/GenerationCard'
import { ContextCard } from '@/components/chat/ContextCard'
import type { Message, ToolEvent, GenerationEvent, ContextSummary } from '@/types/chat'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string
  toolEvents: ToolEvent[]
  agentIdentity?: string
  tierSwitch?: string
  generations: GenerationEvent[]
  contextSummary?: ContextSummary
  onImageClick: (src: string) => void
  onResend?: (content: string) => void
  onEdit?: (id: string, content: string) => void
}

/** Check if two dates are on different days */
function isDifferentDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() !== db.getFullYear() ||
    da.getMonth() !== db.getMonth() ||
    da.getDate() !== db.getDate()
  )
}

function SkeletonMessage({ isUser }: { isUser: boolean }) {
  return (
    <div className={cn('flex gap-3.5', isUser && 'justify-end')}>
      {!isUser && (
        <div className="w-[26px] h-[26px] rounded-full bg-[hsl(var(--muted))] shrink-0 animate-skeleton-pulse" />
      )}
      <div className="flex flex-col gap-1.5">
        <div
          className={cn(
            'animate-skeleton-pulse rounded-[14px]',
            isUser
              ? 'bg-[var(--surface-2)] h-10 w-48'
              : 'bg-[hsl(var(--muted))] h-4 w-72'
          )}
        />
        {!isUser && <div className="animate-skeleton-pulse rounded-[14px] bg-[hsl(var(--muted))] h-4 w-56" />}
        {!isUser && <div className="animate-skeleton-pulse rounded-[14px] bg-[hsl(var(--muted))] h-4 w-40" />}
      </div>
    </div>
  )
}

export function MessageList({
  messages,
  isLoading,
  isStreaming,
  streamingContent,
  toolEvents,
  agentIdentity,
  tierSwitch,
  generations,
  contextSummary,
  onImageClick,
  onResend,
  onEdit,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const isNearBottomRef = useRef(true)

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const threshold = 150
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    isNearBottomRef.current = atBottom
    setShowScrollBtn(!atBottom)
  }, [])

  // Auto-scroll on new messages when near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingContent, toolEvents, generations])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-transparent scrollbar-thin"
    >
      <div className="max-w-[768px] mx-auto px-6 pt-6 pb-36 flex flex-col gap-5 md:px-4">
        {/* Context card */}
        {contextSummary && <ContextCard summary={contextSummary} />}

        {/* Loading skeleton */}
        {isLoading && (
          <>
            <SkeletonMessage isUser={false} />
            <SkeletonMessage isUser={true} />
            <SkeletonMessage isUser={false} />
          </>
        )}

        {/* Messages */}
        {!isLoading &&
          messages.map((msg, i) => {
            const prevMsg = messages[i - 1]
            const showDateSep =
              i === 0 ||
              (prevMsg && isDifferentDay(prevMsg.created_at, msg.created_at))

            return (
              <div key={msg.id}>
                {showDateSep && <DateSeparator date={msg.created_at} />}
                <MessageBubble message={msg} onImageClick={onImageClick} onResend={onResend} onEdit={onEdit} />
              </div>
            )
          })}

        {/* Generation cards */}
        {generations.map((gen) => (
          <GenerationCard
            key={gen.id}
            generation={gen}
            onImageClick={onImageClick}
          />
        ))}

        {/* Streaming message — aria-live for screen readers */}
        <div aria-live="polite" aria-atomic="false">
          {isStreaming && (
            <StreamingMessage
              content={streamingContent}
              toolEvents={toolEvents}
              agentIdentity={agentIdentity}
              tierSwitch={tierSwitch}
              isStreaming={isStreaming}
            />
          )}
        </div>

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className={cn(
            'fixed bottom-28 left-1/2 -translate-x-1/2 z-20',
            'w-9 h-9 rounded-full flex items-center justify-center',
            'bg-[var(--surface-3)] border border-[hsl(var(--border))]',
            'text-[var(--text-secondary)] cursor-pointer',
            'shadow-lg transition-all hover:bg-[hsl(var(--muted))]',
            'hover:text-[var(--text)]'
          )}
          title="Scroll to bottom"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
