import { ChevronDown, Cpu, Sparkles, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDesignStore } from '../store';
import { Button } from './ui';

/** Lucy model tiers -- server-side model selection, no API keys needed. */
export type ModelTier = 'standard' | 'advanced' | 'premium';

interface TierOption {
  id: ModelTier;
  label: string;
  description: string;
  icon: typeof Zap;
}

const TIERS: TierOption[] = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'Fast, everyday designs',
    icon: Zap,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Complex, multi-component designs',
    icon: Cpu,
  },
  {
    id: 'premium',
    label: 'Premium',
    description: 'Highest quality output',
    icon: Sparkles,
  },
];

interface ModelSwitcherProps {
  variant: 'topbar' | 'sidebar';
}

export function ModelSwitcher({ variant }: ModelSwitcherProps) {
  // Model tier is local UI state until the store gains a dedicated field.
  // The selected tier is sent along with generation requests.
  const addToast = useDesignStore((s) => s.addToast);
  const [tier, setTier] = useState<ModelTier>('standard');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activeTier = TIERS.find((t) => t.id === tier) ?? TIERS[0];
  const ActiveIcon = activeTier.icon;
  const isSidebar = variant === 'sidebar';

  function switchTier(next: ModelTier) {
    if (next === tier) {
      setOpen(false);
      return;
    }
    setTier(next);
    setOpen(false);
    addToast({
      variant: 'info',
      title: `Switched to ${TIERS.find((t) => t.id === next)?.label ?? next}`,
    });
  }

  return (
    <div ref={rootRef} className="relative w-fit">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          isSidebar
            ? 'inline-flex items-center gap-[3px] text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer'
            : 'flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-2_5)] py-[var(--space-1)] select-none hover:bg-[var(--color-surface-hover)] transition-colors'
        }
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {isSidebar ? (
          <span className="truncate" style={{ fontFamily: 'var(--font-mono)' }}>
            {activeTier.label}
          </span>
        ) : (
          <span className="text-[var(--text-xs)] leading-none flex items-center gap-[6px]">
            <ActiveIcon className="w-3 h-3 text-[var(--color-text-secondary)]" aria-hidden />
            <span className="text-[var(--color-text-secondary)]">{activeTier.label}</span>
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${isSidebar ? '' : 'text-[var(--color-text-muted)]'}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className={`absolute z-50 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[var(--shadow-card)] ${
            isSidebar
              ? 'bottom-full mb-[var(--space-1)] left-0 min-w-[240px]'
              : 'top-full mt-[var(--space-1)] right-0 min-w-[260px]'
          }`}
        >
          <div className="py-[var(--space-1)]">
            {TIERS.map((t) => {
              const isActive = t.id === tier;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => switchTier(t.id)}
                  className={`relative w-full text-left px-[var(--space-3)] py-[var(--space-2)] transition-colors ${
                    isActive
                      ? 'bg-[var(--color-surface-hover)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-[4px] bottom-[4px] w-[2px] rounded-r-full bg-[var(--color-accent)]"
                    />
                  )}
                  <div className="flex items-center gap-[var(--space-2_5)]">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'
                      }`}
                      aria-hidden
                    />
                    <div className="flex flex-col gap-[1px]">
                      <span
                        className={`text-[12px] leading-[var(--leading-ui)] ${
                          isActive ? 'font-medium' : ''
                        }`}
                      >
                        {t.label}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-muted)] leading-[var(--leading-ui)]">
                        {t.description}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
