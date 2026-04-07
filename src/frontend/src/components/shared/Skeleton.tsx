import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
  count?: number
}

function SkeletonBase({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-skeleton-pulse rounded bg-[hsl(var(--muted))]',
        className,
      )}
    />
  )
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  count = 1,
}: SkeletonProps) {
  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height

  const variantClass =
    variant === 'circular'
      ? 'rounded-full'
      : variant === 'rectangular'
        ? 'rounded-lg'
        : 'rounded h-4'

  if (count === 1) {
    return <SkeletonBase className={cn(variantClass, className)} />
  }

  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBase
          key={i}
          className={cn(
            variantClass,
            // Last row is shorter for a natural look
            i === count - 1 && 'w-3/4',
            className,
          )}
        />
      ))}
    </div>
  )
}

/** Skeleton shaped like a conversation item in the sidebar */
export function ConversationSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 px-2.5 py-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-2">
          <SkeletonBase className="h-3.5 flex-1 rounded" />
          <SkeletonBase className="h-3 w-6 rounded shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton shaped like a message bubble */
export function MessageSkeleton({ isUser }: { isUser: boolean }) {
  return (
    <div className={cn('flex gap-3.5 animate-message-enter', isUser && 'justify-end')}>
      {!isUser && (
        <SkeletonBase className="w-[26px] h-[26px] rounded-full shrink-0" />
      )}
      <div className="flex flex-col gap-1.5">
        <SkeletonBase
          className={cn(
            'rounded-[14px]',
            isUser ? 'h-10 w-48' : 'h-4 w-72',
          )}
        />
        {!isUser && <SkeletonBase className="h-4 w-56 rounded-[14px]" />}
        {!isUser && <SkeletonBase className="h-4 w-40 rounded-[14px]" />}
      </div>
    </div>
  )
}
