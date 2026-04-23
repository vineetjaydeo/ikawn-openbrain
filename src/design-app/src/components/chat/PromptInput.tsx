import { useState, useRef, useCallback } from 'react';
import { useStore } from '../../store';

export function PromptInput() {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendPrompt, isGenerating, cancelGeneration } = useStore();

  const handleSubmit = useCallback(() => {
    if (!text.trim() || isGenerating) return;
    sendPrompt(text.trim());
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, isGenerating, sendPrompt]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => { setText(e.target.value); handleInput(); }}
        onKeyDown={handleKeyDown}
        placeholder={isGenerating ? 'Generating...' : 'Describe what you want to build...'}
        disabled={isGenerating}
        rows={1}
        className="w-full resize-none rounded-xl px-4 py-3 pr-12 text-sm bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
      />
      <button
        onClick={isGenerating ? cancelGeneration : handleSubmit}
        disabled={!isGenerating && !text.trim()}
        className="absolute right-2 bottom-2 w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 transition-all"
        style={{ background: isGenerating ? 'var(--error)' : text.trim() ? 'var(--accent)' : 'transparent' }}
        title={isGenerating ? 'Cancel' : 'Send'}
      >
        {isGenerating ? (
          <svg viewBox="0 0 24 24" fill="white" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke={text.trim() ? 'black' : 'var(--text-muted)'} strokeWidth="2" width="16" height="16"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
        )}
      </button>
    </div>
  );
}
