import { ArrowUp, Square } from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useDesignStore } from '../../store';
import { Tooltip } from '../ui';

const MAX_TEXTAREA_ROWS = 6;

function getTextareaLineHeight(el: HTMLTextAreaElement): number {
  const styles = getComputedStyle(el);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
  const fontSize = Number.parseFloat(styles.fontSize);
  if (!Number.isFinite(fontSize) || fontSize <= 0) return 22;
  return fontSize * 1.55;
}

function resizeTextarea(el: HTMLTextAreaElement): void {
  const rowHeight = getTextareaLineHeight(el);
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, rowHeight * MAX_TEXTAREA_ROWS)}px`;
}

export interface PromptInputProps {
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isGenerating: boolean;
}

export interface PromptInputHandle {
  focus: () => void;
}

/**
 * Prompt textarea + send/stop button.
 *
 * Keybindings:
 *   Enter           -- submit (unless Shift/Meta/Ctrl held)
 *   Meta/Ctrl+Enter -- submit (power-user muscle memory)
 *   Shift+Enter     -- newline
 */
export const PromptInput = forwardRef<PromptInputHandle, PromptInputProps>(function PromptInput(
  { prompt, setPrompt, onSubmit, onCancel, isGenerating },
  ref,
) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const generationStage = useDesignStore((s) => s.generationStage);

  const runningLabel = isGenerating
    ? (() => {
        switch (generationStage) {
          case 'sending':
            return 'Sending...';
          case 'thinking':
            return 'Thinking...';
          case 'streaming':
            return 'Writing...';
          default:
            return 'Thinking...';
        }
      })()
    : null;

  // Elapsed timer -- reassures users that long agent runs are still alive.
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!isGenerating) {
      setElapsedSec(0);
      return;
    }
    const start = Date.now();
    setElapsedSec(0);
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [isGenerating]);

  const elapsedText =
    elapsedSec < 60
      ? `${elapsedSec}s`
      : `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (taRef.current) resizeTextarea(taRef.current);
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => {
      taRef.current?.focus();
    },
  }));

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onSubmit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    const isSendCombo =
      (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) ||
      (e.key === 'Enter' && (e.metaKey || e.ctrlKey));
    if (isSendCombo) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const canSend = prompt.trim().length > 0 && !isGenerating;

  return (
    <form onSubmit={handleSubmit}>
      <div className="relative rounded-[16px] bg-[var(--color-surface)] border-[1.5px] border-[var(--color-border-muted)] focus-within:border-[var(--color-accent)] transition-colors duration-150 ease-out">
        <textarea
          ref={taRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            resizeTextarea(e.currentTarget);
          }}
          onKeyDown={handleKeyDown}
          placeholder={isGenerating ? 'Generating your design...' : 'Describe what you want to build...'}
          rows={1}
          disabled={isGenerating}
          className="block w-full resize-none appearance-none border-0 bg-transparent px-[14px] pt-[12px] pb-[44px] text-[14px] leading-[1.55] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] shadow-none outline-none focus:outline-none focus:ring-0 min-h-[24px] overflow-y-auto disabled:opacity-50"
          style={{ fontFamily: 'var(--font-sans)' }}
        />

        {/* Send / Stop button -- bottom right, circular */}
        <div className="absolute bottom-[8px] right-[8px]">
          {isGenerating ? (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Stop generation"
              className="relative inline-flex items-center justify-center w-[32px] h-[32px] rounded-full bg-[var(--color-error)] text-white shadow-[0_2px_6px_rgba(239,68,68,0.35)] hover:brightness-110 active:scale-[0.92] transition-all duration-150"
            >
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-[var(--color-error)] opacity-40 animate-ping"
              />
              <Square className="relative w-[10px] h-[10px]" strokeWidth={0} fill="currentColor" />
            </button>
          ) : (
            <Tooltip label={!canSend ? 'Type a prompt to send' : undefined} side="top">
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send prompt"
                className="inline-flex items-center justify-center w-[32px] h-[32px] rounded-full bg-[var(--color-accent)] text-white shadow-[0_2px_6px_color-mix(in_srgb,var(--color-accent)_30%,transparent)] hover:bg-[var(--color-accent-hover)] hover:shadow-[0_3px_10px_color-mix(in_srgb,var(--color-accent)_40%,transparent)] active:scale-[0.92] disabled:opacity-25 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-150"
              >
                <ArrowUp className="w-[16px] h-[16px]" strokeWidth={2.5} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      {runningLabel ? (
        <div
          aria-live="polite"
          className="mt-[var(--space-2)] flex items-center justify-between gap-[var(--space-2)] px-[var(--space-1)]"
        >
          <div className="inline-flex items-center gap-[var(--space-1_5)] rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-[var(--space-2)] py-[3px] text-[11px] text-[var(--color-text-secondary)] shadow-[var(--shadow-soft)]">
            <span aria-hidden className="relative inline-flex h-[6px] w-[6px] shrink-0">
              <span className="absolute inset-0 rounded-full bg-[var(--color-accent)] opacity-45 animate-ping" />
              <span className="relative inline-block h-full w-full rounded-full bg-[var(--color-accent)]" />
            </span>
            <span className="whitespace-nowrap">{runningLabel}</span>
          </div>
          <span
            className="text-[11px] text-[var(--color-text-muted)]"
            style={{ fontFamily: 'var(--font-mono)', fontFeatureSettings: "'tnum'" }}
          >
            {elapsedText}
          </span>
        </div>
      ) : null}
    </form>
  );
});
