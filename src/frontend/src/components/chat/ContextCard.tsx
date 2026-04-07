import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ContextSummary } from '@/types/chat'

interface ContextCardProps {
  summary: ContextSummary
}

const complexityColors: Record<string, string> = {
  low: 'bg-green-500',
  medium: 'bg-yellow-500',
  high: 'bg-red-400',
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function ContextCard({ summary }: ContextCardProps) {
  const [collapsed, setCollapsed] = useState(true)

  if (!summary.topic) return null

  return (
    <div
      className={cn(
        'my-2 mb-3 border border-white/[0.08] rounded-[10px]',
        'bg-white/[0.03] overflow-hidden transition-all',
        'border-l-2 border-l-[var(--gold)]'
      )}
    >
      {/* Header (always visible) */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-[0.65rem] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
          Context
        </span>
        {summary.complexity && (
          <span
            className={cn(
              'text-[0.6rem] px-1.5 py-px rounded-lg text-black font-semibold uppercase tracking-wide',
              complexityColors[summary.complexity] || 'bg-gray-500'
            )}
          >
            {summary.complexity}
          </span>
        )}
        <span className="flex-1 text-[0.75rem] text-[var(--text)] truncate">
          {summary.topic}
        </span>
        {summary.updated_at && (
          <span className="text-[0.6rem] text-[var(--text-tertiary)] tabular-nums">
            {formatRelativeTime(summary.updated_at)}
          </span>
        )}
        <button className="text-[var(--text-secondary)] text-sm p-0 bg-transparent border-none cursor-pointer">
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Body (collapsible) */}
      {!collapsed && (
        <div className="px-3 pb-2.5 pt-1 border-t border-white/5">
          {/* Key bullets */}
          {summary.bullets && summary.bullets.length > 0 && (
            <ul className="list-none p-0 m-0 my-1">
              {summary.bullets.map((bullet, i) => (
                <li
                  key={i}
                  className="text-[0.72rem] text-[var(--text-secondary)] py-0.5 leading-snug"
                >
                  {bullet}
                </li>
              ))}
            </ul>
          )}

          {/* Decisions */}
          {summary.decisions && summary.decisions.length > 0 && (
            <div className="mt-1.5">
              <span className="text-[0.6rem] uppercase tracking-wider text-[var(--gold)] font-semibold">
                Decisions
              </span>
              <ul className="list-disc pl-4 m-0 mt-0.5">
                {summary.decisions.map((d, i) => (
                  <li key={i} className="text-[0.7rem] text-[var(--text-secondary)] py-px">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Open questions */}
          {summary.open_questions && summary.open_questions.length > 0 && (
            <div className="mt-1.5">
              <span className="text-[0.6rem] uppercase tracking-wider text-[var(--gold)] font-semibold">
                Open Questions
              </span>
              <ul className="list-disc pl-4 m-0 mt-0.5">
                {summary.open_questions.map((q, i) => (
                  <li key={i} className="text-[0.7rem] text-[var(--text-secondary)] py-px">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
