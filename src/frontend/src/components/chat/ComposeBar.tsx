import { useRef, useCallback, useEffect, useState } from 'react'
import { Send, Paperclip, Image as ImageIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MentionDropdown } from '@/components/chat/MentionDropdown'
import type { MentionEntry } from '@/hooks/useMentions'
import type { Attachment, ModelTier } from '@/types/chat'

interface ComposeBarProps {
  onSend: (text: string, attachments: Attachment[]) => void
  onGalleryOpen: () => void
  disabled?: boolean
  disabledLabel?: string
  tier: ModelTier
  onTierChange: (tier: ModelTier) => void
  /** Controlled text value (for draft sync) */
  value?: string
  /** Called on every text change (for draft sync) */
  onTextChange?: (text: string) => void
}

const TIER_LABELS: Record<ModelTier, string> = {
  regular: 'REG',
  pro: 'PRO',
  expert: 'EXP',
}

const TIER_CYCLE: ModelTier[] = ['regular', 'pro', 'expert']

export function ComposeBar({
  onSend,
  onGalleryOpen,
  disabled = false,
  disabledLabel = 'Lucy is thinking...',
  tier,
  onTierChange,
  value,
  onTextChange,
}: ComposeBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [internalText, setInternalText] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])

  // Support controlled and uncontrolled modes
  const text = value !== undefined ? value : internalText
  const updateText = useCallback(
    (val: string) => {
      if (onTextChange) onTextChange(val)
      else setInternalText(val)
    },
    [onTextChange]
  )

  // @mention / /skill autocomplete state
  const [mentionVisible, setMentionVisible] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStartPos, setMentionStartPos] = useState(-1)
  const [mentionMode, setMentionMode] = useState<'mention' | 'skill'>('mention')

  const hasContent = text.trim().length > 0 || pendingAttachments.length > 0

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '24px'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [text, resizeTextarea])

  // Focus textarea when not disabled
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus()
    }
  }, [disabled])

  const handleSend = useCallback(() => {
    if (!hasContent || disabled) return
    onSend(text.trim(), pendingAttachments)
    updateText('')
    setPendingAttachments([])
    setMentionVisible(false)
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px'
    }
  }, [text, pendingAttachments, hasContent, disabled, onSend, updateText])

  // Detect @mention and /skill triggers on text change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value
      updateText(val)

      const cursor = e.target.selectionStart
      const before = val.slice(0, cursor)

      // Check for /skill mode (only at start of input)
      if (val.startsWith('/')) {
        const query = before.slice(1).toLowerCase()
        if (!query.includes(' ')) {
          setMentionMode('skill')
          setMentionStartPos(0)
          setMentionQuery(query)
          setMentionVisible(true)
          return
        }
      }

      // Check for @mention
      const atIdx = before.lastIndexOf('@')
      if (atIdx >= 0) {
        const charBefore = atIdx > 0 ? val[atIdx - 1] : ' '
        if (charBefore === ' ' || charBefore === '\n' || atIdx === 0) {
          const query = before.slice(atIdx + 1).toLowerCase()
          if (!query.includes(' ')) {
            setMentionMode('mention')
            setMentionStartPos(atIdx)
            setMentionQuery(query)
            setMentionVisible(true)
            return
          }
        }
      }

      setMentionVisible(false)
    },
    [updateText]
  )

  // Handle mention/skill selection
  const handleMentionSelect = useCallback(
    (entry: MentionEntry) => {
      const el = textareaRef.current
      if (!el) return

      const prefix = mentionMode === 'skill' ? '/' : '@'
      const before = text.slice(0, mentionStartPos)
      const after = text.slice(el.selectionStart)
      const newText = `${before}${prefix}${entry.slug} ${after}`
      updateText(newText)

      setMentionVisible(false)
      setMentionQuery('')
      setMentionStartPos(-1)

      // Move cursor after the inserted mention
      requestAnimationFrame(() => {
        const pos = before.length + prefix.length + entry.slug.length + 1
        el.setSelectionRange(pos, pos)
        el.focus()
      })
    },
    [text, mentionStartPos, mentionMode, updateText]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Let MentionDropdown handle keyboard events when visible
      if (mentionVisible) {
        if (['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(e.key)) {
          // MentionDropdown listens on document — don't also send the message
          return
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend, mentionVisible]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return

      Array.from(files).forEach((file) => {
        const isImage = file.type.startsWith('image/')
        const url = URL.createObjectURL(file)
        const attachment: Attachment = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: isImage ? 'image' : 'document',
          url,
          filename: file.name,
          mimeType: file.type,
        }
        setPendingAttachments((prev) => [...prev, attachment])
      })

      e.target.value = ''
    },
    []
  )

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const removed = prev.find((a) => a.id === id)
      if (removed) URL.revokeObjectURL(removed.url)
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const cycleTier = useCallback(() => {
    const currentIdx = TIER_CYCLE.indexOf(tier)
    const nextTier = TIER_CYCLE[(currentIdx + 1) % TIER_CYCLE.length]!
    onTierChange(nextTier)
  }, [tier, onTierChange])

  /** Public ref for parent to focus the textarea */
  useEffect(() => {
    // Expose focus method on the textarea
    const el = textareaRef.current
    if (el) {
      (el as HTMLTextAreaElement & { composeFocus?: () => void }).composeFocus = () => el.focus()
    }
  })

  return (
    <div className="sticky bottom-0 px-5 pb-5 pt-2 md:px-3 md:pb-3">
      <div className="max-w-[768px] mx-auto relative">
        {/* @mention / /skill autocomplete dropdown */}
        <MentionDropdown
          query={mentionQuery}
          visible={mentionVisible}
          onSelect={handleMentionSelect}
          onClose={() => setMentionVisible(false)}
          mode={mentionMode}
        />

        {/* Pending attachments */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1 pb-2">
            {pendingAttachments.map((attach) => (
              <div key={attach.id} className="relative inline-flex items-center">
                {attach.type === 'image' ? (
                  <img
                    src={attach.url}
                    alt={attach.filename || 'Attachment'}
                    className="w-14 h-14 object-cover rounded-sm border border-[hsl(var(--border))]"
                  />
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-sm text-xs text-[var(--text-secondary)]">
                    <span className="truncate max-w-[120px]">{attach.filename}</span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(attach.id)}
                  className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-red-500 text-white border-none cursor-pointer flex items-center justify-center"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Compose bar */}
        <div
          className={cn(
            'flex items-end gap-2 bg-[rgb(10,10,10)] border border-[rgb(35,35,35)]',
            'rounded-3xl px-3.5 py-2.5 transition-all duration-200',
            'focus-within:border-[rgb(55,55,55)] focus-within:shadow-[0_0_0_2px_rgba(255,255,255,0.03)]'
          )}
        >
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'w-[34px] h-[34px] flex items-center justify-center shrink-0',
              'border-none bg-transparent text-[var(--text-tertiary)]',
              'rounded-lg cursor-pointer transition-colors duration-200',
              'hover:bg-white/5 hover:text-[var(--text)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent'
            )}
            title="Attach file"
            aria-label="Attach file"
          >
            <Paperclip className="h-[18px] w-[18px]" />
          </button>

          {/* Gallery button */}
          <button
            onClick={onGalleryOpen}
            className={cn(
              'w-[34px] h-[34px] flex items-center justify-center shrink-0',
              'border-none bg-transparent text-[var(--text-tertiary)]',
              'rounded-lg cursor-pointer transition-colors duration-200',
              'hover:bg-white/5 hover:text-[var(--text)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent'
            )}
            title="Gallery"
            aria-label="Open gallery"
          >
            <ImageIcon className="h-[18px] w-[18px]" />
          </button>

          {/* Model tier toggle */}
          <button
            onClick={cycleTier}
            className={cn(
              'h-[34px] flex items-center justify-center shrink-0 px-1.5 min-w-[34px]',
              'border-none bg-transparent rounded-lg cursor-pointer transition-colors duration-200',
              'text-[0.7rem] font-semibold tracking-wide font-sans',
              tier === 'expert'
                ? 'text-[var(--gold)] bg-[var(--gold)]/10'
                : tier === 'pro'
                  ? 'text-[var(--text-secondary)]'
                  : 'text-[var(--text-tertiary)]',
              'hover:bg-white/5',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent'
            )}
            title={`Model: ${tier}. Click to cycle.`}
          >
            {TIER_LABELS[tier]}
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? disabledLabel : 'Message Lucy...'}
            disabled={disabled}
            rows={1}
            className={cn(
              'flex-1 bg-transparent border-none text-[var(--text)] text-[0.98rem]',
              'font-sans resize-none outline-none',
              'max-h-[200px] min-h-[24px] leading-normal py-[5px]',
              'placeholder:text-[var(--text-tertiary)]',
              'disabled:opacity-50'
            )}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!hasContent || disabled}
            className={cn(
              'w-[34px] h-[34px] flex items-center justify-center shrink-0',
              'border-none rounded-[10px] cursor-pointer transition-colors duration-200',
              hasContent && !disabled
                ? 'bg-[var(--gold)] text-[rgb(5,5,5)] hover:bg-[var(--gold-hover)]'
                : 'bg-transparent text-[var(--text-tertiary)]',
              'disabled:opacity-25 disabled:cursor-not-allowed',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent'
            )}
          >
            <Send className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json,.md"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Hint */}
        <p className="text-center text-[0.7rem] text-[var(--text-tertiary)] pt-2">
          Enter to send, Shift+Enter for newline &middot; @ to mention &middot; / for commands
        </p>
      </div>
    </div>
  )
}
