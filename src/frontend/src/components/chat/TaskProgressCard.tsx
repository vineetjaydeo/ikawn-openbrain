import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Download, ExternalLink, AlertCircle, Loader2, FileText, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActiveTask } from '@/stores/chat'

function formatElapsed(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m ${remaining}s`
}

function estimateRemaining(task: ActiveTask): string | null {
  if (!task.progress || task.progress.total_slides <= 0) return null
  const elapsed = (Date.now() - task.startedAt) / 1000
  if (elapsed < 10) return null
  const { current_slide, total_slides } = task.progress
  if (current_slide <= 0) return null
  const rate = current_slide / elapsed
  if (rate <= 0) return null
  const remaining = (total_slides - current_slide) / rate
  const secs = Math.ceil(remaining)
  if (secs < 5) return 'Almost done'
  if (secs < 60) return `~${secs}s remaining`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `~${mins}m ${remSecs}s remaining`
}

interface TaskProgressCardProps {
  task: ActiveTask
}

export function TaskProgressCard({ task }: TaskProgressCardProps) {
  const [expanded, setExpanded] = useState(false)
  const elapsed = formatElapsed(task.startedAt)

  const isPending = task.status === 'pending'
  const isRunning = task.status === 'running'
  const isCompleted = task.status === 'completed'
  const isFailed = task.status === 'failed'
  const hasProgress = !!(task.progress && task.progress.total_slides > 0)
  const isUploading = task.progress?.phase === 'uploading'

  const progressPercent = hasProgress
    ? Math.round((task.progress!.current_slide / task.progress!.total_slides) * 100)
    : 0

  const statusLabel = useMemo(() => {
    if (isCompleted) return 'Presentation ready'
    if (isFailed) return 'Generation failed'
    if (isPending) return 'Queued'
    if (isUploading) return 'Uploading'
    if (hasProgress) return `Slide ${task.progress!.current_slide} of ${task.progress!.total_slides}`
    return 'Processing'
  }, [isCompleted, isFailed, isPending, isUploading, hasProgress, task.progress])

  const phaseLabel = useMemo(() => {
    if (isCompleted) return null
    if (isFailed) return null
    if (isPending) return 'Waiting in queue'
    if (isUploading) return 'Uploading to storage'
    if (hasProgress) return 'Building slides'
    return 'Initializing'
  }, [isCompleted, isFailed, isPending, isUploading, hasProgress])

  const timeRemaining = estimateRemaining(task)

  // Status icon
  const StatusIcon = () => {
    if (isCompleted) return <FileText size={14} style={{ color: '#FFC01C', flexShrink: 0 }} />
    if (isFailed) return <AlertCircle size={14} style={{ color: '#E5484D', flexShrink: 0 }} />
    return (
      <Loader2
        size={14}
        className={cn(isPending ? 'animate-pulse' : 'animate-spin')}
        style={{ color: '#FFC01C', flexShrink: 0 }}
      />
    )
  }

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

        {/* Main container -- everything stays inside this gray box */}
        <div
          style={{
            minWidth: 0,
            flex: 1,
            background: '#2a2a2e',
            borderRadius: 12,
            overflow: 'hidden',
            transition: 'border-color 0.2s',
            border: isFailed ? '1px solid #E5484D33' : '1px solid #3a3a3e',
          }}
        >
          {/* Collapsed header row -- always visible */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              outline: 'none',
              textAlign: 'left',
            }}
          >
            <StatusIcon />

            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: isFailed ? '#E5484D' : '#e8e8e8',
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {statusLabel}
            </span>

            {!isCompleted && !isFailed && (
              <span style={{ fontSize: 11, color: '#7a7a80', flexShrink: 0 }}>
                {elapsed}
              </span>
            )}

            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}
            >
              <ChevronDown size={14} style={{ color: '#7a7a80' }} />
            </motion.div>
          </button>

          {/* Slim progress bar under header for running tasks (always visible when running) */}
          {(isRunning || isPending) && !expanded && (
            <div style={{ padding: '0 16px 10px' }}>
              {hasProgress && !isUploading ? (
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: '#1e1e22',
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
              ) : (
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: '#1e1e22',
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
          )}

          {/* Expanded details */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                style={{ overflow: 'hidden' }}
              >
                <div
                  style={{
                    padding: '0 16px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  {/* Divider */}
                  <div style={{ height: 1, background: '#3a3a3e' }} />

                  {/* --- Running / Pending state --- */}
                  {(isRunning || isPending) && (
                    <>
                      {/* Phase label */}
                      {phaseLabel && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: isPending ? '#7a7a80' : '#FFC01C',
                              boxShadow: isPending ? 'none' : '0 0 6px #FFC01C66',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 12, color: '#a0a0a6', fontWeight: 500 }}>
                            {phaseLabel}
                          </span>
                        </div>
                      )}

                      {/* Progress bar (thick) */}
                      {hasProgress && !isUploading && (
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'baseline',
                              justifyContent: 'space-between',
                              marginBottom: 6,
                            }}
                          >
                            <span style={{ fontSize: 12, color: '#c8c8cc', fontWeight: 500 }}>
                              Slide {task.progress!.current_slide} of {task.progress!.total_slides}
                            </span>
                            <span style={{ fontSize: 11, color: '#7a7a80' }}>
                              {progressPercent}%
                            </span>
                          </div>
                          <div
                            style={{
                              height: 8,
                              borderRadius: 4,
                              background: '#1e1e22',
                              overflow: 'hidden',
                            }}
                          >
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${progressPercent}%` }}
                              transition={{ duration: 0.4, ease: 'easeOut' }}
                              style={{
                                height: '100%',
                                borderRadius: 4,
                                background: 'linear-gradient(90deg, #FFC01C, #F59E0B)',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Indeterminate bar for pending/uploading */}
                      {(!hasProgress || isUploading) && (
                        <div
                          style={{
                            height: 8,
                            borderRadius: 4,
                            background: '#1e1e22',
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
                              borderRadius: 4,
                              background: 'linear-gradient(90deg, transparent, #FFC01C, transparent)',
                            }}
                          />
                        </div>
                      )}

                      {/* Time remaining estimate */}
                      {timeRemaining && (
                        <span style={{ fontSize: 11, color: '#7a7a80' }}>
                          {timeRemaining}
                        </span>
                      )}

                      {/* Elapsed time in expanded */}
                      <span style={{ fontSize: 11, color: '#5a5a60' }}>
                        Elapsed: {elapsed}
                      </span>
                    </>
                  )}

                  {/* --- Completed state --- */}
                  {isCompleted && task.result && (
                    <div
                      style={{
                        background: '#1e1e22',
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
                            color: '#e8e8e8',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {task.result.filename}
                        </div>
                        <div style={{ fontSize: 11, color: '#7a7a80', marginTop: 2 }}>
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
                            border: '1px solid #3a3a3e',
                            color: '#a0a0a6',
                            fontSize: 12,
                            fontWeight: 500,
                            textDecoration: 'none',
                            transition: 'color 0.15s',
                          }}
                        >
                          <ExternalLink size={13} />
                          Vault
                        </a>
                      </div>
                    </div>
                  )}

                  {/* --- Failed state --- */}
                  {isFailed && (
                    <p style={{ fontSize: 13, color: '#a0a0a6', margin: 0, lineHeight: 1.5 }}>
                      {task.error || 'An unexpected error occurred while generating the presentation.'}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
