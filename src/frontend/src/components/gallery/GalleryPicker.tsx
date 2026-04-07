import { useState, useCallback, useEffect, useRef } from 'react'
import { X, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGallery } from '@/hooks/useGallery'
import { GalleryThumbnail } from '@/components/gallery/GalleryThumbnail'

type GalleryTab = 'all' | 'generations' | 'chat'

interface GalleryPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (url: string, filename: string) => void
}

const TABS: { key: GalleryTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'generations', label: 'Generations' },
  { key: 'chat', label: 'Chat' },
]

export function GalleryPicker({ open, onClose, onSelect }: GalleryPickerProps) {
  const [tab, setTab] = useState<GalleryTab>('all')
  const [search, setSearch] = useState('')
  const backdropRef = useRef<HTMLDivElement>(null)

  const source = tab === 'all' ? undefined : tab
  const { images, isLoading } = useGallery({ source, search })

  // Close on escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose()
    },
    [onClose]
  )

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70"
    >
      <div className="bg-[var(--surface-1)] border border-[hsl(var(--border))] rounded-2xl w-[90vw] max-w-[640px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h3
            className="text-lg font-semibold text-[var(--text)]"
            style={{ fontFamily: "'Parkinsans', 'Google Sans', sans-serif" }}
          >
            Gallery
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-white/5 hover:text-[var(--text)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search + Tabs */}
        <div className="px-5 pb-3 flex flex-col gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search images..."
              className="w-full bg-[rgb(10,10,10)] border border-[rgb(35,35,35)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[rgb(55,55,55)]"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tab === t.key
                    ? 'bg-[var(--gold)]/15 text-[var(--gold)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-white/5'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {isLoading && (
            <div className="grid grid-cols-4 gap-2 md:grid-cols-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-[hsl(var(--muted))] rounded-lg animate-pulse"
                />
              ))}
            </div>
          )}

          {!isLoading && images.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-[var(--text-tertiary)]">
              No images found
            </div>
          )}

          {!isLoading && images.length > 0 && (
            <div className="grid grid-cols-4 gap-2 md:grid-cols-3">
              {images.map((img) => (
                <GalleryThumbnail
                  key={img.url}
                  image={img}
                  onClick={() => onSelect(img.url, img.filename)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
