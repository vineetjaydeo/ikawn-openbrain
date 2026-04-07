import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const USERS_KEY = ['admin-users'] as const

interface AdminUser {
  id: number
  name: string
  email: string
  role: string
  status: string
  last_login: string | null
  created_at: string
}

async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch('/admin/api/users', { credentials: 'same-origin' })
  if (!res.ok) throw new Error('Failed to fetch users')
  return res.json()
}

async function createUser(data: { email: string; name: string; password: string; role: string }): Promise<AdminUser> {
  const res = await fetch('/admin/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || 'Failed to create user')
  }
  return res.json()
}

async function updateUser(id: number, data: { name?: string; role?: string; status?: string }): Promise<void> {
  const res = await fetch(`/admin/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || 'Failed to update user')
  }
}

async function resetPassword(id: number, password: string): Promise<void> {
  const res = await fetch(`/admin/api/users/${id}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || 'Failed to reset password')
  }
}

export function useAdminUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: fetchUsers,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; role?: string; status?: string }) =>
      updateUser(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      resetPassword(id, password),
  })
}

export type { AdminUser }
