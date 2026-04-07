import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/lib/api'
import type { GalleryImage } from '@/types/api'

interface UseGalleryOptions {
  source?: 'generations' | 'chat'
  search?: string
}

export function useGallery(opts?: UseGalleryOptions) {
  const query = useQuery({
    queryKey: ['gallery', opts?.source],
    queryFn: () => api.gallery.list({ source: opts?.source }),
  })

  const images = useMemo(() => {
    const all = query.data?.images ?? []
    if (!opts?.search) return all

    const term = opts.search.toLowerCase()
    return all.filter(
      (img: GalleryImage) =>
        img.filename?.toLowerCase().includes(term) ||
        img.agent?.toLowerCase().includes(term) ||
        img.conversation?.toLowerCase().includes(term)
    )
  }, [query.data?.images, opts?.search])

  return {
    images,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
