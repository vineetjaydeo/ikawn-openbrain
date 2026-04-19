import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  useReportRuns,
  useScheduledTasks,
  useUnreadCount,
  useMarkViewed,
  useToggleTask,
  useDeleteTask,
} from '@/hooks/useTasks';
import type { TaskRun, ScheduledTask } from '@/hooks/useTasks';

// ── Helpers ──

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function scheduleLabel(task: ScheduledTask): string {
  if (task.schedule_type === 'cron') return task.cron_expression || 'cron';
  if (task.schedule_type === 'interval') return `Every ${task.interval_minutes}m`;
  if (task.schedule_type === 'once') return 'One-time';
  if (task.schedule_type === 'trigger') return 'Event-based';
  return task.schedule_type;
}

function parseRunSummary(run: TaskRun): string {
  try {
    const result =
      typeof run.result === 'string' ? JSON.parse(run.result) : run.result;
    if (result?.summary) return result.summary;
    if (result) return JSON.stringify(result, null, 2).slice(0, 300);
  } catch {
    // fall through
  }
  return run.error || 'No details available';
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
}

// ── Sub-components ──

function RunCard({ run }: { run: TaskRun }) {
  const [expanded, setExpanded] = useState(false);
  const summary = parseRunSummary(run);

  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className={cn(
        'w-full text-left rounded-lg border bg-white/[0.02] p-4 transition-colors hover:border-white/20',
        !run.viewed_at && 'border-l-2 border-l-[#FFC01C]',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-sm text-white/90 truncate">
          {run.task_name}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-white/40">{timeAgo(run.started_at)}</span>
          <Badge variant={statusVariant(run.status)}>
            {run.status}
          </Badge>
        </div>
      </div>
      {run.tool && (
        <span className="text-xs text-white/30 mt-1 block">{run.tool}</span>
      )}
      {expanded && (
        <pre className="mt-3 text-xs text-white/50 leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-auto">
          {summary}
        </pre>
      )}
    </button>
  );
}

function TaskCard({
  task,
  onToggle,
  onDelete,
  isToggling,
  isDeleting,
}: {
  task: ScheduledTask;
  onToggle: (uuid: string) => void;
  onDelete: (uuid: string) => void;
  isToggling: boolean;
  isDeleting: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 transition-colors hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm text-white/90">{task.name}</div>
          {task.description && (
            <div className="text-xs text-white/40 mt-1 line-clamp-2">{task.description}</div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={isToggling}
            onClick={() => onToggle(task.uuid)}
            className="h-7 text-xs"
          >
            {task.enabled ? 'Pause' : 'Resume'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isDeleting}
            onClick={() => {
              if (window.confirm('Delete this task and all its run history?')) {
                onDelete(task.uuid);
              }
            }}
            className="h-7 text-xs text-red-400 hover:text-red-300 hover:border-red-400/50"
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <Badge variant={task.enabled ? 'default' : 'outline'}>
          {task.enabled ? 'Active' : 'Paused'}
        </Badge>
        <span className="text-xs text-white/40">{scheduleLabel(task)}</span>
        {task.tool && <span className="text-xs text-white/40">{task.tool}</span>}
        <span className="text-xs text-white/30">
          {task.last_run_at ? `Last run: ${timeAgo(task.last_run_at)}` : 'Never run'}
        </span>
        <span className="text-xs text-white/30">{task.run_count} runs</span>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <svg
        className="w-10 h-10 text-white/20 mb-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      <h3 className="text-base font-medium text-white/70 mb-1">{title}</h3>
      <p className="text-sm text-white/40 max-w-sm">{description}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-white/[0.08] p-4 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
      {message}
    </div>
  );
}

// ── Main Page ──

export default function TasksPage() {
  const runsQuery = useReportRuns();
  const tasksQuery = useScheduledTasks();
  const unreadQuery = useUnreadCount();
  const markViewed = useMarkViewed();
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();

  const unreadCount = unreadQuery.data?.count ?? 0;

  // Mark runs as viewed when the reports tab is first shown
  useEffect(() => {
    if (unreadCount > 0 && runsQuery.data) {
      markViewed.mutate();
    }
    // Only on initial load of runs data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runsQuery.data]);

  const runs = runsQuery.data?.runs ?? [];
  const tasks = tasksQuery.data?.tasks ?? [];

  return (
    <div className="flex flex-col h-full w-full bg-[#0A0A0A]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/[0.08]">
        <h1 className="text-xl font-semibold text-white/90 tracking-tight font-[Parkinsans,sans-serif]">
          Tasks & Reports
        </h1>
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="h-5 min-w-5 px-1.5 text-[10px] font-semibold"
          >
            {unreadCount}
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="reports" className="flex-1 flex flex-col min-h-0">
        <div className="px-6 border-b border-white/[0.08]">
          <TabsList className="bg-transparent h-auto p-0 gap-0">
            <TabsTrigger
              value="reports"
              className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm text-white/40 data-[state=active]:text-[#FFC01C] data-[state=active]:border-[#FFC01C] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Reports
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm text-white/40 data-[state=active]:text-[#FFC01C] data-[state=active]:border-[#FFC01C] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Tasks
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto px-6 py-6">
            <TabsContent value="reports" className="mt-0">
              {runsQuery.isLoading && <LoadingSkeleton />}
              {runsQuery.error && (
                <ErrorState message="Failed to load reports. Try refreshing the page." />
              )}
              {!runsQuery.isLoading && !runsQuery.error && runs.length === 0 && (
                <EmptyState
                  title="No reports yet"
                  description="Ask Lucy to schedule a task and results will appear here."
                />
              )}
              {runs.length > 0 && (
                <div className="space-y-2">
                  {runs.map((run) => (
                    <RunCard key={run.id} run={run} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="tasks" className="mt-0">
              {tasksQuery.isLoading && <LoadingSkeleton />}
              {tasksQuery.error && (
                <ErrorState message="Failed to load tasks. Try refreshing the page." />
              )}
              {!tasksQuery.isLoading && !tasksQuery.error && tasks.length === 0 && (
                <EmptyState
                  title="No scheduled tasks"
                  description="Ask Lucy to create a recurring task like 'check my competitors every Monday'."
                />
              )}
              {tasks.length > 0 && (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <TaskCard
                      key={task.uuid}
                      task={task}
                      onToggle={(uuid) => toggleTask.mutate(uuid)}
                      onDelete={(uuid) => deleteTask.mutate(uuid)}
                      isToggling={toggleTask.isPending}
                      isDeleting={deleteTask.isPending}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
