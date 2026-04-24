import { FolderOpen } from 'lucide-react';
import { type HubTab, useDesignStore } from '../store';

const HUB_TABS: { key: HubTab; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'your', label: 'Your Designs' },
  { key: 'examples', label: 'Examples' },
];

export function TopBar() {
  const setView = useDesignStore((s) => s.setView);
  const view = useDesignStore((s) => s.view);
  const currentDesignId = useDesignStore((s) => s.currentDesignId);
  const designs = useDesignStore((s) => s.designs);
  const currentDesign = designs.find((d) => d.id === currentDesignId);
  const hubTab = useDesignStore((s) => s.hubTab);
  const setHubTab = useDesignStore((s) => s.setHubTab);
  const generationStage = useDesignStore((s) => s.generationStage);

  return (
    <header
      className="h-12 shrink-0 flex items-center justify-between pr-6 select-none"
      style={{
        paddingLeft: 'var(--space-4)',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-background)',
      }}
    >
      {/* Left: wordmark + navigation */}
      <div className="flex items-center gap-6 min-w-0 h-full">
        {/* Gold sparkle + brand */}
        <a
          href="/chat"
          className="flex items-center gap-2 no-underline"
          title="Back to Lucy"
        >
          <span
            className="text-lg leading-none"
            style={{ color: 'var(--accent)' }}
            aria-hidden
          >
            &#10022;
          </span>
          <span
            className="text-[15px] font-medium"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.015em',
            }}
          >
            Design Studio
          </span>
        </a>

        {view === 'hub' ? (
          <nav
            className="flex items-center gap-6 h-full"
            aria-label="Hub navigation"
          >
            {HUB_TABS.map(({ key, label }) => {
              const active = key === hubTab;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHubTab(key)}
                  aria-current={active ? 'page' : undefined}
                  className="relative h-full inline-flex items-center transition-colors duration-150"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '15px',
                    fontWeight: active ? 500 : 400,
                    color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    letterSpacing: '-0.015em',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.color = 'var(--color-text-muted)';
                  }}
                >
                  {label}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute left-0 right-0 bottom-[-1px] h-[2px] rounded-full"
                      style={{ background: 'var(--color-accent)' }}
                    />
                  ) : null}
                </button>
              );
            })}
          </nav>
        ) : (
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--color-text-muted)', opacity: 0.4 }}>/</span>
            <button
              type="button"
              onClick={() => setView('hub')}
              aria-label="Open all designs"
              className="inline-flex items-center gap-[6px] rounded-[var(--radius-sm)] px-2 py-1 transition-colors duration-150 max-w-[520px]"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '15px',
                letterSpacing: '-0.015em',
                color: 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-text-primary)';
                e.currentTarget.style.background = 'var(--color-surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-secondary)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <FolderOpen className="w-4 h-4 shrink-0" aria-hidden />
              <span className="truncate" title={currentDesign?.name ?? ''}>
                {currentDesign?.name ?? 'Untitled Design'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Right: generation status */}
      <div className="flex items-center gap-3">
        {generationStage !== 'idle' && generationStage !== 'done' && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent)' }}>
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: 'var(--accent)' }}
            />
            {generationStage === 'thinking'
              ? 'Thinking'
              : generationStage === 'streaming'
                ? 'Building'
                : 'Sending'}
          </div>
        )}
        {view === 'workspace' && (
          <button
            type="button"
            onClick={() => setView('hub')}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            All Designs
          </button>
        )}
      </div>
    </header>
  );
}
