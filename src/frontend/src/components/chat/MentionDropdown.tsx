import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useMentions, type MentionEntry } from '@/hooks/useMentions'

interface MentionDropdownProps {
  query: string
  visible: boolean
  onSelect: (entry: MentionEntry) => void
  onClose: () => void
  /** 'mention' filters agents/people, 'skill' filters tools */
  mode?: 'mention' | 'skill'
}

export function MentionDropdown({ query, visible, onSelect, onClose, mode = 'mention' }: MentionDropdownProps) {
  const { entries: allEntries, isLoading } = useMentions(query)
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Filter by mode
  const entries = useMemo(() => {
    if (mode === 'skill') {
      return allEntries.filter((e) => e.type === 'tool')
    }
    // mention mode: show agents and people
    return allEntries.filter((e) => e.type === 'agent' || e.type === 'person')
  }, [allEntries, mode])

  // Reset index when entries change
  useEffect(() => {
    setActiveIndex(0)
  }, [entries.length, query])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || entries.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          e.stopPropagation()
          setActiveIndex((prev) => (prev + 1) % entries.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          e.stopPropagation()
          setActiveIndex((prev) => (prev - 1 + entries.length) % entries.length)
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          e.stopPropagation()
          if (entries[activeIndex]) {
            onSelect(entries[activeIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          onClose()
          break
      }
    },
    [visible, entries, activeIndex, onSelect, onClose]
  )

  useEffect(() => {
    if (visible) {
      document.addEventListener('keydown', handleKeyDown, true)
      return () => document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [visible, handleKeyDown])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!visible) return null

  return (
    <div
      ref={listRef}
      className={cn(
        'absolute bottom-full left-0 right-0 mb-1 z-50',
        'max-h-[240px] overflow-y-auto',
        'bg-[var(--surface-1)] border border-[hsl(var(--border))]',
        'rounded-xl shadow-xl',
        'py-1',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-150'
      )}
    >
      {isLoading && (
        <div className="px-3 py-2 text-xs text-[var(--text-tertiary)]">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-[var(--text-tertiary)] border-t-transparent animate-spin" />
            Loading...
          </div>
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <div className="px-3 py-2 text-xs text-[var(--text-tertiary)]">No matches</div>
      )}

      {entries.map((entry, i) => (
        <button
          key={`${entry.type}-${entry.slug}`}
          onClick={() => onSelect(entry)}
          onMouseEnter={() => setActiveIndex(i)}
          className={cn(
            'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150',
            i === activeIndex && 'bg-white/5'
          )}
        >
          {/* Type indicator */}
          <span
            className={cn(
              'inline-flex items-center justify-center w-6 h-6 rounded-full text-[0.55rem] font-bold uppercase shrink-0',
              entry.type === 'agent'
                ? 'bg-[var(--gold)]/15 text-[var(--gold)]'
                : entry.type === 'tool'
                  ? 'bg-blue-500/15 text-blue-400'
                  : 'bg-purple-500/15 text-purple-400'
            )}
          >
            {entry.type === 'tool' ? '/' : entry.type === 'agent' ? 'A' : 'P'}
          </span>

          <div className="flex-1 min-w-0">
            <div className="text-[0.82rem] text-[var(--text)] truncate">
              {mode === 'skill' ? `/${entry.slug}` : `@${entry.slug}`}
            </div>
            {entry.role && (
              <div className="text-[0.68rem] text-[var(--text-tertiary)] truncate">
                {entry.name}{entry.role ? ` \u2014 ${entry.role}` : ''}
              </div>
            )}
            {entry.description && !entry.role && (
              <div className="text-[0.68rem] text-[var(--text-tertiary)] truncate">
                {entry.description}
              </div>
            )}
          </div>

          {/* Type badge */}
          <span
            className={cn(
              'text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0',
              entry.type === 'agent'
                ? 'text-[var(--gold)] bg-[var(--gold)]/10'
                : entry.type === 'tool'
                  ? 'text-blue-400 bg-blue-500/10'
                  : 'text-purple-400 bg-purple-500/10'
            )}
          >
            {entry.type === 'tool' ? 'skill' : entry.type}
          </span>
        </button>
      ))}
    </div>
  )
}
