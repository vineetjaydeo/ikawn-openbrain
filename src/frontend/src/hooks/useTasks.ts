import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

// ── Types ──

export interface TaskRun {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: 'completed' | 'failed' | 'running' | 'pending';
  result: string | Record<string, unknown> | null;
  error: string | null;
  cost_usd: number | null;
  tokens_used: number | null;
  viewed_at: string | null;
  task_uuid: string;
  task_name: string;
  tool: string;
  agent_slug: string | null;
  schedule_type: string;
  interval_minutes: number | null;
  cron_expression: string | null;
  enabled: boolean;
}

export interface ScheduledTask {
  uuid: string;
  name: string;
  description: string | null;
  agent_slug: string | null;
  tool: string;
  tier: string | null;
  schedule_type: string;
  cron_expression: string | null;
  interval_minutes: number | null;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  run_count: number;
  created_at: string;
}

// ── Hooks ──

export function useReportRuns() {
  return useQuery({
    queryKey: queryKeys.reports.runs,
    queryFn: () =>
      apiFetch<{ runs: TaskRun[] }>('/api/reports/runs'),
    staleTime: 30 * 1000,
  });
}

export function useScheduledTasks() {
  return useQuery({
    queryKey: queryKeys.reports.tasks,
    queryFn: () =>
      apiFetch<{ tasks: ScheduledTask[] }>('/api/reports/tasks'),
    staleTime: 30 * 1000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.reports.unreadCount,
    queryFn: () =>
      apiFetch<{ count: number }>('/api/reports/unread-count'),
    staleTime: 60 * 1000,
  });
}

export function useMarkViewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>('/api/reports/mark-viewed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.unreadCount });
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.runs });
    },
  });
}

export function useToggleTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (uuid: string) =>
      apiFetch<{ ok: boolean; enabled: boolean }>(
        `/api/reports/tasks/${encodeURIComponent(uuid)}/toggle`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' } },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.tasks });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (uuid: string) =>
      apiFetch<{ ok: boolean }>(
        `/api/reports/tasks/${encodeURIComponent(uuid)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.tasks });
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.runs });
    },
  });
}
