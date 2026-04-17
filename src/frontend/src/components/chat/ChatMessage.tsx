import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { StreamingIndicator } from '@/components/chat/StreamingIndicator'
import type { Message } from '@/stores/chat'

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(
      <strong key={match.index} className="font-semibold text-foreground">
        {match[1]}
      </strong>
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

function renderTable(tableLines: string[], keyBase: number): ReactNode {
  const parseRow = (line: string) =>
    line
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)

  const headers = parseRow(tableLines[0])
  const rows = tableLines
    .slice(2)
    .map(parseRow)
    .filter((r) => r.length > 0)

  return (
    <div key={keyBase} className="my-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h, idx) => (
              <th
                key={idx}
                className="px-3 py-2 text-left text-xs font-semibold text-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="border-b border-border">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-3 py-2 text-muted-foreground">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n')
  const elements: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Table detection: current line has pipes and next line is a separator
    if (
      i + 1 < lines.length &&
      line.includes('|') &&
      lines[i + 1].includes('|') &&
      lines[i + 1].includes('-')
    ) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i])
        i++
      }
      elements.push(renderTable(tableLines, elements.length))
      continue
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={elements.length} className="my-2 list-decimal space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx} className="text-foreground/90">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Bullet list
    if (/^[-*]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ''))
        i++
      }
      elements.push(
        <ul key={elements.length} className="my-2 list-disc space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx} className="text-foreground/90">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Blank line
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph
    elements.push(
      <p key={elements.length} className="my-1.5 leading-relaxed">
        {renderInline(line)}
      </p>
    )
    i++
  }

  return elements
}

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, x: isUser ? 12 : -12 }}
      animate={{ opacity: 1, x: 0 }}
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
            ? 'rounded-2xl rounded-br-sm bg-muted px-4 py-3'
            : 'border-l-2 border-l-primary pl-4'
        )}
      >
        {!isUser && (
          <span className="mb-1 block text-xs font-medium text-primary">
            Lucy
          </span>
        )}

        <div
          className={cn(
            'text-sm text-foreground/90',
            !isUser && 'font-[var(--font-serif)]'
          )}
        >
          {isUser ? (
            <p className="leading-relaxed">{message.content}</p>
          ) : (
            renderMarkdown(message.content)
          )}
        </div>

        {message.isStreaming && <StreamingIndicator />}

        <span
          className={cn(
            'mt-1.5 block text-xs text-muted-foreground',
            isUser && 'text-right'
          )}
        >
          {formatTime(message.timestamp)}
        </span>
      </div>
    </motion.div>
  )
}
