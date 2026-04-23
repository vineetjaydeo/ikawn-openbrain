import { useEffect, useRef } from 'react';
import type { ChatMessageRow } from '../../types';

export function ChatMessageList({ messages }: { messages: ChatMessageRow[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="space-y-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.seq} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessageRow }) {
  const payload = message.payload as { text?: string };
  const text = payload.text || '';

  if (message.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md text-sm" style={{ background: 'var(--accent)', color: 'black' }}>
          {text}
        </div>
      </div>
    );
  }

  if (message.kind === 'assistant_text') {
    return (
      <div className="max-w-[85%] text-sm leading-relaxed" style={{ fontFamily: 'var(--font-serif)' }}>
        {text}
      </div>
    );
  }

  if (message.kind === 'artifact_delivered') {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-1">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
        Design updated
      </div>
    );
  }

  return null;
}
