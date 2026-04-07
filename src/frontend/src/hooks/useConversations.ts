import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Conversation, ConversationDetail } from '@/types/api'

const CONVERSATIONS_KEY = ['conversations'] as const

export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: () => api.conversations.list(),
  })
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.conversations.get(id!),
    enabled: !!id,
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (title?: string) => api.conversations.create(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.conversations.delete(id),
    onMutate: async (id) => {
      // Optimistic: remove from list immediately
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_KEY })
      const previous = queryClient.getQueryData<Conversation[]>(CONVERSATIONS_KEY)

      queryClient.setQueryData<Conversation[]>(CONVERSATIONS_KEY, (old) =>
        old?.filter((c) => c.id !== id) ?? []
      )

      return { previous }
    },
    onError: (_err, _id, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(CONVERSATIONS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

export function useRenameConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.conversations.rename(id, title),
    onMutate: async ({ id, title }) => {
      // Optimistic: update title immediately
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_KEY })
      const previous = queryClient.getQueryData<Conversation[]>(CONVERSATIONS_KEY)

      queryClient.setQueryData<Conversation[]>(CONVERSATIONS_KEY, (old) =>
        old?.map((c) => (c.id === id ? { ...c, title } : c)) ?? []
      )

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CONVERSATIONS_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

export function useShareConversation() {
  return useMutation({
    mutationFn: (id: string) => api.conversations.share(id),
  })
}

export function useUnshareConversation() {
  return useMutation({
    mutationFn: (id: string) => api.conversations.unshare(id),
  })
}

export function useExportConversation() {
  return useMutation({
    mutationFn: (id: string) => api.conversations.exportMarkdown(id),
  })
}
