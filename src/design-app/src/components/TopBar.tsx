import { useStore } from '../store';

export function TopBar() {
  const { currentDesignId, designs, view, generationStage } = useStore();
  const currentDesign = designs.find((d) => d.id === currentDesignId);

  return (
    <div className="flex items-center justify-between h-12 px-4 border-b border-[var(--border)] bg-[var(--bg)] flex-shrink-0">
      <div className="flex items-center gap-3">
        <a href="/chat" className="text-lg" title="Back to Lucy" style={{ color: 'var(--accent)' }}>&#10022;</a>
        <span className="text-xs text-[var(--text-dim)]">/</span>
        {view === 'workspace' && currentDesign ? (
          <span className="text-sm font-medium">{currentDesign.name}</span>
        ) : (
          <span className="text-sm font-medium">Design Studio</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {generationStage !== 'idle' && generationStage !== 'done' && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            {generationStage === 'thinking' ? 'Thinking' : generationStage === 'streaming' ? 'Building' : 'Sending'}
          </div>
        )}
        {view === 'workspace' && (
          <button
            onClick={() => useStore.setState({ view: 'hub', currentDesignId: null })}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            All Designs
          </button>
        )}
      </div>
    </div>
  );
}
