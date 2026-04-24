import { Download, ExternalLink, Monitor, Smartphone, Tablet, ZoomIn, ZoomOut } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { PreviewViewport } from '../store';
import { useDesignStore } from '../store';
import { IconButton } from './ui/IconButton';

const ZOOM_OPTIONS = [50, 75, 90, 100, 110, 125, 150, 175, 200] as const;

const VIEWPORT_CONFIG: Array<{
  key: PreviewViewport;
  label: string;
  Icon: typeof Monitor;
}> = [
  { key: 'desktop', label: 'Desktop', Icon: Monitor },
  { key: 'tablet', label: 'Tablet', Icon: Tablet },
  { key: 'mobile', label: 'Mobile', Icon: Smartphone },
];

export function PreviewToolbar(): ReactElement {
  const previewHtml = useDesignStore((s) => s.previewHtml);
  const previewViewport = useDesignStore((s) => s.previewViewport);
  const setPreviewViewport = useDesignStore((s) => s.setPreviewViewport);
  const previewZoom = useDesignStore((s) => s.previewZoom);
  const setPreviewZoom = useDesignStore((s) => s.setPreviewZoom);

  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!zoomOpen) return;
    function onClick(e: MouseEvent): void {
      if (zoomRef.current && !zoomRef.current.contains(e.target as Node)) setZoomOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [zoomOpen]);

  const disabled = !previewHtml;

  function handleOpenNewTab() {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  function handleDownload() {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'design.html';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleZoomIn() {
    const idx = ZOOM_OPTIONS.findIndex((v) => v >= previewZoom);
    const next = idx < ZOOM_OPTIONS.length - 1 ? ZOOM_OPTIONS[idx + 1] : ZOOM_OPTIONS[ZOOM_OPTIONS.length - 1];
    setPreviewZoom(next);
  }

  function handleZoomOut() {
    const idx = ZOOM_OPTIONS.findIndex((v) => v >= previewZoom);
    const prev = idx > 0 ? ZOOM_OPTIONS[idx - 1] : ZOOM_OPTIONS[0];
    setPreviewZoom(prev);
  }

  return (
    <div className="ml-auto flex items-center justify-end gap-[var(--space-1)] pr-[var(--space-4)] py-[3px]">
      {/* Viewport buttons */}
      <div className="flex items-center gap-[2px]">
        {VIEWPORT_CONFIG.map(({ key, label, Icon }) => (
          <IconButton
            key={key}
            size="sm"
            label={label}
            disabled={disabled}
            onClick={() => setPreviewViewport(key)}
            className={
              previewViewport === key
                ? 'text-[var(--color-accent)] bg-[var(--color-surface-hover)]'
                : ''
            }
          >
            <Icon className="w-3.5 h-3.5" />
          </IconButton>
        ))}
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-[2px]">
        <IconButton size="sm" label="Zoom out" disabled={disabled} onClick={handleZoomOut}>
          <ZoomOut className="w-3.5 h-3.5" />
        </IconButton>

        <div className="relative" ref={zoomRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setZoomOpen((v) => !v)}
            className="inline-flex items-center justify-center w-[48px] h-8 text-[12px] tabular-nums text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
            aria-haspopup="menu"
            aria-expanded={zoomOpen}
            aria-label="Zoom level"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {previewZoom}%
          </button>

          {zoomOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 w-[56px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg p-1 z-10"
            >
              {ZOOM_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={previewZoom === value}
                  onClick={() => {
                    setPreviewZoom(value);
                    setZoomOpen(false);
                  }}
                  className={`block w-full pr-[10px] py-1 text-[12px] text-right rounded-[var(--radius-sm)] tabular-nums transition-colors duration-100 hover:bg-[var(--color-surface-hover)] ${previewZoom === value ? 'text-[var(--color-accent)] font-medium' : 'text-[var(--color-text-primary)]'}`}
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {value}%
                </button>
              ))}
            </div>
          )}
        </div>

        <IconButton size="sm" label="Zoom in" disabled={disabled} onClick={handleZoomIn}>
          <ZoomIn className="w-3.5 h-3.5" />
        </IconButton>
      </div>

      {/* Open in new tab */}
      <IconButton size="sm" label="Open in new tab" disabled={disabled} onClick={handleOpenNewTab}>
        <ExternalLink className="w-3.5 h-3.5" />
      </IconButton>

      {/* Download */}
      <IconButton size="sm" label="Download HTML" disabled={disabled} onClick={handleDownload}>
        <Download className="w-3.5 h-3.5" />
      </IconButton>
    </div>
  );
}
