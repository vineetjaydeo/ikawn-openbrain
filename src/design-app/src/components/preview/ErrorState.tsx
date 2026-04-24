import { AlertTriangle, Copy, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/Button';

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  onDismiss?: () => void;
}

export function ErrorState({ message, onRetry, onDismiss }: ErrorStateProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="h-full flex items-center justify-center p-[var(--space-6)]">
      <div className="max-w-lg w-full rounded-[var(--radius-2xl)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg p-[var(--space-6)]">
        <div className="flex items-start gap-[var(--space-3)] mb-[var(--space-4)]">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              Something went wrong
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              The generation encountered an error. You can retry or copy the details below.
            </p>
          </div>
        </div>
        <pre className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-background-secondary)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-3 mb-4 whitespace-pre-wrap break-words font-mono">
          {message}
        </pre>
        <div className="flex items-center gap-2 justify-end">
          {onDismiss ? (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Close
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={copy}>
            <Copy className="w-4 h-4" />
            {copied ? 'Copied' : 'Copy error'}
          </Button>
          <Button variant="primary" size="sm" onClick={onRetry}>
            <RotateCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
