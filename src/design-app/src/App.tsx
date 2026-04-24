import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { PreviewPane } from './components/PreviewPane';
import { TopBar } from './components/TopBar';
import { ToastViewport } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useDesignStore } from './store';

export function App() {
  const loadDesigns = useDesignStore((s) => s.loadDesigns);
  const switchDesign = useDesignStore((s) => s.switchDesign);
  const sendPrompt = useDesignStore((s) => s.sendPrompt);
  const isGenerating = useDesignStore(
    (s) => s.isGenerating && s.generatingDesignId === s.currentDesignId,
  );
  const setView = useDesignStore((s) => s.setView);
  const view = useDesignStore((s) => s.view);
  const designsViewOpen = useDesignStore((s) => s.designsViewOpen);
  const closeDesignsView = useDesignStore((s) => s.closeDesignsView);
  const createNewDesign = useDesignStore((s) => s.createNewDesign);
  const designToDelete = useDesignStore((s) => s.designToDelete);
  const designToRename = useDesignStore((s) => s.designToRename);
  const requestDeleteDesign = useDesignStore((s) => s.requestDeleteDesign);
  const requestRenameDesign = useDesignStore((s) => s.requestRenameDesign);

  const [prompt, setPrompt] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    Math.max(320, Math.round(window.innerWidth * 0.25)),
  );
  const [isResizing, setIsResizing] = useState(false);

  // Once the user has visited Hub we keep HubView mounted (toggled via
  // `hidden`) so going Workspace -> Hub doesn't tear down the design-card
  // iframes and pay the srcDoc parse cost again.
  const [hubMounted, setHubMounted] = useState(view === 'hub');
  useEffect(() => {
    if (view === 'hub') setHubMounted(true);
  }, [view]);

  // Same trick for workspace -- once visited, keep PreviewPane mounted so the
  // iframe pool survives Workspace <-> Hub round trips.
  const [workspaceMounted, setWorkspaceMounted] = useState(view === 'workspace');
  useEffect(() => {
    if (view === 'workspace') setWorkspaceMounted(true);
  }, [view]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const onMove = (ev: MouseEvent) => {
      const maxW = Math.round(window.innerWidth * 0.55);
      const clamped = Math.min(Math.max(ev.clientX, 280), maxW);
      setSidebarWidth(clamped);
    };
    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    async function bootstrap(): Promise<void> {
      await loadDesigns();
      const state = useDesignStore.getState();
      if (state.currentDesignId === null && state.designs.length > 0) {
        const first = state.designs[0];
        if (first) await switchDesign(first.id);
      }
    }
    void bootstrap();
  }, [loadDesigns, switchDesign]);

  function submit(): void {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;
    void sendPrompt({ prompt: trimmed });
    setPrompt('');
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+N -- new design
      if (mod && e.key === 'n') {
        e.preventDefault();
        void createNewDesign();
        return;
      }

      // Escape -- close dialogs / return to hub
      if (e.key === 'Escape') {
        if (designToDelete) {
          requestDeleteDesign(null);
          return;
        }
        if (designToRename) {
          requestRenameDesign(null);
          return;
        }
        if (designsViewOpen) {
          closeDesignsView();
          return;
        }
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    createNewDesign,
    designToDelete,
    designToRename,
    designsViewOpen,
    closeDesignsView,
    requestDeleteDesign,
    requestRenameDesign,
  ]);

  return (
    <ErrorBoundary scope="app">
      <div className="h-full flex flex-col bg-[var(--color-background)]">
        <TopBar />
        <div className="flex-1 min-h-0 relative">
          {hubMounted ? (
            <div hidden={view !== 'hub'} className="h-full">
              <HubView
                onUseExamplePrompt={async (p) => {
                  const created = await createNewDesign();
                  if (!created) return;
                  setPrompt(p);
                  setView('workspace');
                }}
              />
            </div>
          ) : null}
          {workspaceMounted ? (
            <div hidden={view !== 'workspace'} className="h-full flex flex-col">
              <div className="flex-1 min-h-0 flex relative">
                {isResizing && <div className="absolute inset-0 z-20 cursor-col-resize" />}
                <div className="relative shrink-0" style={{ width: sidebarWidth }}>
                  <ErrorBoundary scope="sidebar">
                    <Sidebar prompt={prompt} setPrompt={setPrompt} onSubmit={submit} />
                  </ErrorBoundary>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    onMouseDown={onResizeStart}
                    className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize z-10 hover:bg-[var(--accent)]/15 active:bg-[var(--accent)]/25 transition-colors duration-100"
                    style={{ transform: 'translateX(50%)' }}
                  />
                </div>
                <main className="flex flex-col min-h-0 flex-1 min-w-0">
                  <ErrorBoundary scope="preview">
                    <PreviewPane onPickStarter={(p) => setPrompt(p)} />
                  </ErrorBoundary>
                </main>
              </div>
            </div>
          ) : null}
        </div>
        <ToastViewport />
      </div>
    </ErrorBoundary>
  );
}

/* ── Inline Hub View ──────────────────────────────────────────────────── */

function HubView({ onUseExamplePrompt }: { onUseExamplePrompt: (prompt: string) => void }) {
  const designs = useDesignStore((s) => s.designs);
  const switchDesign = useDesignStore((s) => s.switchDesign);
  const createNewDesign = useDesignStore((s) => s.createNewDesign);
  const setView = useDesignStore((s) => s.setView);

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center">
        <div
          className="text-4xl mb-4"
          style={{ color: 'var(--accent)' }}
          aria-hidden
        >
          &#10022;
        </div>
        <h1
          className="text-2xl font-semibold mb-2"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Design Studio
        </h1>
        <p className="text-[var(--color-text-muted)] mb-8">
          Create production-quality web designs with AI
        </p>
        <button
          onClick={async () => {
            const d = await createNewDesign();
            if (d) setView('workspace');
          }}
          className="px-6 py-3 rounded-lg font-medium text-[var(--color-on-accent)]"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}
        >
          New Design
        </button>
        {designs.length > 0 && (
          <div className="mt-8 text-left">
            <h3 className="text-sm font-medium text-[var(--color-text-muted)] mb-3">
              Recent Designs
            </h3>
            <div className="space-y-2">
              {designs.slice(0, 5).map((d) => (
                <button
                  key={d.id}
                  onClick={async () => {
                    await switchDesign(d.id);
                    setView('workspace');
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors border border-[var(--color-border-subtle)]"
                >
                  <div className="font-medium text-[var(--color-text-primary)]">{d.name}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {new Date(d.updated_at).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
