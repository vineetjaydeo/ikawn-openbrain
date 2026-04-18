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
  search: (query: string) => ['search', query] as const,
  settings: ['settings'] as const,
};
