interface UserMessageProps {
  text: string;
}

/**
 * User message: right-aligned bubble with gold accent tint background.
 * No "You" label -- bubble alignment carries the role signal.
 */
export function UserMessage({ text }: UserMessageProps) {
  return (
    <div className="flex flex-col items-end gap-[var(--space-1)] pl-[var(--space-6)]">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 px-[var(--space-3)] py-[var(--space-2)] text-[14px] leading-relaxed text-[var(--color-text-primary)] whitespace-pre-wrap break-words">
        {text}
      </div>
    </div>
  );
}
