interface AssistantTextProps {
  text: string;
  /** When true, append animated dots after the text to signal streaming. */
  streaming?: boolean;
}

/**
 * Simple markdown-like rendering without a full markdown library.
 * Handles paragraphs, bold, inline code, code blocks, and links.
 */
function renderSimpleMarkdown(text: string): React.ReactNode[] {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // Code block
    if (trimmed.startsWith('```')) {
      const lines = trimmed.split('\n');
      const code = lines.slice(1, lines[lines.length - 1] === '```' ? -1 : undefined).join('\n');
      return (
        <pre key={i} className="codesign-prose">
          <code>{code}</code>
        </pre>
      );
    }

    // Inline formatting: bold, code, links
    const parts = trimmed.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
    const formatted = parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={j}>{part.slice(1, -1)}</code>;
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a key={j} href={linkMatch[2]} target="_blank" rel="noopener noreferrer">
            {linkMatch[1]}
          </a>
        );
      }
      return part;
    });

    return <p key={i}>{formatted}</p>;
  });
}

export function AssistantText({ text, streaming }: AssistantTextProps) {
  return (
    <div className="space-y-[var(--space-1_5)]">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-[var(--color-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-[var(--color-border-muted)] px-[var(--space-3)] py-[var(--space-2)] text-[14px] leading-relaxed text-[var(--color-text-primary)] break-words codesign-prose"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {renderSimpleMarkdown(text)}
      </div>
      {streaming ? (
        <div
          className="flex items-center gap-[5px] pl-[var(--space-2)] h-[16px]"
          aria-label="Streaming response"
        >
          <span className="codesign-stream-dot" />
          <span className="codesign-stream-dot" style={{ animationDelay: '150ms' }} />
          <span className="codesign-stream-dot" style={{ animationDelay: '300ms' }} />
        </div>
      ) : null}
    </div>
  );
}
