import { cn } from '@/lib/utils'
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer'
import type { ToolEvent } from '@/types/chat'
import { Check, X, Loader2 } from 'lucide-react'

interface StreamingMessageProps {
  content: string
  toolEvents: ToolEvent[]
  agentIdentity?: string
  tierSwitch?: string
  isStreaming: boolean
}

function ToolIndicator({ event }: { event: ToolEvent }) {
  const isStart = event.type === 'tool_start'

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-1 text-[0.78rem]',
        isStart ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'
      )}
    >
      {isStart ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--gold)]" />
      ) : event.success !== false ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <X className="h-3.5 w-3.5 text-red-400" />
      )}
      <span className="font-sans">
        {isStart ? `Using ${event.name}...` : `${event.name}`}
      </span>
      {!isStart && event.result && (
        <span className="text-[0.7rem] text-[var(--text-tertiary)] truncate max-w-[300px]">
          — {event.result}
        </span>
      )}
    </div>
  )
}

function TypingCursor() {
  return (
    <span className="inline-block w-[2px] h-[1em] bg-[var(--gold)] ml-0.5 align-middle animate-pulse" />
  )
}

export function StreamingMessage({
  content,
  toolEvents,
  agentIdentity,
  tierSwitch,
  isStreaming,
}: StreamingMessageProps) {
  return (
    <div className="flex gap-3.5 leading-[1.75]">
      {/* Gold sparkle avatar */}
      <div className="w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center text-[0.65rem] font-semibold mt-0.5 bg-[var(--gold)] text-[rgb(5,5,5)]">
        ✦
      </div>

      <div className="py-1 flex-1 font-serif text-[var(--text)] min-w-0">
        {/* Agent identity badge */}
        {agentIdentity && (
          <div className="mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-wider bg-gradient-to-r from-[var(--gold)]/20 to-[var(--gold-hover)]/15 text-[var(--gold)] border border-[var(--gold)]/30">
              {agentIdentity}
            </span>
          </div>
        )}

        {/* Tier switch indicator */}
        {tierSwitch && (
          <div className="mb-1.5 text-center">
            <span className="text-[0.65rem] uppercase tracking-wider text-[var(--text-secondary)] px-3 py-1 bg-white/5 rounded-full">
              Switched to {tierSwitch}
            </span>
          </div>
        )}

        {/* Tool events */}
        {toolEvents.length > 0 && (
          <div className="mb-2 flex flex-col gap-0.5">
            {toolEvents.map((event, i) => (
              <ToolIndicator key={`${event.name}-${i}`} event={event} />
            ))}
          </div>
        )}

        {/* Streaming content */}
        {content ? (
          <div className="relative">
            <MarkdownRenderer content={content} />
            {isStreaming && <TypingCursor />}
          </div>
        ) : isStreaming && toolEvents.length === 0 ? (
          /* Thinking dots when no content yet */
          <div className="flex items-center gap-2.5 py-3">
            <span className="text-[0.88rem] text-[var(--text-secondary)] italic font-sans">
              Thinking
            </span>
            <div className="flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-[var(--gold)]"
                  style={{
                    animation: 'dotPulse 1.4s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
