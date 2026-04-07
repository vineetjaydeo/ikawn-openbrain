import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/lib/api'
import type { MentionItem, ToolItem } from '@/types/api'

export interface MentionEntry {
  type: 'agent' | 'person' | 'tool'
  slug: string
  name: string
  role?: string
  description?: string
}

/**
 * Fetches agents/people and tools, merges into a unified mention list.
 * Supports filtering by query string for autocomplete.
 */
export function useMentions(query?: string) {
  const mentionsQuery = useQuery({
    queryKey: ['mentions'],
    queryFn: () => api.mentions.list(),
    staleTime: 60_000, // mentions rarely change
  })

  const toolsQuery = useQuery({
    queryKey: ['tools'],
    queryFn: () => api.mentions.tools(),
    staleTime: 60_000,
  })

  const entries = useMemo(() => {
    const agents: MentionEntry[] = (mentionsQuery.data ?? []).map((m: MentionItem) => ({
      type: m.type as 'agent' | 'person',
      slug: m.slug,
      name: m.name,
      role: m.role,
    }))

    const tools: MentionEntry[] = (toolsQuery.data?.tools ?? []).map((t: ToolItem) => ({
      type: 'tool' as const,
      slug: t.name,
      name: t.name,
      description: t.description,
      role: t.tier,
    }))

    let all = [...agents, ...tools]

    if (query) {
      const q = query.toLowerCase()
      all = all.filter(
        (entry) =>
          entry.name.toLowerCase().includes(q) ||
          entry.slug.toLowerCase().includes(q) ||
          entry.role?.toLowerCase().includes(q) ||
          entry.description?.toLowerCase().includes(q)
      )
    }

    return all
  }, [mentionsQuery.data, toolsQuery.data, query])

  return {
    entries,
    isLoading: mentionsQuery.isLoading || toolsQuery.isLoading,
    error: mentionsQuery.error || toolsQuery.error,
  }
}
