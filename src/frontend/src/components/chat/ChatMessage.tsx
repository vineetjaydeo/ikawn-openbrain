import { useMemo } from 'react'
import { motion } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import { cn } from '@/lib/utils'
import { StreamingIndicator } from '@/components/chat/StreamingIndicator'
import type { Message } from '@/stores/chat'

function formatTime(date: Date | string | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  const remarkPlugins = useMemo(() => [remarkGfm], [])
  const rehypePlugins = useMemo(() => [rehypeHighlight], [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] lg:max-w-[70%]',
          isUser
            ? 'rounded-2xl rounded-br-sm bg-muted/80 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.2)]'
            : 'border-l-2 border-l-primary/60 pl-5 py-1'
        )}
      >
        {!isUser && (
          <span className="mb-1 block text-xs font-semibold text-primary/80 tracking-wide uppercase">
            Lucy
          </span>
        )}

        <div
          className={cn(
            isUser
              ? 'text-sm text-foreground/90'
              : 'text-[0.9375rem] text-foreground/90 leading-[1.75] font-[var(--font-serif)]'
          )}
        >
          {isUser ? (
            <p className="leading-relaxed">{message.content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {message.isStreaming && <StreamingIndicator />}

        {message.timestamp && (
          <span
            className={cn(
              'mt-1.5 block text-xs text-muted-foreground',
              isUser && 'text-right'
            )}
          >
            {formatTime(message.created_at ?? message.timestamp)}
          </span>
        )}
      </div>
    </motion.div>
  )
}
