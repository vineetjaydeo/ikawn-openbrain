import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildSrcdoc } from '../lib/runtime';
import { useDesignStore } from '../store';
import { CanvasTabBar } from './CanvasTabBar';
import { PhoneFrame } from './PhoneFrame';
import { PreviewToolbar } from './PreviewToolbar';
import { EmptyState } from './preview/EmptyState';
import { ErrorState } from './preview/ErrorState';

export interface PreviewPaneProps {
  onPickStarter: (prompt: string) => void;
}

export function formatIframeError(
  kind: string,
  message: string,
  source?: string,
  lineno?: number,
): string {
  const location = source && lineno ? ` (${source}:${lineno})` : '';
  return `${kind}: ${message}${location}`;
}

export function isTrustedPreviewMessageSource(
  source: MessageEventSource | null,
  previewWindow: Window | null | undefined,
): boolean {
  return source !== null && source === previewWindow;
}

export function stablePreviewSourceKey(source: string): string {
  const head = source.trimStart().slice(0, 2048).toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html')) return source;
  return source
    .replace(
      /\/\*\s*EDITMODE-BEGIN\s*\*\/[\s\S]*?\/\*\s*EDITMODE-END\s*\*\//g,
      '/*EDITMODE-BEGIN*/__STABLE__/*EDITMODE-END*/',
    )
    .replace(
      /\/\*\s*TWEAK-SCHEMA-BEGIN\s*\*\/[\s\S]*?\/\*\s*TWEAK-SCHEMA-END\s*\*\//g,
      '/*TWEAK-SCHEMA-BEGIN*/__STABLE__/*TWEAK-SCHEMA-END*/',
    );
}

interface PreviewSlotProps {
  designId: string;
  html: string;
  active: boolean;
  viewport: 'mobile' | 'tablet' | 'desktop';
  zoom: number;
  registerIframe: (designId: string, el: HTMLIFrameElement | null) => void;
  onIframeError: (message: string) => void;
  onIframeLoaded: (designId: string) => void;
}

function PreviewSlot({
  designId,
  html,
  active,
  viewport,
  zoom,
  registerIframe,
  onIframeError,
  onIframeLoaded,
}: PreviewSlotProps) {
  const srcDocStableKey = useMemo(() => stablePreviewSourceKey(html), [html]);
  const srcDoc = useMemo(() => buildSrcdoc(html), [srcDocStableKey]);

  const setRef = useCallback(
    (el: HTMLIFrameElement | null) => registerIframe(designId, el),
    [designId, registerIframe],
  );

  const isMobile = viewport === 'mobile';
  const scale = zoom / 100;
  const inversePct = `${10000 / zoom}%`;

  const rawIframe = (
    <iframe
      ref={setRef}
      title={`design-preview-${designId}`}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      onLoad={() => {
        if (!active) return;
        onIframeLoaded(designId);
      }}
      className={
        isMobile
          ? 'block w-full h-full bg-transparent border-0'
          : 'w-full h-full bg-transparent border-0'
      }
    />
  );

  const iframe =
    zoom === 100 ? (
      rawIframe
    ) : (
      <div
        className="origin-top-left"
        style={{ transform: `scale(${scale})`, width: inversePct, height: inversePct }}
      >
        {rawIframe}
      </div>
    );

  let body: React.ReactNode;
  if (isMobile) {
    body = (
      <div className="min-h-full p-6 flex flex-col items-center justify-center overflow-auto">
        <div className="relative inline-flex">
          <PhoneFrame>{iframe}</PhoneFrame>
        </div>
      </div>
    );
  } else if (viewport === 'tablet') {
    body = (
      <div className="h-full p-6 flex flex-col items-center justify-start overflow-auto">
        <div
          className="relative"
          style={{
            width: 'var(--size-preview-tablet-width, 768px)',
            height: 'var(--size-preview-tablet-height, 1024px)',
            flexShrink: 0,
          }}
        >
          {iframe}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="h-full w-full relative">
        {iframe}
      </div>
    );
  }

  return (
    <div hidden={!active} className="h-full w-full">
      {body}
    </div>
  );
}

