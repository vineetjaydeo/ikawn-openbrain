import { useMemo } from 'react'
import { motion } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import { cn } from '@/lib/utils'
import { StreamingIndicator } from '@/components/chat/StreamingIndicator'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import type { Message } from '@/stores/chat'

function formatTime(date: Date | string | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const AVATAR_COLORS = [
  '#E57373', '#F06292', '#BA68C8', '#9575CD',
  '#7986CB', '#64B5F6', '#4FC3F7', '#4DD0E1',
  '#4DB6AC', '#81C784', '#AED581', '#FFD54F',
  '#FFB74D', '#FF8A65',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-5 text-xl font-bold font-[var(--font-display)] text-foreground">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-lg font-bold font-[var(--font-display)] text-foreground">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-base font-semibold font-[var(--font-display)] text-foreground">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-2 leading-relaxed">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--color-gold)] underline underline-offset-2 hover:text-[var(--color-gold-hover)] transition-colors"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-foreground/85">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-[var(--color-gold)]/30 pl-4 italic text-foreground/70">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes('hljs') || className?.includes('language-')
    if (isBlock) {
      return (
        <code className={cn('block text-sm', className)}>
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-[#1a1a1a] px-1.5 py-0.5 text-sm font-mono text-foreground/90">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg bg-[#1a1a1a] p-4 text-sm">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-[rgba(255,255,255,0.06)]">
      <table className="lucy-table w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,
  hr: () => (
    <hr className="my-4 border-t border-[rgba(255,255,255,0.06)]" />
  ),
}

interface ChatMessageProps {
  message: Message
  onContinue?: () => void
}

export function ChatMessage({ message, onContinue }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const user = useAuthStore((s) => s.user)
  const setDraftText = useChatStore((s) => s.setDraftText)

  const remarkPlugins = useMemo(() => [remarkGfm], [])
  const rehypePlugins = useMemo(() => [rehypeHighlight], [])

  const userName = user?.name || 'You'
  const userInitial = userName.charAt(0).toUpperCase()
  const avatarBg = useMemo(() => getAvatarColor(userName), [userName])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex w-full"
    >
      {isUser ? (
        /* ── User message ── */
        <div style={{ display: 'flex', gap: 14, width: '100%' }}>
          {/* Avatar */}
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              backgroundColor: avatarBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 600,
              color: '#0A0A0A',
            }}
          >
            {userInitial}
          </div>
          {/* Content */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#A8A8A8' }}>
                {userName}
              </span>
              {message.timestamp && (
                <span style={{ fontSize: 12, color: '#6B6B6B' }}>
                  {formatTime(message.created_at ?? message.timestamp)}
                </span>
              )}
            </div>
            <div style={{ fontSize: '14.5px', lineHeight: 1.6, color: '#F5F5F5' }}>
              <p>{message.content}</p>
            </div>
          </div>
        </div>
      ) : (
        /* ── Agent (Lucy) message ── */
        <div style={{ display: 'flex', gap: 14, width: '100%' }}>
          {/* Gold sparkle avatar */}
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              backgroundColor: '#1a1700',
              border: '1px solid #FFC01C33',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 16,
              color: '#FFC01C',
            }}
          >
            {'\u2726'}
          </div>
          {/* Content */}
          <div
            style={{
              minWidth: 0,
              flex: 1,
              background: '#161616',
              border: '1px solid #2A2A2A',
              borderRadius: 12,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#F5F5F5', letterSpacing: '0.1px' }}>
                ruhi
              </span>
              {message.timestamp && (
                <span style={{ fontSize: 12, color: '#6B6B6B' }}>
                  {formatTime(message.created_at ?? message.timestamp)}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: '14.5px',
                lineHeight: 1.65,
                color: '#F5F5F5',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
                components={markdownComponents}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {message.isStreaming && <StreamingIndicator />}

            {message.incomplete && !message.isStreaming && (
              <div
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(255, 192, 28, 0.06)',
                  border: '1px solid rgba(255, 192, 28, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: '#A8A8A8',
                    lineHeight: 1.4,
                  }}
                >
                  Response may be incomplete
                </span>
                <button
                  onClick={() => {
                    if (onContinue) {
                      onContinue()
                    } else {
                      setDraftText('Continue from where you left off')
                    }
                  }}
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#FFC01C',
                    background: 'transparent',
                    border: '1px solid rgba(255, 192, 28, 0.3)',
                    borderRadius: 6,
                    padding: '3px 10px',
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 192, 28, 0.6)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 192, 28, 0.3)'
                  }}
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
