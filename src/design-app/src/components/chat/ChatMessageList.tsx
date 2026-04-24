import { FileText } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useDesignStore, type ToolCallPayload } from '../../store';
import type { ChatMessageRow } from '../../types';
import { AssistantText } from './AssistantText';
import { UserMessage } from './UserMessage';
import { InlineTodoList, TodoChecklist, WorkingCard } from './WorkingCard';

interface ChatMessageListProps {
  messages: ChatMessageRow[];
  loading: boolean;
  isGenerating?: boolean;
  empty?: React.ReactNode;
  streamingText?: string | null;
  pendingToolCalls?: ToolCallPayload[];
}

interface RenderItem {
  key: string;
  node: React.ReactNode;
}

/**
 * Walks the chat message stream once and groups every run of consecutive
 * `tool_call` rows into a single WorkingCard. The bucket flushes on any
 * non-tool_call row (assistant_text, user, error, artifact_delivered).
 */
export function ChatMessageList({
  messages,
  loading,
  isGenerating,
  empty,
  streamingText,
  pendingToolCalls,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const todos = useDesignStore((s) => s.todos);

  useEffect(() => {
    const el = scrollRef.current?.parentElement;
    if (!el) return;
    function onScroll(): void {
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 48;
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, streamingText]);

  if (loading && messages.length === 0 && !streamingText) {
    return (
      <div className="text-[var(--text-sm)] text-[var(--color-text-muted)]">
        Loading...
      </div>
    );
  }

  if (messages.length === 0 && !streamingText) {
    return <>{empty}</>;
  }

  const items: RenderItem[] = [];
  let bucket: { calls: ToolCallPayload[]; firstSeq: number } | null = null;

  const flush = () => {
    if (!bucket || bucket.calls.length === 0) {
      bucket = null;
      return;
    }
    const cur = bucket;
    items.push({
      key: `tc-${cur.firstSeq}`,
      node: <WorkingCard calls={cur.calls} />,
    });
    bucket = null;
  };

  for (const msg of messages) {
    if (msg.kind === 'tool_call') {
      const call = (msg.payload as unknown as ToolCallPayload) ?? null;
      if (!call) continue;
      // set_todos breaks the bucket -- render the checklist exactly where the
      // agent fired it so the chronological story stays intact.
      if (call.toolName === 'set_todos') {
        flush();
        items.push({
          key: `todos-${msg.seq}`,
          node: <InlineTodoList call={call} />,
        });
        continue;
      }
      if (!bucket) bucket = { calls: [], firstSeq: msg.seq };
      bucket.calls.push(call);
      continue;
    }

    flush();

    if (msg.kind === 'user') {
      const p = msg.payload as { text?: string };
      items.push({
        key: `u-${msg.seq}`,
        node: <UserMessage text={p?.text ?? ''} />,
      });
    } else if (msg.kind === 'assistant_text') {
      const p = msg.payload as { text?: string };
      const isLast = msg === messages[messages.length - 1];
      const streaming = Boolean(isGenerating) && isLast;
      items.push({
        key: `a-${msg.seq}`,
        node: <AssistantText text={p?.text ?? ''} streaming={streaming} />,
      });
    } else if (msg.kind === 'artifact_delivered') {
      const p = msg.payload as { filename?: string };
      const label = p?.filename ?? 'Design artifact';
      items.push({
        key: `art-${msg.seq}`,
        node: (
          <div className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border-muted)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)]">
            <FileText
              className="w-[14px] h-[14px] text-[var(--color-text-secondary)] shrink-0"
              aria-hidden
            />
            <span className="text-[12.5px] font-[ui-monospace,Menlo,monospace] text-[var(--color-text-primary)] truncate">
              {label}
            </span>
            <span className="ml-auto text-[11px] text-[var(--color-text-muted)]">
              Delivered
            </span>
          </div>
        ),
      });
    } else if (msg.kind === 'error') {
      const p = msg.payload as { message?: string };
      items.push({
        key: `err-${msg.seq}`,
        node: (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-error)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)] text-[12.5px] font-[var(--font-mono),ui-monospace,Menlo,monospace] text-[var(--color-text-primary)] break-all whitespace-pre-wrap">
            {p?.message ?? 'An unknown error occurred'}
          </div>
        ),
      });
    }
  }

  flush();

  return (
    <div ref={scrollRef} className="space-y-[var(--space-5)]">
      {items.map((item) => (
        <div key={item.key}>{item.node}</div>
      ))}
      {/* In-flight tool calls (memory only, not yet persisted) */}
      {pendingToolCalls && pendingToolCalls.length > 0 && (
        <div key="pending-tools" className="space-y-[var(--space-1)]">
          {(() => {
            const groups: React.ReactNode[] = [];
            let pendingBucket: ToolCallPayload[] = [];
            const flushPending = (idx: number): void => {
              if (pendingBucket.length === 0) return;
              groups.push(<WorkingCard key={`p-cluster-${idx}`} calls={pendingBucket} />);
              pendingBucket = [];
            };
            for (let i = 0; i < pendingToolCalls.length; i += 1) {
              const c = pendingToolCalls[i];
              if (!c) continue;
              if (c.toolName === 'set_todos') {
                flushPending(i);
                groups.push(<InlineTodoList key={`p-todos-${i}`} call={c} />);
                continue;
              }
              pendingBucket.push(c);
            }
            flushPending(pendingToolCalls.length);
            return groups;
          })()}
        </div>
      )}
      {/* Store-driven todos (from todos_updated SSE events) */}
      {isGenerating && todos.length > 0 && (
        <div key="store-todos">
          <TodoChecklist todos={todos} />
        </div>
      )}
      {(() => {
        if (!streamingText || streamingText.length === 0) return null;
        // Defensive dedupe: if the most recent persisted assistant_text is
        // already a prefix-equal/superset of the streaming buffer, skip the
        // ephemeral bubble to avoid showing the same prose twice.
        const lastAssistant = [...messages].reverse().find((m) => m.kind === 'assistant_text');
        const lastText =
          (lastAssistant?.payload as { text?: string } | undefined)?.text?.trim() ?? '';
        const streamingTrim = streamingText.trim();
        if (lastText && (lastText === streamingTrim || lastText.startsWith(streamingTrim))) {
          return null;
        }
        return (
          <div key="streaming-assistant">
            <AssistantText text={streamingText} streaming />
          </div>
        );
      })()}
      {(() => {
        // "Agent is thinking" placeholder -- shown only when generating and
        // nothing has arrived yet (no streaming text, last message is the
        // user's prompt).
        if (!isGenerating) return null;
        if (streamingText && streamingText.length > 0) return null;
        const last = messages[messages.length - 1];
        if (last?.kind !== 'user') return null;
        return (
          <div
            key="thinking-placeholder"
            className="inline-flex items-center gap-[var(--space-2)] rounded-2xl rounded-bl-md bg-[var(--color-surface)] border border-[var(--color-border-muted)] px-[var(--space-3)] py-[var(--space-2)] text-[12px] text-[var(--color-text-muted)]"
            aria-live="polite"
          >
            <span className="codesign-stream-dot" />
            <span className="codesign-stream-dot" style={{ animationDelay: '150ms' }} />
            <span className="codesign-stream-dot" style={{ animationDelay: '300ms' }} />
            <span className="ml-[var(--space-1)]">Thinking...</span>
          </div>
        );
      })()}
      <div ref={bottomRef} />
    </div>
  );
}
