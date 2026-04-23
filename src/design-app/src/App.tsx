import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { PreviewPane } from './components/PreviewPane';
import { TopBar } from './components/TopBar';
import { Toast } from './components/Toast';

export function App() {
  const { view, loadDesigns, toasts, dismissToast } = useStore();
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const isDragging = useRef(false);

  useEffect(() => { loadDesigns(); }, [loadDesigns]);

  const handleMouseDown = useCallback(() => { isDragging.current = true; }, []);
  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const newWidth = Math.max(320, Math.min(600, e.clientX));
    setSidebarWidth(newWidth);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        useStore.getState().createDesign();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      className="flex flex-col h-full"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: sidebarWidth, flexShrink: 0 }} className="flex flex-col border-r border-[var(--border)]">
          <Sidebar />
        </div>
        <div className="resize-handle" onMouseDown={handleMouseDown} />
        <div className="flex-1 flex flex-col overflow-hidden">
          {view === 'workspace' ? (
            <PreviewPane />
          ) : (
            <HubPlaceholder />
          )}
        </div>
      </div>
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <Toast key={t.id} message={t.message} type={t.type} onDismiss={() => dismissToast(t.id)} />
        ))}
      </div>
    </div>
  );
}

function HubPlaceholder() {
  const { designs, switchDesign, createDesign } = useStore();
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center">
        <div className="text-4xl mb-4">&#10022;</div>
        <h1 className="text-2xl font-semibold mb-2" style={{ fontFamily: 'var(--font-serif)' }}>Design Studio</h1>
        <p className="text-[var(--text-muted)] mb-8">Create production-quality web designs with AI</p>
        <button
          onClick={() => createDesign()}
          className="px-6 py-3 rounded-lg font-medium text-black"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}
        >
          New Design
        </button>
        {designs.length > 0 && (
          <div className="mt-8 text-left">
            <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3">Recent Designs</h3>
            <div className="space-y-2">
              {designs.slice(0, 5).map((d) => (
                <button
                  key={d.id}
                  onClick={() => switchDesign(d.id)}
                  className="w-full text-left px-4 py-3 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors border border-[var(--border-subtle)]"
                >
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">{new Date(d.updated_at).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
