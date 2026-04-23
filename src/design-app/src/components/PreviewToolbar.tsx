import { useStore } from '../store';

export function PreviewToolbar() {
  const { previewViewport, setPreviewViewport, previewHtml } = useStore();

  const viewports = [
    { key: 'desktop' as const, label: 'Desktop' },
    { key: 'tablet' as const, label: 'Tablet' },
    { key: 'mobile' as const, label: 'Mobile' },
  ];

  const handleNewTab = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const handleDownload = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'design.html';
    a.click();
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center gap-1">
        {viewports.map((v) => (
          <button
            key={v.key}
            onClick={() => setPreviewViewport(v.key)}
            className={`px-2 py-1 rounded text-xs transition-colors ${previewViewport === v.key ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
            title={v.label}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleNewTab}
          disabled={!previewHtml}
          className="px-2 py-1 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 transition-colors"
          title="Open in new tab"
        >
          Open
        </button>
        <button
          onClick={handleDownload}
          disabled={!previewHtml}
          className="px-2 py-1 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 transition-colors"
          title="Download HTML"
        >
          Download
        </button>
      </div>
    </div>
  );
}
