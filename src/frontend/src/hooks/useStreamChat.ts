import { useCallback, useRef } from 'react';
import { useChatStore } from '@/stores/chat';

interface StreamEventDelta {
  type?: string;
  delta?: { text?: string };
  text?: string;
  content?: string;
  message?: string;
}

export function useStreamChat() {
  const abortRef = useRef<AbortController | null>(null);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateStreamingMessage = useChatStore(
    (s) => s.updateStreamingMessage,
  );
  const setIsStreaming = useChatStore((s) => s.setIsStreaming);

  const sendMessage = useCallback(
    async (
      conversationId: string,
      content: string,
      attachments?: string[],
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Add user message optimistically
      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
      });

      // Add placeholder assistant message for streaming
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      });
      setIsStreaming(true);

      try {
        const res = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            conversation_id: conversationId,
            content,
            attachments,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Chat failed: ${res.status}`);
        }

        if (!res.body) {
          throw new Error('No response body');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]' || data === '') continue;

            try {
              const parsed: StreamEventDelta = JSON.parse(data);

              if (parsed.type === 'chunk' && parsed.text) {
                // OpenBrain format: {"type":"chunk","text":"..."}
                fullContent += parsed.text;
                updateStreamingMessage(fullContent);
              } else if (parsed.type === 'done') {
                // Stream complete
              } else if (
                parsed.type === 'content_block_delta' ||
                parsed.delta?.text
              ) {
                fullContent += parsed.delta?.text ?? parsed.text ?? '';
                updateStreamingMessage(fullContent);
              } else if (parsed.type === 'text' || parsed.content) {
                fullContent += parsed.content ?? parsed.text ?? '';
                updateStreamingMessage(fullContent);
              } else if (parsed.type === 'error') {
                updateStreamingMessage(
                  `Error: ${parsed.message ?? 'Something went wrong'}`,
                );
              }
            } catch {
              // Non-JSON SSE data - might be raw text chunks
              if (data && data !== ':' && !data.startsWith('{')) {
                fullContent += data;
                updateStreamingMessage(fullContent);
              }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const errorMsg =
          err instanceof Error ? err.message : 'Stream failed';
        updateStreamingMessage(`Error: ${errorMsg}`);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [addMessage, updateStreamingMessage, setIsStreaming],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, [setIsStreaming]);

  return { sendMessage, cancelStream };
}
