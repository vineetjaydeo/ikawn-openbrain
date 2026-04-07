import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const RUNS_KEY = ['report-runs'] as const
const TASKS_KEY = ['report-tasks'] as const
const UNREAD_KEY = ['report-unread'] as const

export interface ReportRun {
  id: number
  started_at: string
  completed_at: string | null
  status: 'completed' | 'failed' | 'running'
  result: string | Record<string, unknown> | null
  error: string | null
  cost_usd: number | null
  tokens_used: number | null
  viewed_at: string | null
  task_uuid: string
  task_name: string
  tool: string
  agent_slug: string
  schedule_type: string
  interval_minutes: number | null
  cron_expression: string | null
  enabled: boolean
}

export interface ReportTask {
  uuid: string
  name: string
  description: string | null
  agent_slug: string
  tool: string
  tier: string
  schedule_type: string
  cron_expression: string | null
  interval_minutes: number | null
  enabled: boolean
  next_run_at: string | null
  last_run_at: string | null
  last_status: string | null
  run_count: number
  created_at: string
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

export function useReportRuns() {
  return useQuery({
    queryKey: RUNS_KEY,
    queryFn: () => request<{ runs: ReportRun[] }>('/api/reports/runs').then(d => d.runs),
  })
}

export function useReportTasks() {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: () => request<{ tasks: ReportTask[] }>('/api/reports/tasks').then(d => d.tasks),
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => request<{ count: number }>('/api/reports/unread-count').then(d => d.count),
    refetchInterval: 60_000,
  })
}

export function useMarkViewed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => request<{ ok: boolean }>('/api/reports/mark-viewed', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: UNREAD_KEY })
      qc.invalidateQueries({ queryKey: RUNS_KEY })
    },
  })
}

export function useToggleReportTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (uuid: string) =>
      request<{ ok: boolean; enabled: boolean }>(`/api/reports/tasks/${encodeURIComponent(uuid)}/toggle`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  })
}

export function useDeleteReportTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (uuid: string) =>
      request<{ ok: boolean }>(`/api/reports/tasks/${encodeURIComponent(uuid)}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: RUNS_KEY })
    },
  })
}
