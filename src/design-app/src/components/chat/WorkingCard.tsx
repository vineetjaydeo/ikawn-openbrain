import type { TodoItem } from '../../types';

export function WorkingCard({ text, todos }: { text: string; todos: TodoItem[] }) {
  return (
    <div className="space-y-3">
      {todos.length > 0 && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Plan</div>
          {todos.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-0.5">
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${t.done ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'}`}>
                {t.done && <svg viewBox="0 0 24 24" fill="black" width="10" height="10"><polyline points="20 6 9 17 4 12" fill="none" stroke="black" strokeWidth="3"/></svg>}
              </div>
              <span className={t.done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text)]'}>{t.label}</span>
            </div>
          ))}
        </div>
      )}
      {text && (
        <div className="text-sm leading-relaxed animate-pulse" style={{ fontFamily: 'var(--font-serif)' }}>
          {text}
          <span className="inline-block w-1.5 h-4 bg-[var(--accent)] ml-0.5 animate-pulse" />
        </div>
      )}
      {!text && todos.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          Thinking...
        </div>
      )}
    </div>
  );
}
