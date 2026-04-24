import { useMemo } from 'react';
import { useDesignStore } from '../store';

export type DesignFileKind = 'html' | 'css' | 'js' | 'asset';

export interface DesignFileEntry {
  path: string;
  kind: DesignFileKind;
  size: number;
}

export interface UseDesignFilesResult {
  /** All files currently tracked for the active design. */
  files: DesignFileEntry[];
  /** True while a generation is in progress (files may still be changing). */
  generating: boolean;
}

/** Infer kind from file extension. */
function inferKind(path: string): DesignFileKind {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'css') return 'css';
  if (ext === 'js' || ext === 'ts' || ext === 'jsx' || ext === 'tsx') return 'js';
  if (ext === 'html' || ext === 'htm') return 'html';
  return 'asset';
}

/**
 * Derive the current design's file list from the store's `previewFiles`
 * record. Each key is a relative path (e.g. "index.html", "styles.css")
 * and the value is the file content string.
 *
 * The hook returns a stable array that only re-computes when the
 * underlying previewFiles map changes.
 */
export function useDesignFiles(): UseDesignFilesResult {
  const previewFiles = useDesignStore((s) => s.previewFiles);
  const previewHtml = useDesignStore((s) => s.previewHtml);
  const currentDesignId = useDesignStore((s) => s.currentDesignId);
  const isGenerating = useDesignStore((s) => s.isGenerating);

  const files = useMemo<DesignFileEntry[]>(() => {
    const entries: DesignFileEntry[] = [];

    // Multi-file entries from previewFiles
    const paths = Object.keys(previewFiles);
    const hasIndex = paths.some((p) => p === 'index.html');

    for (const path of paths) {
      const content = previewFiles[path];
      if (content === undefined) continue;
      entries.push({
        path,
        kind: inferKind(path),
        size: content.length,
      });
    }

    // If previewFiles doesn't include index.html but we have previewHtml,
    // synthesize an entry so the file list always shows the main artifact.
    if (!hasIndex && previewHtml && currentDesignId) {
      entries.unshift({
        path: 'index.html',
        kind: 'html',
        size: previewHtml.length,
      });
    }

    // Sort: index.html first, then alphabetical
    entries.sort((a, b) => {
      if (a.path === 'index.html') return -1;
      if (b.path === 'index.html') return 1;
      return a.path.localeCompare(b.path);
    });

    return entries;
  }, [previewFiles, previewHtml, currentDesignId]);

  return { files, generating: isGenerating };
}

// ── Formatting helpers ────────────────────────────────────────────────────

/** Format an ISO timestamp as "22h ago" / "3d ago". Pure for testability. */
export function formatRelativeTime(isoTime: string, now: Date = new Date()): string {
  const then = new Date(isoTime).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Math.max(0, now.getTime() - then);
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

/** Precise tooltip form: "Modified Apr 20, 2026, 14:32". */
export function formatAbsoluteTime(isoTime: string): string {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format bytes as human-readable size. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
