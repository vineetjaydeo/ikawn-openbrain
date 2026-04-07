import { useState, useEffect } from 'react'
import {
  useReportRuns,
  useReportTasks,
  useMarkViewed,
  useToggleReportTask,
  useDeleteReportTask,
  type ReportRun,
  type ReportTask,
} from '@/hooks/useReports'
import { ArrowLeft, Loader2, Pause, Play, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function scheduleLabel(task: ReportTask): string {
  if (task.schedule_type === 'cron') return task.cron_expression || 'cron'
  if (task.schedule_type === 'interval') return `Every ${task.interval_minutes}m`
  if (task.schedule_type === 'once') return 'One-time'
  if (task.schedule_type === 'trigger') return 'Event-based'
  return task.schedule_type
}

export function ReportsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'results' | 'tasks'>('results')
  const { data: runs, isLoading: runsLoading } = useReportRuns()
  const { data: tasks, isLoading: tasksLoading } = useReportTasks()
  const markViewed = useMarkViewed()
  const toggleTask = useToggleReportTask()
  const deleteTask = useDeleteReportTask()

  // Mark all as viewed when results tab loads
  useEffect(() => {
    if (tab === 'results' && runs && runs.some(r => !r.viewed_at)) {
      markViewed.mutate()
    }
  }, [tab, runs]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4">
          <h1 className="font-[Parkinsans] text-xl font-semibold text-[var(--text)]">Reports</h1>
          <button
            onClick={() => navigate('/chat')}
            className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
          >
            <ArrowLeft size={16} className="mr-1 inline" /> Back to Chat
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[hsl(var(--border))] px-6">
          <TabButton active={tab === 'results'} onClick={() => setTab('results')}>Results</TabButton>
          <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')}>Active Tasks</TabButton>
        </div>

        <div className="px-6 py-6">
          {tab === 'results' ? (
            runsLoading ? (
              <LoadingSkeleton count={4} />
            ) : !runs?.length ? (
              <EmptyState title="No results yet" subtitle="Ask Lucy to schedule a task and results will appear here." />
            ) : (
              <div className="space-y-3">
                {runs.map((r) => (
                  <RunCard key={r.id} run={r} />
                ))}
              </div>
            )
          ) : (
            tasksLoading ? (
              <LoadingSkeleton count={3} />
            ) : !tasks?.length ? (
              <EmptyState title="No scheduled tasks" subtitle='Ask Lucy to create a recurring task like "check my competitors every Monday".' />
            ) : (
              <div className="space-y-3">
                {tasks.map((t) => (
                  <TaskCard
                    key={t.uuid}
                    task={t}
                    onToggle={() => toggleTask.mutate(t.uuid, { onError: (e) => toast.error(e.message) })}
                    onDelete={() => {
                      if (confirm('Delete this task and all its run history?')) {
                        deleteTask.mutate(t.uuid, { onError: (e) => toast.error(e.message) })
                      }
                    }}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-4 py-3 text-sm transition-colors ${
        active
          ? 'border-[var(--gold)] text-[var(--gold)]'
          : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  )
}

function RunCard({ run }: { run: ReportRun }) {
  let summary = ''
  try {
    const result = typeof run.result === 'string' ? JSON.parse(run.result) : run.result
    summary = result?.summary || JSON.stringify(result, null, 2)?.slice(0, 500) || ''
  } catch {
    summary = run.error || 'No details'
  }

  return (
    <div className={`rounded-xl border bg-[var(--surface-1)] p-4 ${!run.viewed_at ? 'border-l-[3px] border-l-[var(--gold)] border-t-[hsl(var(--border))] border-r-[hsl(var(--border))] border-b-[hsl(var(--border))]' : 'border-[hsl(var(--border))]'}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text)]">{run.task_name}</span>
        <span className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          {timeAgo(run.started_at)}
          <StatusBadge status={run.status} />
        </span>
      </div>
      <div className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-secondary)]">
        {summary.slice(0, 500)}
      </div>
    </div>
  )
}

function TaskCard({ task, onToggle, onDelete }: { task: ReportTask; onToggle: () => void; onDelete: () => void }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-4 transition-colors hover:border-[var(--gold)]/30">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--text)]">{task.name}</span>
        <div className="flex gap-1">
          <button
            onClick={onToggle}
            className="rounded p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
            title={task.enabled ? 'Pause' : 'Resume'}
          >
            {task.enabled ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-red-500/10 hover:text-red-400"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
        <StatusBadge status={task.enabled ? 'active' : 'paused'} />
        <span>{scheduleLabel(task)}</span>
        <span>{task.tool}</span>
        <span>{task.last_run_at ? `Last run: ${timeAgo(task.last_run_at)}` : 'Never run'}</span>
        <span>{task.run_count} runs</span>
      </div>
      {task.description && (
        <div className="mt-2 text-xs text-[var(--text-tertiary)]">{task.description}</div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-green-500/15 text-green-400',
    active: 'bg-green-500/15 text-green-400',
    failed: 'bg-red-500/15 text-red-400',
    running: 'bg-[var(--gold)]/15 text-[var(--gold)]',
    paused: 'bg-white/5 text-[var(--text-secondary)]',
  }

  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${styles[status] || styles.paused}`}>
      {status}
    </span>
  )
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="py-16 text-center">
      <h3 className="mb-2 text-lg font-medium text-[var(--text)]">{title}</h3>
      <p className="mx-auto max-w-sm text-sm text-[var(--text-secondary)]">{subtitle}</p>
    </div>
  )
}

function LoadingSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-4">
          <div className="mb-2 h-4 w-48 animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="h-3 w-full animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="mt-1 h-3 w-3/4 animate-pulse rounded bg-[var(--surface-3)]" />
        </div>
      ))}
    </div>
  )
}
