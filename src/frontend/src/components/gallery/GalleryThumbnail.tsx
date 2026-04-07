import { cn } from '@/lib/utils'
import type { GalleryImage } from '@/types/api'

interface GalleryThumbnailProps {
  image: GalleryImage
  selected?: boolean
  onClick: () => void
}

export function GalleryThumbnail({ image, selected, onClick }: GalleryThumbnailProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative aspect-square rounded-lg overflow-hidden group cursor-pointer',
        'border-2 transition-all',
        selected
          ? 'border-[var(--gold)] shadow-[0_0_0_1px_var(--gold)]'
          : 'border-transparent hover:border-[hsl(var(--border))]'
      )}
    >
      <img
        src={image.thumbnail || image.url}
        alt={image.filename}
        className="w-full h-full object-cover transition-transform group-hover:scale-105"
        loading="lazy"
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />

      {/* Agent badge */}
      {image.agent && (
        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[0.55rem] font-semibold uppercase tracking-wider bg-black/60 text-[var(--gold)] backdrop-blur-sm">
          {image.agent}
        </span>
      )}

      {/* Source indicator */}
      <span
        className={cn(
          'absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full',
          image.source === 'generation' ? 'bg-[var(--gold)]' : 'bg-blue-400'
        )}
        title={image.source === 'generation' ? 'Generation' : 'Chat'}
      />

      {/* Selected checkmark */}
      {selected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--gold)] flex items-center justify-center">
          <svg className="w-3 h-3 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  )
}
