import { useRef, useCallback } from 'react'
import { Paperclip, ArrowUp, Square } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chat'
import { useStreamChat } from '@/hooks/useStreamChat'
import { useConversations } from '@/hooks/useConversations'

export function ChatInput() {
  const draftText = useChatStore((s) => s.draftText)
  const setDraftText = useChatStore((s) => s.setDraftText)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)

  const { sendMessage, cancelStream } = useStreamChat()
  const { create: createConversation } = useConversations()

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasText = draftText.trim().length > 0

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

  const handleSubmit = useCallback(async () => {
    const text = draftText.trim()
    if (!text || isStreaming) return

    setDraftText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    let convId = activeConversationId
    if (!convId) {
      try {
        const result = await createConversation(text.slice(0, 60))
        convId = result.conversation.id
        setActiveConversation(convId)
      } catch {
        // If conversation creation fails, use a temporary id
        convId = `temp-${Date.now()}`
        setActiveConversation(convId)
      }
    }

    await sendMessage(convId, text)
  }, [
    draftText,
    isStreaming,
    activeConversationId,
    setDraftText,
    sendMessage,
    createConversation,
    setActiveConversation,
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="flex justify-center px-4 pb-5 pt-2">
      <div
        className={cn(
          'flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#141416] px-4 py-3 focus-gold transition-all duration-200'
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 hover:text-foreground hover:bg-muted/50 active:scale-95 transition-all duration-150"
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
            'placeholder:text-muted-foreground/40',
            'outline-none'
          )}
        />

        <AnimatePresence mode="wait">
          {isStreaming ? (
            <motion.div
              key="stop"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="shrink-0"
            >
              <Button
                size="icon-sm"
                className="rounded-full bg-red-500/80 hover:bg-red-500 active:scale-90 transition-all duration-150"
                onClick={cancelStream}
                aria-label="Stop generating"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            </motion.div>
          ) : hasText ? (
            <motion.div
              key="send"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="shrink-0"
            >
              <Button
                size="icon-sm"
                className="rounded-full bg-gradient-to-r from-[#FFC01C] to-[#F59E0B] hover:from-[#e5a819] hover:to-[#d98f0a] active:scale-90 transition-all duration-150 shadow-[0_0_12px_rgba(255,192,28,0.25)]"
                onClick={() => void handleSubmit()}
                aria-label="Send message"
              >
                <ArrowUp />
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
