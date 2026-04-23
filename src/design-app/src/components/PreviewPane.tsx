import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { buildSrcdoc } from '../lib/runtime';
import { PreviewToolbar } from './PreviewToolbar';

const VIEWPORT_SIZES = {
  desktop: { width: '100%', height: '100%' },
  tablet: { width: '768px', height: '100%' },
  mobile: { width: '375px', height: '100%' },
};

export function PreviewPane() {
  const { previewHtml, previewViewport, generationStage } = useStore();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current || !previewHtml) return;
    iframeRef.current.srcdoc = buildSrcdoc(previewHtml);
  }, [previewHtml]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'IFRAME_ERROR') {
        console.warn('[Preview] iframe error:', e.data.error);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const viewport = VIEWPORT_SIZES[previewViewport];

  if (!previewHtml && generationStage === 'idle') {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-dim)] text-sm">
        Preview will appear here
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <PreviewToolbar />
      <div className="flex-1 flex items-start justify-center overflow-auto bg-[var(--bg-surface)] p-4">
        <div
          className="bg-white rounded-lg overflow-hidden shadow-2xl transition-all duration-300"
          style={{ width: viewport.width, height: viewport.height, maxHeight: '100%' }}
        >
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-full border-0"
            title="Design Preview"
          />
        </div>
      </div>
    </div>
  );
}
