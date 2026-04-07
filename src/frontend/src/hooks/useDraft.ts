import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { api } from '@/lib/api'
import type { ConversationDetail } from '@/types/api'

const DEBOUNCE_MS = 2000

/**
 * Draft persistence hook.
 * - Loads draft from conversation data on mount
 * - Saves draft on change (debounced 2s)
 * - Saves draft on page unload via sendBeacon
 * - Clears draft after sending a message
 */
export function useDraft(conversation: ConversationDetail | undefined) {
  const { draftText, setDraftText } = useChatStore()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const conversationId = conversation?.id
  const lastSavedRef = useRef<string>('')

  // Load draft from conversation data when conversation changes
  useEffect(() => {
    const draft = conversation?.draft_text ?? ''
    setDraftText(draft)
    lastSavedRef.current = draft
  }, [conversationId, conversation?.draft_text, setDraftText])

  // Debounced save on draft change
  useEffect(() => {
    if (!conversationId) return
    if (draftText === lastSavedRef.current) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      api.conversations
        .saveDraft(conversationId, draftText)
        .then(() => {
          lastSavedRef.current = draftText
        })
        .catch(() => {
          // Silent fail — draft save is non-critical
        })
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [conversationId, draftText])

  // Save draft on page unload using sendBeacon
  useEffect(() => {
    if (!conversationId) return

    const handleUnload = () => {
      const text = useChatStore.getState().draftText
      if (text && text !== lastSavedRef.current) {
        const body = JSON.stringify({ text })
        navigator.sendBeacon(
          `/api/conversations/${conversationId}/draft`,
          new Blob([body], { type: 'application/json' })
        )
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [conversationId])

  const clearDraft = useCallback(() => {
    setDraftText('')
    lastSavedRef.current = ''
    if (conversationId) {
      api.conversations.saveDraft(conversationId, '').catch(() => {})
    }
  }, [conversationId, setDraftText])

  return { draftText, setDraftText, clearDraft }
}
