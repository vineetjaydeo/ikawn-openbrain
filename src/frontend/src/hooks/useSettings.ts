import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

// --- Custom Instructions ---

interface CustomInstructionsResponse {
  instructions: string | null;
}

export function useCustomInstructions() {
  return useQuery({
    queryKey: queryKeys.customInstructions,
    queryFn: () => apiFetch<CustomInstructionsResponse>('/api/custom-instructions'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveCustomInstructions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instructions: string) =>
      apiFetch<{ ok: boolean }>('/api/custom-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      }),
    onSuccess: (_data, instructions) => {
      queryClient.setQueryData(queryKeys.customInstructions, {
        instructions,
      });
    },
  });
}

// --- Change Password ---

interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) =>
      apiFetch<{ ok: boolean }>('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
  });
}

// --- Connectors ---

interface Connector {
  id: string;
  type: string;
  name: string;
  connected: boolean;
  provider: string;
}

export function useConnectors() {
  return useQuery({
    queryKey: queryKeys.connectors.all,
    queryFn: () => apiFetch<Connector[]>('/api/connectors'),
    staleTime: 60 * 1000,
  });
}
