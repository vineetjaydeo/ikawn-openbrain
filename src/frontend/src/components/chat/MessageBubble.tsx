import { useState, useCallback, memo } from 'react'
import { Copy, Check, RotateCcw, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer'
import { MessageAttachments } from '@/components/chat/MessageAttachments'
import type { Message } from '@/types/chat'

interface MessageBubbleProps {
  message: Message
  onImageClick: (src: string) => void
  onResend?: (content: string) => void
  onEdit?: (id: string, content: string) => void
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const MessageBubble = memo(function MessageBubble({ message, onImageClick, onResend, onEdit }: MessageBubbleProps) {
  const [showTimestamp, setShowTimestamp] = useState(false)
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const toggleTimestamp = useCallback(() => {
    setShowTimestamp((prev) => !prev)
  }, [])

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: do nothing
    }
  }, [message.content])

  const handleResend = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onResend?.(message.content)
  }, [message.content, onResend])

  return (
    <div
      className={cn(
        'flex gap-3.5 leading-[1.75] relative group animate-message-enter',
        isUser && 'justify-end'
      )}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
      onClick={toggleTimestamp}
    >
      {/* Gold sparkle for assistant */}
      {!isUser && (
        <div className="w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center text-[0.65rem] font-semibold mt-0.5 bg-[var(--gold)] text-[rgb(5,5,5)]">
          ✦
        </div>
      )}

      <div
        className={cn(
          'text-[0.94rem] leading-[1.75] break-words min-w-0',
          isUser
            ? 'px-4 py-3 bg-[var(--surface-2)] rounded-[14px] max-w-[75%] text-[var(--text)] font-sans'
            : 'py-1 flex-1 font-serif text-[var(--text)]'
        )}
      >
        {/* Agent identity badge */}
        {!isUser && message.agent_identity && (
          <div className="mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-wider bg-gradient-to-r from-[var(--gold)]/20 to-[var(--gold-hover)]/15 text-[var(--gold)] border border-[var(--gold)]/30">
              {message.agent_identity}
            </span>
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <MessageAttachments
            attachments={message.attachments}
            onImageClick={onImageClick}
          />
        )}

        {/* Message content */}
        {isUser ? (
          <span>{message.content}</span>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}

        {/* Tier badge */}
        {!isUser && message.tier && message.tier !== 'regular' && (
          <div className="mt-1">
            <span
              className={cn(
                'text-[0.6rem] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded',
                message.tier === 'expert'
                  ? 'text-[var(--gold)] bg-[var(--gold)]/10'
                  : 'text-[var(--text-tertiary)] bg-white/5'
              )}
            >
              {message.tier}
            </span>
          </div>
        )}
      </div>

      {/* Message actions — hover overlay */}
      <div
        className={cn(
          'absolute flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200',
          'bg-[var(--surface-1)] border border-[hsl(var(--border))] rounded-lg shadow-md px-0.5 py-0.5',
          isUser ? 'left-0 top-1' : 'right-0 top-1'
        )}
      >
        <button
          onClick={handleCopy}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded-md transition-colors duration-200',
            'text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-white/5',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40',
            copied && 'text-green-500'
          )}
          title={copied ? 'Copied!' : 'Copy message'}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>

        {isUser && onResend && (
          <button
            onClick={handleResend}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors duration-200 text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40"
            title="Resend"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}

        {isUser && onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(message.id, message.content) }}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors duration-200 text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Timestamp on hover */}
      {showTimestamp && (
        <div
          className={cn(
            'absolute -bottom-5 text-[0.6rem] text-[var(--text-tertiary)]',
            'whitespace-nowrap pointer-events-none animate-fade-in',
            isUser ? 'right-0' : 'left-10'
          )}
        >
          {formatDate(message.created_at)}
        </div>
      )}
    </div>
  )
})

/** Date separator between messages from different days */
export function DateSeparator({ date }: { date: string }) {
  const d = new Date(date)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  let label: string
  if (d.toDateString() === today.toDateString()) {
    label = 'Today'
  } else if (d.toDateString() === yesterday.toDateString()) {
    label = 'Yesterday'
  } else {
    label = d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-[hsl(var(--border))]" />
      <span className="text-[0.65rem] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
        {label}
      </span>
      <div className="flex-1 h-px bg-[hsl(var(--border))]" />
    </div>
  )
}
