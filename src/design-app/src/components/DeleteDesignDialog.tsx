import { useDesignStore } from '../store';
import { Button } from './ui';

export function DeleteDesignDialog() {
  const target = useDesignStore((s) => s.designToDelete);
  const close = useDesignStore((s) => s.requestDeleteDesign);
  const softDeleteDesign = useDesignStore((s) => s.softDeleteDesign);

  if (!target) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete Design"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] animate-[overlay-in_120ms_ease-out]"
      onClick={(e) => {
        if (e.target === e.currentTarget) close(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close(null);
      }}
    >
      <div
        role="document"
        className="w-full max-w-sm rounded-[var(--radius-2xl)] bg-[var(--color-background)] border border-[var(--color-border)] shadow-[var(--shadow-elevated)] p-5 space-y-4 animate-[panel-in_160ms_ease-out]"
      >
        <h3 className="text-[var(--text-md)] font-medium text-[var(--color-text-primary)]">
          Delete Design
        </h3>
        <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)] leading-[var(--leading-body)]">
          Are you sure you want to delete <strong>{target.name}</strong>? This action cannot be
          undone.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => close(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void softDeleteDesign(target.id)}
            className="!bg-[var(--color-error)] hover:!opacity-90"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
