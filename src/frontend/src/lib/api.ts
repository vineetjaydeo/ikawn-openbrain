// ── API Client ──
// Typed wrapper around fetch for all OpenBrain backend endpoints.
// Credentials: same-origin (session cookies sent automatically).

import type {
  Conversation,
  ConversationDetail,
  GalleryImage,
  MentionItem,
  ToolItem,
  PresignResponse,
} from '@/types/api'

// ── Internal helpers ──

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (res.status === 401 || res.redirected) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || `Request failed: ${res.status}`)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

function get<T>(url: string): Promise<T> {
  return request<T>(url)
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function patch<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function put<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

function del<T>(url: string): Promise<T> {
  return request<T>(url, { method: 'DELETE' })
}

// ── API namespaces ──

export const api = {
  conversations: {
    list: () => get<Conversation[]>('/api/conversations'),

    create: (title?: string) =>
      post<Conversation>('/api/conversations', title ? { title } : {}),

    get: (id: string) => get<ConversationDetail>(`/api/conversations/${id}`),

    delete: (id: string) => del<{ success: boolean }>(`/api/conversations/${id}`),

    rename: (id: string, title: string) =>
      patch<Conversation>(`/api/conversations/${id}`, { title }),

    share: (id: string) =>
      post<{ share_token: string }>(`/api/conversations/${id}/share`),

    unshare: (id: string) => del<{ success: boolean }>(`/api/conversations/${id}/share`),

    exportMarkdown: (id: string) =>
      get<{ markdown: string; title: string }>(`/api/conversations/${id}/markdown`),

    saveDraft: (id: string, text: string) =>
      put<{ success: boolean }>(`/api/conversations/${id}/draft`, { text }),

    saveGeneration: (id: string, data: { generationId: string; urls: string[]; agent?: string }) =>
      post<{ success: boolean }>(`/api/conversations/${id}/generation`, data),
  },

  settings: {
    getCustomInstructions: () =>
      get<{ custom_instructions: string }>('/api/custom-instructions'),

    updateCustomInstructions: (text: string) =>
      patch<{ success: boolean }>('/api/custom-instructions', { custom_instructions: text }),
  },

  upload: {
    presign: (filename: string, contentType: string) =>
      post<PresignResponse>('/api/upload/presign', { filename, contentType }),

    direct: (data: string, filename: string, contentType: string) =>
      post<{ url: string; key: string; extracted_text?: string }>('/api/upload/direct', {
        data,
        filename,
        contentType,
      }),
  },

  gallery: {
    list: (opts?: { source?: 'generations' | 'chat'; agent?: string; limit?: number }) => {
      const params = new URLSearchParams()
      if (opts?.source) params.set('source', opts.source)
      if (opts?.agent) params.set('agent', opts.agent)
      if (opts?.limit) params.set('limit', String(opts.limit))
      const qs = params.toString()
      return get<{ images: GalleryImage[] }>(`/api/gallery${qs ? `?${qs}` : ''}`)
    },
  },

  mentions: {
    list: () => get<MentionItem[]>('/api/mission/mentions'),
    tools: () => get<{ tools: ToolItem[] }>('/api/mission/tools'),
  },

  admin: {
    costs: () => get<Record<string, unknown>>('/admin/costs'),
    brainHealth: () => get<Record<string, unknown>>('/brain-health'),
    users: () => get<{ team: Array<Record<string, unknown>> }>('/api/mission/team'),
  },

  auth: {
    me: () => get<{ id: number; email: string; name: string; role: string }>('/auth/me'),
    login: (email: string, password: string) =>
      post<{ ok: boolean; user?: Record<string, unknown>; error?: string }>('/auth/login', {
        email,
        password,
      }),
    logout: () => post<void>('/auth/logout'),
    health: () => get<{ status: string; version: string }>('/health'),
  },
} as const