export function PreviewPane({ onPickStarter }: PreviewPaneProps) {
  const previewHtml = useDesignStore((s) => s.previewHtml);
  const previewHtmlByDesign = useDesignStore((s) => s.previewHtmlByDesign);
  const recentDesignIds = useDesignStore((s) => s.recentDesignIds);
  const currentDesignId = useDesignStore((s) => s.currentDesignId);
  const designs = useDesignStore((s) => s.designs);
  const chatMessages = useDesignStore((s) => s.chatMessages);
  const canvasTabs = useDesignStore((s) => s.canvasTabs);
  const errorMessage = useDesignStore((s) => s.errorMessage);
  const retry = useDesignStore((s) => s.retryLastPrompt);
  const clearError = useDesignStore((s) => s.clearError);
  const addToast = useDesignStore((s) => s.addToast);
  const previewViewport = useDesignStore((s) => s.previewViewport);
  const previewZoom = useDesignStore((s) => s.previewZoom);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframesByDesign = useRef<Map<string, HTMLIFrameElement>>(new Map());
  const [, setIframeLoadTick] = useState(0);

  const registerIframe = useCallback((designId: string, el: HTMLIFrameElement | null) => {
    if (el) {
      iframesByDesign.current.set(designId, el);
    } else {
      iframesByDesign.current.delete(designId);
    }
  }, []);

  const handleIframeLoaded = useCallback(
    (designId: string) => {
      if (designId === currentDesignId) setIframeLoadTick((t) => t + 1);
    },
    [currentDesignId],
  );

  const handleIframeError = useCallback(
    (message: string) => {
      addToast({ variant: 'error', title: 'Preview error', description: message });
    },
    [addToast],
  );

  useEffect(() => {
    if (currentDesignId === null) {
      iframeRef.current = null;
      return;
    }
    const el = iframesByDesign.current.get(currentDesignId) ?? null;
    iframeRef.current = el;
  }, [currentDesignId]);

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (!isTrustedPreviewMessageSource(event.source, iframeRef.current?.contentWindow)) return;

      const data = event.data;
      if (typeof data !== 'object' || data === null) return;
      const envelope = data as { type?: string };

      if (envelope.type === 'IFRAME_ERROR') {
        const msg = data as { kind?: string; message?: string; source?: string; lineno?: number };
        handleIframeError(
          formatIframeError(
            msg.kind ?? 'Error',
            msg.message ?? 'Unknown error',
            msg.source,
            msg.lineno,
          ),
        );
      } else if (envelope.type === 'ELEMENT_SELECTED') {
        const msg = data as { selector?: string; tag?: string };
        console.debug('[PreviewPane] element selected:', msg.selector, msg.tag);
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleIframeError]);

  const poolEntries = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; html: string }> = [];
    if (currentDesignId !== null) {
      const html = previewHtml ?? previewHtmlByDesign[currentDesignId];
      if (typeof html === 'string' && html.length > 0) {
        out.push({ id: currentDesignId, html });
        seen.add(currentDesignId);
      }
    }
    for (const id of recentDesignIds) {
      if (seen.has(id)) continue;
      const html = previewHtmlByDesign[id];
      if (typeof html === 'string' && html.length > 0) {
        out.push({ id, html });
        seen.add(id);
      }
    }
    return out;
  }, [currentDesignId, previewHtml, previewHtmlByDesign, recentDesignIds]);

  const activeHasHtml =
    currentDesignId !== null && poolEntries.some((e) => e.id === currentDesignId);

  const currentDesign = currentDesignId
    ? designs.find((d) => d.id === currentDesignId)
    : undefined;
  const designHasContent =
    currentDesign !== undefined &&
    ((currentDesign.thumbnail_text !== null && currentDesign.thumbnail_text.length > 0) ||
      chatMessages.length > 0);

  let body: React.ReactNode;
  if (errorMessage && !previewHtml) {
    body = (
      <ErrorState
        message={errorMessage}
        onRetry={() => {
          void retry();
        }}
        onDismiss={clearError}
      />
    );
  } else {
    body = (
      <div className="relative h-full w-full">
        {poolEntries.map((entry) => (
          <PreviewSlot
            key={entry.id}
            designId={entry.id}
            html={entry.html}
            active={entry.id === currentDesignId}
            viewport={previewViewport}
            zoom={previewZoom}
            registerIframe={registerIframe}
            onIframeError={handleIframeError}
            onIframeLoaded={handleIframeLoaded}
          />
        ))}
        {!activeHasHtml ? (
          designHasContent ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-background)]">
              <div className="w-[60%] max-w-[720px] aspect-[4/3] rounded-[var(--radius-lg)] bg-[linear-gradient(110deg,var(--color-background-secondary)_0%,rgba(0,0,0,0.03)_40%,var(--color-background-secondary)_80%)] animate-pulse" />
            </div>
          ) : (
            <EmptyState onPickStarter={onPickStarter} />
          )
        ) : null}
      </div>
    );
  }

  const hasTabs = canvasTabs.length > 0;
  const isWelcome = !errorMessage && !previewHtml && !designHasContent;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex flex-col min-h-0 flex-1">
        {isWelcome ? null : (
          <div className="flex items-stretch justify-between gap-[var(--space-2)] border-b border-[var(--color-border-muted)] bg-[var(--color-background-secondary)] pl-[var(--space-2)]">
            {hasTabs ? <CanvasTabBar /> : <div />}
            <PreviewToolbar />
          </div>
        )}
        <div className="relative flex-1 overflow-hidden">
          {body}
        </div>
      </div>
    </div>
  );
}
