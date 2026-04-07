import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface CostData {
  today: { spend_usd: number; date: string }
  last_7_days: Array<{ date: string; spend_usd: number }>
  by_model: Array<{ model: string; input_tokens: number; output_tokens: number; requests: number }>
  embeddings: { tokens: number; requests: number }
  images: { count: number; requests: number }
  cached_at: string
  error?: string
}

export interface BrainHealthData {
  embedding_queue: Array<{ embedding_status: string; count: string }>
  moderation: { total: number; unscored: number; flagged: number; severe: number }
  brand_ratings: Array<Record<string, unknown>>
  mothership: Array<{ data_type: string; count: string; last_promoted: string }>
  memories_by_brand: Array<{ brand_id: string; count: string }>
  error?: string
}

export function useCosts(refresh?: boolean) {
  return useQuery<CostData>({
    queryKey: ['admin-costs', refresh],
    queryFn: () => api.admin.costs() as Promise<CostData>,
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 minutes
  })
}

export function useBrainHealth() {
  return useQuery<BrainHealthData>({
    queryKey: ['brain-health'],
    queryFn: () => api.admin.brainHealth() as Promise<BrainHealthData>,
    refetchInterval: 5 * 60 * 1000,
  })
}
