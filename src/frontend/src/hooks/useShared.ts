import { useQuery } from '@tanstack/react-query'

export interface SharedMessage {
  role: 'user' | 'assistant'
  content: string
  time: string
}

export interface SharedConversation {
  title: string
  date: string
  author: string
  messages: SharedMessage[]
}

async function fetchSharedConversation(token: string): Promise<SharedConversation> {
  const res = await fetch(`/shared/${token}`)
  if (!res.ok) throw new Error('Conversation not found')
  return res.json()
}

export function useSharedConversation(token: string | undefined) {
  return useQuery({
    queryKey: ['shared-conversation', token],
    queryFn: () => fetchSharedConversation(token!),
    enabled: !!token,
    retry: false,
  })
}
