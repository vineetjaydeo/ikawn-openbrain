import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VaultItem {
  id: string;
  filename: string;
  file_url: string;
  file_key: string;
  file_type: string;
  mime_type: string;
  file_size: number;
  source: string | null;
  source_ref: string | null;
  folder: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  starred: boolean;
  created_at: string;
  updated_at: string;
}

export interface VaultListResponse {
  items: VaultItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface VaultStats {
  total: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  starred: number;
}

export interface UploadResult {
  url: string;
  key: string;
  extracted_text?: string;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useVaultList(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.vault.list(params),
    queryFn: () => {
      const qs = params
        ? '?' + new URLSearchParams(params).toString()
        : '';
      return apiFetch<VaultListResponse>(`/api/vault${qs}`);
    },
    staleTime: 30 * 1000,
  });
}

export function useVaultStats() {
  return useQuery({
    queryKey: queryKeys.vault.stats,
    queryFn: () => apiFetch<VaultStats>('/api/vault/stats'),
    staleTime: 60 * 1000,
  });
}

export function useVaultItem(id: string | null) {
  return useQuery({
    queryKey: queryKeys.vault.detail(id ?? ''),
    queryFn: () => apiFetch<VaultItem>(`/api/vault/${id}`),
    enabled: !!id,
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<UploadResult> => {
      // Read file as base64
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      return apiFetch<UploadResult>('/api/upload/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: base64,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.all });
    },
  });
}

export function useDeleteVaultItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean }>(`/api/vault/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.all });
    },
  });
}

export function useToggleStar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      apiFetch<VaultItem>(`/api/vault/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.all });
    },
  });
}

export function useRenameVaultItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      apiFetch<VaultItem>(`/api/vault/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.all });
    },
  });
}

export { ApiError };
