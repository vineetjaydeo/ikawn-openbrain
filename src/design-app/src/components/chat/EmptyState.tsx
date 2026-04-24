import { ArrowUpRight } from 'lucide-react';

interface StarterCard {
  label: string;
  description: string;
  prompt: string;
}

const STARTER_CARDS: StarterCard[] = [
  {
    label: 'SaaS Pricing Page',
    description: 'Dark theme with gradient accents and toggle',
    prompt: 'A sleek SaaS pricing page with dark theme, gradient accents, and a monthly/annual toggle',
  },
  {
    label: 'Modern Portfolio',
    description: 'Bento grid layout with smooth animations',
    prompt: 'A modern portfolio site with bento grid layout, smooth scroll animations, and a project showcase',
  },
  {
    label: 'E-commerce Product Page',
    description: 'Image gallery and sticky add-to-cart',
    prompt: 'An e-commerce product page with image gallery, size selector, reviews section, and sticky add-to-cart',
  },
  {
    label: 'Dashboard with Charts',
    description: 'Stats cards, charts, and a data table',
    prompt: 'A dashboard with stats cards, line/bar charts, a clean data table, and a sidebar navigation',
  },
];

export interface EmptyStateProps {
  onPickStarter: (prompt: string) => void;
}

export function EmptyState({ onPickStarter }: EmptyStateProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-[var(--space-2)] py-[var(--space-8)]">
      <div className="w-full max-w-[320px] flex flex-col items-center text-center">
        <span
          className="text-[28px] leading-none text-[var(--color-accent)]"
          aria-hidden
        >
          &#10022;
        </span>
        <h2
          className="mt-[var(--space-2)] text-[var(--text-xl)] leading-[var(--leading-heading)] tracking-[var(--tracking-heading)] text-[var(--color-text-primary)]"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
        >
          What would you like to design?
        </h2>
        <p className="mt-[var(--space-2)] text-[var(--text-sm)] text-[var(--color-text-secondary)] leading-[var(--leading-body)]">
          Describe a page, and Lucy will build it for you.
        </p>

        <div
          className="mt-[var(--space-6)] mb-[var(--space-2_5)] text-[10px] uppercase tracking-[var(--tracking-label)] text-[var(--color-text-muted)] self-start pl-[var(--space-1)]"
          aria-hidden
        >
          Try a starter
        </div>

        <div className="w-full flex flex-col gap-[var(--space-1_5)]">
          {STARTER_CARDS.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => onPickStarter(card.prompt)}
              className="group w-full text-left rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2_5)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-hover)] transition-colors duration-150 ease-out"
            >
              <div className="flex items-start gap-[var(--space-2)]">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
                    {card.label}
                  </div>
                  <div className="text-[11.5px] text-[var(--color-text-muted)] truncate mt-[2px]">
                    {card.description}
                  </div>
                </div>
                <ArrowUpRight
                  className="w-[14px] h-[14px] text-[var(--color-text-muted)] shrink-0 mt-[2px] opacity-0 -translate-x-0.5 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-[var(--color-accent)] transition-all duration-150 ease-out"
                  strokeWidth={2}
                  aria-hidden
                />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
