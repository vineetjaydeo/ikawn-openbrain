import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { streamChat } from '@/lib/sse'
import { useChatStore } from '@/stores/chat-store'
import type { Attachment, ChatSSEEvent, Conversation } from '@/types/api'

interface SendMessageOptions {
  attachments?: Attachment[]
  tier?: string
  mentionedAgent?: string
}

export function useChatStream() {
  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)

  const {
    isStreaming,
    startStreaming,
    appendStreamingText,
    addStreamingTool,
    updateStreamingTool,
    setStreamingAgent,
    setStreamingTier,
    addPendingGeneration,
    stopStreaming,
  } = useChatStore()

  const sendMessage = useCallback(
    (conversationId: string, message: string, opts?: SendMessageOptions) => {
      // Cancel any existing stream
      if (abortRef.current) {
        abortRef.current.abort()
      }

      startStreaming()

      const handleEvent = (event: ChatSSEEvent) => {
        switch (event.type) {
          case 'chunk':
            appendStreamingText(event.text)
            break

          case 'tool_start':
            addStreamingTool(event.tool, event.detail)
            break

          case 'tool_done':
            updateStreamingTool(event.tool, event.success ? 'done' : 'error', event.error)
            break

          case 'tool_gated':
            addStreamingTool(event.tool)
            updateStreamingTool(event.tool, 'error', `Requires ${event.approvalRequired ?? 'approval'}`)
            break

          case 'tool_error':
            addStreamingTool(event.tool)
            updateStreamingTool(event.tool, 'error', event.error)
            break

          case 'agent_identity':
            setStreamingAgent({
              slug: event.slug ?? event.agent,
              name: event.name,
              role: event.role,
            })
            break

          case 'tier_switch':
            setStreamingTier({ tier: event.tier, label: event.label })
            break

          case 'generation_started':
            addPendingGeneration({
              id: event.generationId,
              agent: event.agent,
              prompt: event.prompt,
              batchSize: event.batchSize,
            })
            break

          case 'title':
            // Update the conversation title in the cached list
            queryClient.setQueryData<Conversation[]>(['conversations'], (old) =>
              old?.map((c) =>
                c.id === conversationId ? { ...c, title: event.title } : c
              ) ?? []
            )
            break

          case 'done':
            // Invalidate the conversation query to reload with the saved assistant message
            queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
            // Also refresh the conversation list (updated_at changed)
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
            break

          case 'error':
            toast.error(event.error || 'An error occurred')
            break
        }
      }

      abortRef.current = streamChat({
        conversationId,
        message,
        attachments: opts?.attachments,
        tier: opts?.tier,
        mentionedAgent: opts?.mentionedAgent,
        onEvent: handleEvent,
        onError: (error) => {
          toast.error(error.message || 'Stream failed')
          stopStreaming()
        },
        onComplete: () => {
          stopStreaming()
        },
      })
    },
    [
      queryClient,
      startStreaming,
      appendStreamingText,
      addStreamingTool,
      updateStreamingTool,
      setStreamingAgent,
      setStreamingTier,
      addPendingGeneration,
      stopStreaming,
    ]
  )

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    stopStreaming()
  }, [stopStreaming])

  return { sendMessage, cancelStream, isStreaming }
}
