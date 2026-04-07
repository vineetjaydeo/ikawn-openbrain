import { useState, useRef, useEffect, memo, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Conversation {
  id: string
  uuid: string
  title: string
  updated_at: string
  created_at: string
}

interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  onRename: (id: string, newTitle: string) => void
  onDelete: (id: string) => void
}

export const ConversationItem = memo(function ConversationItem({ conversation, isActive, onRename, onDelete }: ConversationItemProps) {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(conversation.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  useEffect(() => {
    if (!showMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  function handleClick() {
    if (!isRenaming) {
      navigate(`/chat/${conversation.uuid}`)
    }
  }

  function handleRenameSubmit() {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== conversation.title) {
      onRename(conversation.uuid, trimmed)
    }
    setIsRenaming(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setRenameValue(conversation.title)
      setIsRenaming(false)
    }
  }

  function formatTime(dateStr: string): string {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'now'
    if (diffMin < 60) return `${diffMin}m`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 7) return `${diffDay}d`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer text-[0.8rem] transition-all duration-150',
        isActive
          ? 'bg-[rgba(255,192,28,0.08)] text-[var(--text)] border-l-2 border-l-[var(--gold)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]',
      )}
    >
      {isRenaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-[var(--surface-2)] border border-[var(--gold)] rounded px-1.5 py-0.5 text-[0.8rem] text-[var(--text)] outline-none font-[inherit]"
        />
      ) : (
        <>
          <span className="flex-1 min-w-0 truncate">{conversation.title || 'New conversation'}</span>
          <span className="text-[0.65rem] text-[var(--text-tertiary)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {formatTime(conversation.updated_at)}
          </span>
        </>
      )}

      {!isRenaming && (
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu((prev) => !prev)
            }}
            className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-[hsl(var(--border))] transition-all"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-6 z-50 w-32 rounded-lg border border-[hsl(var(--border))] bg-[var(--surface-1)] py-1 shadow-xl animate-modal-enter" role="menu">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMenu(false)
                  setIsRenaming(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Rename
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMenu(false)
                  onDelete(conversation.uuid)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
