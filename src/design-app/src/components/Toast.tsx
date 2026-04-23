export function Toast({ message, type, onDismiss }: { message: string; type: 'info' | 'error'; onDismiss: () => void }) {
  return (
    <div
      className={`px-4 py-3 rounded-lg text-sm shadow-lg flex items-center gap-2 ${type === 'error' ? 'bg-red-900/80 text-red-200' : 'bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)]'}`}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-[var(--text-muted)] hover:text-[var(--text)]">&times;</button>
    </div>
  );
}
