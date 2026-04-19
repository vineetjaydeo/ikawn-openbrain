import { useRef, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Paperclip, Square } from 'lucide-react'
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

  const navigate = useNavigate()
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

    let convId: string | null = activeConversationId
    const isNewConversation = !convId
    if (!convId) {
      try {
        const result = await createConversation(text.slice(0, 60)) as any
        convId = result.conversation?.id ?? result.id
        setActiveConversation(convId)
      } catch {
        // If conversation creation fails, use a temporary id
        convId = `temp-${Date.now()}`
        setActiveConversation(convId)
      }
    }

    if (!convId) return

    // Send message first (adds optimistic messages to store),
    // then navigate (store persists via Zustand across re-mount)
    sendMessage(convId, text)

    // Navigate to conversation URL if we just created it
    if (isNewConversation) {
      navigate({ to: '/chat/$conversationId', params: { conversationId: convId } })
    }
  }, [
    draftText,
    isStreaming,
    activeConversationId,
    setDraftText,
    navigate,
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
    <div
      style={{
        padding: '14px 28px 22px',
        borderTop: '1px solid #2A2A2A',
        background: '#0A0A0A',
      }}
    >
      {/* Composer box */}
      <div
        style={{
          background: '#161616',
          border: '1px solid #2A2A2A',
          borderRadius: 12,
          padding: 12,
          maxWidth: 760,
          margin: '0 auto',
        }}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={draftText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask Lucy about your brand, content, or data..."
          rows={1}
          style={{
            width: '100%',
            minHeight: 20,
            maxHeight: 120,
            resize: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14.5px',
            color: '#F5F5F5',
            padding: '6px 4px 14px',
          }}
          className="placeholder:text-[#6B6B6B]"
        />

        {/* Bottom toolbar row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Left: paperclip */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 hover:text-foreground hover:bg-muted/50 active:scale-95 transition-all duration-150"
            aria-label="Attach file"
          >
            <Paperclip className="text-muted-foreground" />
          </Button>

          {/* Right: hint + send/stop */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isStreaming && (
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: '#6B6B6B',
                }}
              >
                Cmd+Enter
              </span>
            )}

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
                  <button
                    onClick={() => void handleSubmit()}
                    aria-label="Send message"
                    style={{
                      background: '#FFC01C',
                      color: '#0A0A0A',
                      padding: '0 12px',
                      height: 32,
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    Send
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p
        style={{
          fontSize: 11,
          color: '#6B6B6B',
          textAlign: 'center',
          marginTop: 10,
          maxWidth: 760,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        Memory use limited by your access level.
      </p>
    </div>
  )
}
