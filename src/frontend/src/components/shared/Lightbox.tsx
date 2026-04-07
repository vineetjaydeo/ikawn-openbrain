import { useEffect, useCallback } from 'react'
import { X, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LightboxProps {
  src: string | null
  alt?: string
  onClose: () => void
}

export function Lightbox({ src, alt, onClose }: LightboxProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!src) return
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [src, handleKeyDown])

  const handleDownload = useCallback(async () => {
    if (!src) return
    try {
      const response = await fetch(src)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = alt || 'image'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      window.open(src, '_blank')
    }
  }, [src, alt])

  if (!src) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-[300] flex items-center justify-center',
        'bg-black/90 cursor-zoom-out animate-fade-in'
      )}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Image preview'}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDownload()
          }}
          className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          title="Download"
        >
          <Download className="h-5 w-5" />
        </button>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <img
        src={src}
        alt={alt || ''}
        className="max-w-[90vw] max-h-[90vh] rounded-sm object-contain cursor-default animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
