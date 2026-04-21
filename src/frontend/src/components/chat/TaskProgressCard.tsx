import { motion } from 'motion/react'
import { Download, ExternalLink, AlertCircle, Loader2, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActiveTask } from '@/stores/chat'

function formatElapsed(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m ${remaining}s`
}

interface TaskProgressCardProps {
  task: ActiveTask
}

export function TaskProgressCard({ task }: TaskProgressCardProps) {
  const elapsed = formatElapsed(task.startedAt)

  if (task.status === 'completed' && task.result) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="flex w-full"
      >
        <div style={{ display: 'flex', gap: 14, width: '100%' }}>
          {/* Gold sparkle avatar */}
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              backgroundColor: '#1a1700',
              border: '1px solid #FFC01C33',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 16,
              color: '#FFC01C',
            }}
          >
            {'\u2726'}
          </div>
          <div
            style={{
              minWidth: 0,
              flex: 1,
              background: '#161616',
              border: '1px solid #2A2A2A',
              borderRadius: 12,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <FileText size={16} style={{ color: '#FFC01C' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#F5F5F5' }}>
                Presentation ready
              </span>
            </div>
            <div
              style={{
                background: '#1a1a1a',
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#F5F5F5',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.result.filename}
                </div>
                <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 2 }}>
                  {task.result.slideCount} slides
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <a
                  href={task.result.url}
                  download
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: '#FFC01C',
                    color: '#0A0A0A',
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'none',
                    transition: 'opacity 0.15s',
                  }}
                >
                  <Download size={13} />
                  Download
                </a>
                <a
                  href="/vault"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: 'transparent',
                    border: '1px solid #2A2A2A',
                    color: '#A8A8A8',
                    fontSize: 12,
                    fontWeight: 500,
                    textDecoration: 'none',
                    transition: 'color 0.15s',
                  }}
                >
                  <ExternalLink size={13} />
                  Open in Vault
                </a>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  if (task.status === 'failed') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="flex w-full"
      >
        <div style={{ display: 'flex', gap: 14, width: '100%' }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              backgroundColor: '#1a1700',
              border: '1px solid #FFC01C33',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 16,
              color: '#FFC01C',
            }}
          >
            {'\u2726'}
          </div>
          <div
            style={{
              minWidth: 0,
              flex: 1,
              background: '#161616',
              border: '1px solid #E5484D33',
              borderRadius: 12,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={15} style={{ color: '#E5484D' }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#E5484D' }}>
                Presentation failed
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#A8A8A8', marginTop: 8, lineHeight: 1.5 }}>
              {task.error || 'An unexpected error occurred while generating the presentation.'}
            </p>
          </div>
        </div>
      </motion.div>
    )
  }

  // Pending or running states
  const isPending = task.status === 'pending'
  const hasProgress = task.progress && task.progress.total_slides > 0
  const isUploading = task.progress?.phase === 'uploading'
  const progressPercent = hasProgress
    ? Math.round((task.progress!.current_slide / task.progress!.total_slides) * 100)
    : 0

  let statusLabel = 'Queued...'
  if (!isPending && hasProgress && !isUploading) {
    statusLabel = `Building slide ${task.progress!.current_slide} of ${task.progress!.total_slides}...`
  } else if (!isPending && isUploading) {
    statusLabel = 'Uploading...'
  } else if (!isPending) {
    statusLabel = 'Processing...'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex w-full"
    >
      <div style={{ display: 'flex', gap: 14, width: '100%' }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            backgroundColor: '#1a1700',
            border: '1px solid #FFC01C33',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 16,
            color: '#FFC01C',
          }}
        >
          {'\u2726'}
        </div>
        <div
          style={{
            minWidth: 0,
            flex: 1,
            background: '#161616',
            border: '1px solid #2A2A2A',
            borderRadius: 12,
            padding: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Loader2
              size={15}
              className={cn(isPending ? 'animate-pulse' : 'animate-spin')}
              style={{ color: '#FFC01C' }}
            />
            <span style={{ fontSize: 13, fontWeight: 500, color: '#F5F5F5' }}>
              {statusLabel}
            </span>
            <span style={{ fontSize: 11, color: '#6B6B6B', marginLeft: 'auto' }}>
              {elapsed}
            </span>
          </div>

          {/* Progress bar */}
          {hasProgress && !isUploading && (
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: '#2A2A2A',
                overflow: 'hidden',
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{
                  height: '100%',
                  borderRadius: 2,
                  background: 'linear-gradient(90deg, #FFC01C, #F59E0B)',
                }}
              />
            </div>
          )}

          {/* Indeterminate bar for pending/no-progress states */}
          {(!hasProgress || isUploading) && (
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: '#2A2A2A',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  position: 'absolute',
                  width: '40%',
                  height: '100%',
                  borderRadius: 2,
                  background: 'linear-gradient(90deg, transparent, #FFC01C, transparent)',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
