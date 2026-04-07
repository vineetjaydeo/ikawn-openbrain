import { cn } from '@/lib/utils'
import type { GenerationEvent } from '@/types/chat'

interface GenerationCardProps {
  generation: GenerationEvent
  onImageClick: (src: string) => void
}

export function GenerationCard({ generation, onImageClick }: GenerationCardProps) {
  const { agent, prompt, status, images, error } = generation
  const isComplete = status === 'complete'
  const isFailed = status === 'failed'
  const isPending = status === 'pending' || status === 'in_progress'

  return (
    <div className="bg-white/[0.03] border border-[hsl(var(--border))] rounded-lg p-4 mt-2 max-w-[520px]">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-[0.78rem] font-semibold uppercase tracking-wider text-[var(--gold)]">
          {agent}
        </span>
        {isPending && (
          <span className="flex items-center gap-1.5 text-[0.75rem] text-[var(--text-tertiary)]">
            <span className="w-3 h-3 border-2 border-[hsl(var(--border))] border-t-[var(--gold)] rounded-full animate-spin" />
            Generating...
          </span>
        )}
        {isComplete && (
          <span className="text-[0.75rem] text-green-500">Complete</span>
        )}
        {isFailed && (
          <span className="text-[0.75rem] text-red-400">Failed</span>
        )}
      </div>

      {/* Prompt */}
      <p className="text-[0.82rem] text-[var(--text-secondary)] mb-3 italic leading-snug line-clamp-2">
        {prompt}
      </p>

      {/* Images grid */}
      {isComplete && images && images.length > 0 && (
        <div
          className={cn(
            'grid gap-2',
            images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          )}
        >
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Generation ${i + 1}`}
              className="w-full aspect-square object-cover rounded-sm cursor-pointer transition-opacity hover:opacity-85"
              onClick={() => onImageClick(src)}
              loading="lazy"
            />
          ))}
        </div>
      )}

      {/* Placeholder shimmer for pending */}
      {isPending && (
        <div className="grid grid-cols-1 gap-2">
          <div className="aspect-square bg-[hsl(var(--muted))] rounded-sm flex items-center justify-center">
            <div className="w-10 h-10 border-[3px] border-[hsl(var(--border))] border-t-[var(--gold)] rounded-full animate-spin" />
          </div>
        </div>
      )}

      {/* Error */}
      {isFailed && error && (
        <p className="text-red-400 text-[0.82rem] py-3 text-center">
          {error}
        </p>
      )}
    </div>
  )
}
