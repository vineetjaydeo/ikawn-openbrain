import { useCallback, useRef } from 'react';
import { useChatStore } from '@/stores/chat';

interface StreamEventDelta {
  type?: string;
  delta?: { text?: string };
  text?: string;
  content?: string;
  message?: string;
  taskId?: number;
  taskType?: string;
  stop_reason?: string;
  partial?: boolean;
  error?: string;
  message_id?: string;
  conversation_id?: string;
}

export function useStreamChat() {
  const abortRef = useRef<AbortController | null>(null);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateStreamingMessage = useChatStore(
    (s) => s.updateStreamingMessage,
  );
  const setIsStreaming = useChatStore((s) => s.setIsStreaming);
  const markLastMessageIncomplete = useChatStore(
    (s) => s.markLastMessageIncomplete,
  );

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
        let receivedDone = false;
        let isIncomplete = false;

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
                receivedDone = true;
                if (
                  parsed.stop_reason === 'error' ||
                  parsed.partial === true
                ) {
                  isIncomplete = true;
                }
              } else if (
                parsed.type === 'content_block_delta' ||
                parsed.delta?.text
              ) {
                fullContent += parsed.delta?.text ?? parsed.text ?? '';
                updateStreamingMessage(fullContent);
              } else if (parsed.type === 'text' || parsed.content) {
                fullContent += parsed.content ?? parsed.text ?? '';
                updateStreamingMessage(fullContent);
              } else if (parsed.type === 'artifact_ready' && (parsed as any).url) {
                const artifact = parsed as any;
                const label = artifact.filename || artifact.tool || 'Download';
                const downloadLine = `\n\n[${label}](${artifact.url})`;
                fullContent += downloadLine;
                updateStreamingMessage(fullContent);
              } else if (parsed.type === 'task_started' && parsed.taskId) {
                const { addActiveTask } = useChatStore.getState();
                addActiveTask({
                  taskId: parsed.taskId,
                  taskType: parsed.taskType || 'unknown',
                  status: 'pending',
                });
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

        // Stream closed without a done event — treat as truncated
        if (!receivedDone) {
          isIncomplete = true;
        }

        if (isIncomplete) {
          markLastMessageIncomplete();
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const errorMsg =
          err instanceof Error ? err.message : 'Stream failed';
        updateStreamingMessage(`Error: ${errorMsg}`);
        markLastMessageIncomplete();
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [addMessage, updateStreamingMessage, setIsStreaming, markLastMessageIncomplete],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, [setIsStreaming]);

  return { sendMessage, cancelStream };
}
