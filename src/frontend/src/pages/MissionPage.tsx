import { useState } from 'react'
import {
  useMissionTasks,
  useMissionAgents,
  useTaskRuns,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useToggleAgent,
  type MissionTask,
  type TaskRun,
  type Agent,
} from '@/hooks/useMission'
import { ArrowLeft, Plus, Loader2, ChevronDown, ChevronRight, Trash2, X, Power, PowerOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { User } from '@/hooks/useAuth'

interface Props {
  user: User | null
}

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

function scheduleLabel(task: MissionTask): string {
  if (task.schedule_type === 'cron') return task.cron_expression || 'cron'
  if (task.schedule_type === 'interval') return `Every ${task.interval_minutes}m`
  if (task.schedule_type === 'once') return 'One-time'
  if (task.schedule_type === 'trigger') return 'Event-based'
  return task.schedule_type
}

export function MissionPage({ user }: Props) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'tasks' | 'organization'>('tasks')
  const isAdmin = user?.role === 'admin'

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/chat')}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--border))] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="font-[Parkinsans] text-xl font-semibold text-[var(--text)]">Mission Control</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[hsl(var(--border))] px-6">
          <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')}>Tasks</TabButton>
          <TabButton active={tab === 'organization'} onClick={() => setTab('organization')}>Organization</TabButton>
        </div>

        <div className="px-6 py-6">
          {tab === 'tasks' ? <TasksTab isAdmin={isAdmin} /> : <OrganizationTab isAdmin={isAdmin} />}
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

// ── Tasks Tab ──

function TasksTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: tasks, isLoading } = useMissionTasks()
  const updateTask = useUpdateTask()
  const deleteTaskMut = useDeleteTask()
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  if (isLoading) return <LoadingSkeleton count={4} />

  return (
    <>
      {isAdmin && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-[var(--gold)] px-3 py-2 text-sm font-semibold text-[hsl(var(--background))] transition-colors hover:bg-[var(--gold-hover)]"
          >
            <Plus size={16} /> Create Task
          </button>
        </div>
      )}

      {!tasks?.length ? (
        <EmptyState title="No scheduled tasks" subtitle="Create automated tasks that run on a schedule." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[hsl(var(--border))]">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]" />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Name</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] sm:table-cell">Agent</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] md:table-cell">Schedule</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Status</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] sm:table-cell">Last Run</th>
                {isAdmin && <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <TaskRow
                  key={task.uuid}
                  task={task}
                  isAdmin={isAdmin}
                  expanded={expandedUuid === task.uuid}
                  onToggleExpand={() => setExpandedUuid(expandedUuid === task.uuid ? null : task.uuid)}
                  onToggleEnabled={() => {
                    updateTask.mutate(
                      { uuid: task.uuid, enabled: !task.enabled },
                      { onError: (e) => toast.error(e.message) }
                    )
                  }}
                  onDelete={() => {
                    if (confirm('Delete this task and all its run history?')) {
                      deleteTaskMut.mutate(task.uuid, { onError: (e) => toast.error(e.message) })
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && <CreateTaskModal onClose={() => setShowCreateModal(false)} />}
    </>
  )
}

function TaskRow({
  task,
  isAdmin,
  expanded,
  onToggleExpand,
  onToggleEnabled,
  onDelete,
}: {
  task: MissionTask
  isAdmin: boolean
  expanded: boolean
  onToggleExpand: () => void
  onToggleEnabled: () => void
  onDelete: () => void
}) {
  return (
    <>
      <tr className="border-b border-[hsl(var(--border))] transition-colors hover:bg-[var(--surface-2)]">
        <td className="w-8 px-2 py-3">
          <button onClick={onToggleExpand} className="text-[var(--text-secondary)] hover:text-[var(--text)]">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="px-4 py-3 text-sm font-medium text-[var(--text)]">{task.name}</td>
        <td className="hidden px-4 py-3 text-sm text-[var(--text-secondary)] sm:table-cell">{task.agent_slug}</td>
        <td className="hidden px-4 py-3 text-sm text-[var(--text-secondary)] md:table-cell">{scheduleLabel(task)}</td>
        <td className="px-4 py-3">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${task.enabled ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-[var(--text-secondary)]'}`}>
            {task.enabled ? 'Active' : 'Paused'}
          </span>
        </td>
        <td className="hidden px-4 py-3 text-sm text-[var(--text-secondary)] sm:table-cell">
          {task.last_run_at ? timeAgo(task.last_run_at) : 'Never'}
        </td>
        {isAdmin && (
          <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={onToggleEnabled}
                className="rounded p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                title={task.enabled ? 'Disable' : 'Enable'}
              >
                {task.enabled ? <PowerOff size={14} /> : <Power size={14} />}
              </button>
              <button
                onClick={onDelete}
                className="rounded p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </td>
        )}
      </tr>
      {expanded && (
        <tr>
          <td colSpan={isAdmin ? 7 : 6} className="bg-[var(--surface-2)] px-6 py-4">
            <TaskRunHistory uuid={task.uuid} />
          </td>
        </tr>
      )}
    </>
  )
}

function TaskRunHistory({ uuid }: { uuid: string }) {
  const { data: runs, isLoading } = useTaskRuns(uuid)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 size={14} className="animate-spin" /> Loading run history...
      </div>
    )
  }

  if (!runs?.length) {
    return <div className="text-sm text-[var(--text-secondary)]">No runs yet</div>
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Run History</div>
      {runs.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[var(--surface-1)] px-3 py-2 text-xs">
          <div className="flex items-center gap-3">
            <StatusBadge status={r.status} />
            <span className="text-[var(--text-secondary)]">{r.agent_slug}</span>
            {r.tier && <span className="text-[var(--text-tertiary)]">{r.tier}</span>}
          </div>
          <div className="flex items-center gap-3 text-[var(--text-secondary)]">
            {r.cost_usd != null && <span>${Number(r.cost_usd).toFixed(4)}</span>}
            {r.tokens_used != null && <span>{r.tokens_used.toLocaleString()} tok</span>}
            <span>{timeAgo(r.started_at)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Organization Tab ──

function OrganizationTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: agents, isLoading } = useMissionAgents()
  const toggleAgent = useToggleAgent()

  if (isLoading) return <LoadingSkeleton count={6} />

  if (!agents?.length) {
    return <EmptyState title="No agents configured" subtitle="Domain agents will appear here once configured." />
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {agents.map((agent) => (
        <AgentCard
          key={agent.slug}
          agent={agent}
          isAdmin={isAdmin}
          onToggle={() => {
            toggleAgent.mutate(
              { slug: agent.slug, enabled: !agent.enabled },
              { onError: (e) => toast.error(e.message) }
            )
          }}
        />
      ))}
    </div>
  )
}

function AgentCard({ agent, isAdmin, onToggle }: { agent: Agent; isAdmin: boolean; onToggle: () => void }) {
  const tools = agent.tools || []

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-5 transition-colors hover:border-[var(--gold)]/20">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-[var(--text)]">{agent.name}</div>
          <div className="text-xs text-[var(--text-secondary)]">{agent.role}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${agent.enabled ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-[var(--text-secondary)]'}`}>
            {agent.enabled ? 'Active' : 'Disabled'}
          </span>
          {isAdmin && (
            <button
              onClick={onToggle}
              className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
              title={agent.enabled ? 'Disable' : 'Enable'}
            >
              {agent.enabled ? <PowerOff size={12} /> : <Power size={12} />}
            </button>
          )}
        </div>
      </div>
      {tools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tools.map((t) => (
            <span key={t} className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Create Task Modal ──

function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const createTask = useCreateTask()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tool, setTool] = useState('')
  const [agentSlug, setAgentSlug] = useState('ruhi')
  const [scheduleType, setScheduleType] = useState('interval')
  const [intervalMinutes, setIntervalMinutes] = useState(60)
  const [cronExpression, setCronExpression] = useState('')

  function handleSubmit() {
    if (!name || !tool) {
      toast.error('Name and tool are required')
      return
    }
    createTask.mutate(
      {
        name,
        description: description || undefined,
        agent_slug: agentSlug || undefined,
        tool,
        schedule_type: scheduleType,
        interval_minutes: scheduleType === 'interval' ? intervalMinutes : undefined,
        cron_expression: scheduleType === 'cron' ? cronExpression : undefined,
      },
      {
        onSuccess: () => { toast.success('Task created'); onClose() },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">Create Task</h2>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text)]"><X size={18} /></button>
        </div>

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Task name" className="modal-input" />
        </Field>
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="modal-input" />
        </Field>
        <Field label="Tool">
          <input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="e.g. web_search, brand_analysis" className="modal-input" />
        </Field>
        <Field label="Agent">
          <input value={agentSlug} onChange={(e) => setAgentSlug(e.target.value)} placeholder="e.g. ruhi" className="modal-input" />
        </Field>
        <Field label="Schedule Type">
          <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value)} className="modal-input">
            <option value="interval">Interval</option>
            <option value="cron">Cron</option>
            <option value="once">One-time</option>
            <option value="trigger">Event-based</option>
          </select>
        </Field>
        {scheduleType === 'interval' && (
          <Field label="Interval (minutes)">
            <input type="number" value={intervalMinutes} onChange={(e) => setIntervalMinutes(parseInt(e.target.value) || 60)} className="modal-input" />
          </Field>
        )}
        {scheduleType === 'cron' && (
          <Field label="Cron Expression">
            <input value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} placeholder="0 */6 * * *" className="modal-input" />
          </Field>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)]">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={createTask.isPending}
            className="flex items-center gap-2 rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-[hsl(var(--background))] hover:bg-[var(--gold-hover)] disabled:opacity-50"
          >
            {createTask.isPending && <Loader2 size={14} className="animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared Components ──

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-green-500/15 text-green-400',
    running: 'bg-[var(--gold)]/15 text-[var(--gold)]',
    failed: 'bg-red-500/15 text-red-400',
    pending: 'bg-white/5 text-[var(--text-secondary)]',
  }

  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${styles[status] || styles.pending}`}>
      {status}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      {children}
    </div>
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
        <div key={i} className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-5">
          <div className="mb-3 h-4 w-48 animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="flex gap-2">
            <div className="h-3 w-16 animate-pulse rounded bg-[var(--surface-3)]" />
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--surface-3)]" />
            <div className="h-3 w-12 animate-pulse rounded bg-[var(--surface-3)]" />
          </div>
        </div>
      ))}
    </div>
  )
}
