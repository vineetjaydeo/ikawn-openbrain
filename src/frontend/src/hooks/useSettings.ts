import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useCustomInstructions() {
  return useQuery({
    queryKey: ['custom-instructions'],
    queryFn: () => api.settings.getCustomInstructions(),
  })
}

export function useUpdateCustomInstructions() {
  return useMutation({
    mutationFn: (text: string) => api.settings.updateCustomInstructions(text),
  })
}
