import { useRef, useCallback, useEffect } from 'react'
import { Paperclip, ArrowUp } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chat'

const CANNED_RESPONSE =
  'I understand your request. Let me analyze the available data and provide a comprehensive response.\n\n**Key Findings**\n\nBased on the current metrics and trends, there are several important observations to consider. The overall trajectory is positive, with notable improvements in engagement and conversion rates across all channels.\n\n1. Primary metrics show a 15% improvement over the previous quarter\n2. User engagement has increased steadily across all touchpoints\n3. The new strategy appears to be resonating well with the target demographic\n\nWould you like me to dive deeper into any of these areas?'

const STREAM_INTERVAL_MS = 25
const STREAM_START_DELAY_MS = 500

export function ChatInput() {
  const draftText = useChatStore((s) => s.draftText)
  const setDraftText = useChatStore((s) => s.setDraftText)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateStreamingMessage = useChatStore((s) => s.updateStreamingMessage)
  const setIsStreaming = useChatStore((s) => s.setIsStreaming)
  const isStreaming = useChatStore((s) => s.isStreaming)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasText = draftText.trim().length > 0

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxRows = 6
    const lineHeight = 20
    const maxHeight = lineHeight * maxRows
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraftText(e.target.value)
      resizeTextarea()
    },
    [setDraftText, resizeTextarea]
  )

  const handleSubmit = useCallback(() => {
    const text = draftText.trim()
    if (!text || isStreaming) return

    const rand = Math.random().toString(36).slice(2, 8)
    const now = Date.now()

    // Add user message
    addMessage({
      id: `msg-user-${now}-${rand}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    })

    setDraftText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Mock streaming response
    const asstId = `msg-asst-${now}-${rand}`
    setTimeout(() => {
      addMessage({
        id: asstId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      })
      setIsStreaming(true)

      let charIndex = 0
      intervalRef.current = setInterval(() => {
        charIndex++
        if (charIndex >= CANNED_RESPONSE.length) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          updateStreamingMessage(CANNED_RESPONSE)
          setIsStreaming(false)
          // Remove streaming flag from the message
          useChatStore.setState((state) => {
            const msgs = state.messages.map((m) =>
              m.id === asstId ? { ...m, isStreaming: false } : m
            )
            return { messages: msgs }
          })
          return
        }
        updateStreamingMessage(CANNED_RESPONSE.slice(0, charIndex))
      }, STREAM_INTERVAL_MS)
    }, STREAM_START_DELAY_MS)
  }, [draftText, isStreaming, addMessage, setDraftText, updateStreamingMessage, setIsStreaming])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="flex justify-center px-4 pb-4 pt-2">
      <div
        className={cn(
          'flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2',
          'transition-[border-color,box-shadow]',
          'focus-within:border-ring/30 focus-within:ring-1 focus-within:ring-ring/20'
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Attach file"
        >
          <Paperclip className="text-muted-foreground" />
        </Button>

        <textarea
          ref={textareaRef}
          value={draftText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message Lucy..."
          rows={1}
          className={cn(
            'max-h-[120px] min-h-[20px] flex-1 resize-none bg-transparent text-sm text-foreground',
            'placeholder:text-muted-foreground/50',
            'outline-none'
          )}
        />

        <AnimatePresence>
          {hasText && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="shrink-0"
            >
              <Button
                size="icon-sm"
                className="rounded-full"
                onClick={handleSubmit}
                disabled={isStreaming}
                aria-label="Send message"
              >
                <ArrowUp />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
