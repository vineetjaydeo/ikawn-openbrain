import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const TASKS_KEY = ['mission-tasks'] as const
const AGENTS_KEY = ['mission-agents'] as const

export interface MissionTask {
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
  last_error: string | null
  run_count: number
  consecutive_failures: number
  requires_approval: boolean
  created_at: string
  updated_at: string
}

export interface TaskRun {
  id: number
  agent_slug: string
  started_at: string
  completed_at: string | null
  status: string
  tier: string
  error: string | null
  cost_usd: number | null
  tokens_used: number | null
}

export interface Agent {
  slug: string
  name: string
  role: string
  tools: string[] | null
  memory_tags: string[] | null
  enabled: boolean
  created_at: string
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (res.status === 401 || res.redirected) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || `Request failed: ${res.status}`)
  }
  return res.json()
}

export function useMissionTasks() {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: () => request<{ tasks: MissionTask[] }>('/api/mission/tasks').then(d => d.tasks),
  })
}

export function useMissionAgents() {
  return useQuery({
    queryKey: AGENTS_KEY,
    queryFn: () => request<{ agents: Agent[] }>('/api/mission/agents').then(d => d.agents),
  })
}

export function useTaskRuns(uuid: string | null) {
  return useQuery({
    queryKey: ['mission-task-runs', uuid],
    queryFn: () => request<{ runs: TaskRun[] }>(`/api/mission/tasks/${uuid}/runs`).then(d => d.runs),
    enabled: !!uuid,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; agent_slug?: string; tool: string; tier?: string; schedule_type: string; cron_expression?: string; interval_minutes?: number }) =>
      request<{ task: MissionTask }>('/api/mission/tasks', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uuid, ...data }: { uuid: string; enabled?: boolean; name?: string; description?: string }) =>
      request<{ ok: boolean }>(`/api/mission/tasks/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (uuid: string) =>
      request<{ ok: boolean }>(`/api/mission/tasks/${uuid}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  })
}

export function useToggleAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ slug, enabled }: { slug: string; enabled: boolean }) =>
      request<{ ok: boolean }>(`/api/mission/agents/${slug}`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  })
}
