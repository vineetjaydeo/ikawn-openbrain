// ── SSE Streaming Client ──
// Uses fetch + ReadableStream to POST and stream SSE responses.
// EventSource is not used because it only supports GET.

import type { Attachment, ChatSSEEvent } from '@/types/api'

export interface StreamOptions {
  conversationId: string
  message: string
  attachments?: Attachment[]
  tier?: string
  mentionedAgent?: string
  onEvent: (event: ChatSSEEvent) => void
  onError: (error: Error) => void
  onComplete: () => void
}

/**
 * Starts a streaming chat request via POST /api/chat/send.
 * Returns an AbortController that the caller can use to cancel the stream.
 *
 * The backend writes SSE format: `data: {json}\n\n`
 * with occasional `:ping\n\n` keepalive comments.
 */
export function streamChat(options: StreamOptions): AbortController {
  const controller = new AbortController()

  const body: Record<string, unknown> = {
    conversation_id: options.conversationId,
    content: options.message,
  }
  if (options.attachments?.length) {
    body.attachments = options.attachments
  }
  if (options.tier) {
    body.forced_tier = options.tier
  }
  // mentionedAgent is handled by @mention in message content — no separate field needed

  ;(async () => {
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error((errBody as { error?: string }).error || `Stream request failed: ${res.status}`)
      }

      if (!res.body) {
        throw new Error('Response body is null — streaming not supported')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete lines from the buffer
        const lines = buffer.split('\n')
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          // Skip empty lines and SSE comments (keepalive pings)
          if (!line || line.startsWith(':')) continue

          // Parse SSE data lines
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6) // Remove 'data: ' prefix
            try {
              const event = JSON.parse(jsonStr) as ChatSSEEvent
              options.onEvent(event)
            } catch {
              // Skip malformed JSON lines
              console.warn('[SSE] Failed to parse:', jsonStr)
            }
          }
        }
      }

      // Process any remaining buffer content
      if (buffer.trim() && buffer.startsWith('data: ')) {
        try {
          const event = JSON.parse(buffer.slice(6)) as ChatSSEEvent
          options.onEvent(event)
        } catch {
          // ignore
        }
      }

      options.onComplete()
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Stream was cancelled by caller — treat as normal completion
        options.onComplete()
        return
      }
      options.onError(err instanceof Error ? err : new Error(String(err)))
    }
  })()

  return controller
}
