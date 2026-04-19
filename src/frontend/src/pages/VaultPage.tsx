import { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  useVaultList,
  useUploadFile,
  useDeleteVaultItem,
  useToggleStar,
  type VaultItem,
} from '@/hooks/useVault';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const FILE_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  image: { icon: 'IMG', color: 'bg-purple-500/20 text-purple-400' },
  pdf: { icon: 'PDF', color: 'bg-red-500/20 text-red-400' },
  docx: { icon: 'DOC', color: 'bg-blue-500/20 text-blue-400' },
  xlsx: { icon: 'XLS', color: 'bg-green-500/20 text-green-400' },
  csv: { icon: 'CSV', color: 'bg-green-500/20 text-green-400' },
  pptx: { icon: 'PPT', color: 'bg-orange-500/20 text-orange-400' },
  text: { icon: 'TXT', color: 'bg-zinc-500/20 text-zinc-400' },
  other: { icon: 'FILE', color: 'bg-zinc-500/20 text-zinc-400' },
};

function getTypeDisplay(type: string) {
  return FILE_TYPE_ICONS[type] || FILE_TYPE_ICONS.other;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FileTypeIcon({ type }: { type: string }) {
  const display = getTypeDisplay(type);
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
        display.color,
      )}
    >
      {display.icon}
    </div>
  );
}

function FileRow({
  item,
  onDelete,
  onToggleStar,
  isDeleting,
}: {
  item: VaultItem;
  onDelete: (id: string) => void;
  onToggleStar: (id: string, starred: boolean) => void;
  isDeleting: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className={cn(
        'group flex items-center gap-4 rounded-lg border border-zinc-800/60 px-4 py-3 transition-colors hover:border-zinc-700 hover:bg-zinc-900/50',
        isDeleting && 'pointer-events-none opacity-50',
      )}
    >
      <FileTypeIcon type={item.file_type} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <a
            href={item.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-medium text-zinc-100 hover:text-[#FFC01C] transition-colors"
            title={item.filename}
          >
            {item.filename}
          </a>
          {item.starred && (
            <span className="text-[#FFC01C] text-xs" title="Starred">
              *
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-zinc-500">
          <span>{formatBytes(item.file_size)}</span>
          <span>{formatDate(item.created_at)}</span>
          {item.source && (
            <Badge
              variant="outline"
              className="border-zinc-700 text-zinc-500 text-[10px] px-1.5 py-0"
            >
              {item.source}
            </Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-zinc-500 hover:text-[#FFC01C]"
          onClick={() => onToggleStar(item.id, !item.starred)}
          title={item.starred ? 'Unstar' : 'Star'}
        >
          {item.starred ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFC01C" stroke="#FFC01C" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          )}
        </Button>

        <a
          href={item.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200 transition-colors"
          title="Open in new tab"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>

        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={() => {
                onDelete(item.id);
                setConfirmDelete(false);
              }}
            >
              Yes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => setConfirmDelete(false)}
            >
              No
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400"
            onClick={() => setConfirmDelete(true)}
            title="Delete"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </Button>
        )}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-zinc-800/60 px-4 py-3"
        >
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/60 mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-zinc-300 mb-1">No files yet</p>
      <p className="text-xs text-zinc-500 mb-5 max-w-xs">
        Upload documents, images, or other files. They will also appear here when attached to conversations.
      </p>
      <Button
        onClick={onUpload}
        className="bg-[#FFC01C] text-black hover:bg-[#F59E0B] font-medium text-sm px-4"
      >
        Upload a file
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function VaultPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');

  const params: Record<string, string> = {};
  if (search.trim()) params.q = search.trim();

  const { data, isLoading, isError, error } = useVaultList(
    Object.keys(params).length > 0 ? params : undefined,
  );

  const uploadMutation = useUploadFile();
  const deleteMutation = useDeleteVaultItem();
  const starMutation = useToggleStar();

  const triggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        uploadMutation.mutate(files[i]);
      }
      // Reset so same file can be re-selected
      e.target.value = '';
    },
    [uploadMutation],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation],
  );

  const handleToggleStar = useCallback(
    (id: string, starred: boolean) => {
      starMutation.mutate({ id, starred });
    },
    [starMutation],
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const isEmpty = !isLoading && items.length === 0 && !search.trim();
  const noResults = !isLoading && items.length === 0 && !!search.trim();

  return (
    <div className="flex h-full w-full flex-col bg-[#0A0A0A]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Vault</h1>
          {!isLoading && total > 0 && (
            <p className="text-xs text-zinc-500 mt-0.5">
              {total} file{total !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Input
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56 border-zinc-800 bg-zinc-900 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-[#FFC01C]/30"
          />
          <Button
            onClick={triggerUpload}
            disabled={uploadMutation.isPending}
            className="bg-[#FFC01C] text-black hover:bg-[#F59E0B] font-medium text-sm h-8 px-3"
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      {/* Upload error */}
      {uploadMutation.isError && (
        <div className="mx-6 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          Upload failed: {(uploadMutation.error as Error)?.message ?? 'Unknown error'}
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          {isLoading && <SkeletonRows />}

          {isError && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-sm text-red-400 mb-1">Failed to load vault</p>
              <p className="text-xs text-zinc-500">
                {(error as Error)?.message ?? 'Unknown error'}
              </p>
            </div>
          )}

          {isEmpty && <EmptyState onUpload={triggerUpload} />}

          {noResults && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-sm text-zinc-400 mb-1">No files match "{search}"</p>
              <p className="text-xs text-zinc-600">Try a different search term.</p>
            </div>
          )}

          {items.length > 0 && (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  onDelete={handleDelete}
                  onToggleStar={handleToggleStar}
                  isDeleting={
                    deleteMutation.isPending &&
                    deleteMutation.variables === item.id
                  }
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
