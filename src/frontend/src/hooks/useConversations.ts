import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { Conversation, Message } from '@/stores/chat';

interface ConversationDetailResponse {
  id: string;
  title: string;
  messages?: Message[];
  [key: string]: unknown;
}

interface UpdateTitlePayload {
  id: string;
  title: string;
}

export function useConversations() {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: queryKeys.conversations.all,
    queryFn: () =>
      // API returns array directly, not { conversations: [...] }
      apiFetch<Conversation[]>('/api/conversations'),
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (title?: string) =>
      // API returns conversation object directly, not { conversation: {...} }
      apiFetch<Conversation>('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<Record<string, never>>(`/api/conversations/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    },
  });

  const updateTitleMutation = useMutation({
    mutationFn: ({ id, title }: UpdateTitlePayload) =>
      apiFetch<Conversation>(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(variables.id),
      });
    },
  });

  return {
    conversations: listQuery.data,
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    remove: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    updateTitle: updateTitleMutation.mutateAsync,
    isUpdatingTitle: updateTitleMutation.isPending,
  };
}

export function useConversationDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(id ?? ''),
    queryFn: () =>
      // API returns conversation object directly with messages array
      apiFetch<ConversationDetailResponse>(`/api/conversations/${id}`),
    enabled: !!id,
    staleTime: 10 * 1000,
  });
}
