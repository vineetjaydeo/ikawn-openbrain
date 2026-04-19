export const queryKeys = {
  conversations: {
    all: ['conversations'] as const,
    detail: (id: string) => ['conversations', id] as const,
  },
  auth: {
    me: ['auth', 'me'] as const,
  },
  connectors: {
    all: ['connectors'] as const,
  },
  customInstructions: ['customInstructions'] as const,
  search: (query: string) => ['search', query] as const,
  settings: ['settings'] as const,
  admin: {
    users: ['admin', 'users'] as const,
  },
  vault: {
    all: ['vault'] as const,
    list: (params?: Record<string, string>) => ['vault', 'list', params ?? {}] as const,
    detail: (id: string) => ['vault', id] as const,
    stats: ['vault', 'stats'] as const,
    folders: ['vault', 'folders'] as const,
  },
  reports: {
    runs: ['reports', 'runs'] as const,
    tasks: ['reports', 'tasks'] as const,
    unreadCount: ['reports', 'unreadCount'] as const,
  },
};
