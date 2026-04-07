import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useConversation, useCreateConversation } from '@/hooks/useConversations'
import { useChatStream } from '@/hooks/useChatStream'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { useDraft } from '@/hooks/useDraft'
import { useUpload } from '@/hooks/useUpload'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { MessageList } from '@/components/chat/MessageList'
import { ComposeBar } from '@/components/chat/ComposeBar'
import { WelcomeScreen } from '@/components/chat/WelcomeScreen'
import { Lightbox } from '@/components/shared/Lightbox'
import { GalleryPicker } from '@/components/gallery/GalleryPicker'
import { ShareMenu } from '@/components/chat/ShareMenu'
import { Share2, StopCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { Message as ApiMessage, Attachment as ApiAttachment } from '@/types/api'
import type { Message, ToolEvent, GenerationEvent, ContextSummary } from '@/types/chat'
import type { Attachment, ModelTier } from '@/types/chat'
import type { User } from '@/hooks/useAuth'

/** Map API message to component Message type */
function toMessage(msg: ApiMessage): Message {
  return {
    id: String(msg.id),
    role: msg.role,
    content: msg.content,
    attachments: msg.attachments?.map(mapApiAttachment),
    created_at: msg.created_at,
    tier: msg.tier,
  }
}

/** Map API attachment to chat Attachment type */
function mapApiAttachment(a: ApiAttachment): Attachment {
  return {
    id: `${a.url}-${a.name || a.filename || ''}`,
    type: a.type,
    url: a.url,
    filename: a.filename || a.name,
    mimeType: a.contentType,
    extractedText: a.extracted_text,
  }
}

/** Map API ContextSummary to chat ContextSummary type */
function toContextSummary(
  cs: import('@/types/api').ContextSummary | null | undefined
): ContextSummary | undefined {
  if (!cs) return undefined
  const complexityMap: Record<string, 'low' | 'medium' | 'high'> = {
    casual: 'low',
    standard: 'medium',
    complex: 'high',
    low: 'low',
    medium: 'medium',
    high: 'high',
  }
  return {
    topic: cs.topic,
    complexity: complexityMap[cs.complexity ?? ''] ?? undefined,
    bullets: cs.bullets?.map((b) => (typeof b === 'string' ? b : b.text)),
    decisions: cs.decisions,
    open_questions: cs.open_questions,
  }
}

interface ChatPageProps {
  user: User | null
}

export function ChatPage({ user }: ChatPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isMobile, setSidebarExpanded } = useUIStore()

  // Conversation data
  const { data: conversationDetail, isLoading: isConvLoading } = useConversation(id)
  const createConversation = useCreateConversation()

  // Streaming
  const { sendMessage, cancelStream, isStreaming } = useChatStream()
  const {
    streamingText,
    streamingTools,
    streamingAgent,
    streamingTier,
    pendingGenerations,
    selectedTier,
    setSelectedTier,
    setActiveConversation,
  } = useChatStore()

  // Draft — wired to ComposeBar via controlled value/onChange
  const { draftText, setDraftText, clearDraft } = useDraft(conversationDetail)

  // Upload
  const { upload, isUploading } = useUpload()

  // UI state
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([])

  // Pending suggestion — when user clicks a suggestion chip on WelcomeScreen,
  // we create a conversation and then send the message after navigating.
  const pendingSuggestionRef = useRef<string | null>(null)
  const composeBarRef = useRef<HTMLTextAreaElement | null>(null)

  // Track active conversation in store
  useEffect(() => {
    setActiveConversation(id ?? null)
    setOptimisticMessages([])
  }, [id, setActiveConversation])

  // Close sidebar on mobile when viewing a conversation
  useEffect(() => {
    if (id && isMobile) {
      setSidebarExpanded(false)
    }
  }, [id, isMobile, setSidebarExpanded])

  // If we navigated here with a pending suggestion, send it now
  useEffect(() => {
    if (id && pendingSuggestionRef.current && conversationDetail) {
      const text = pendingSuggestionRef.current
      pendingSuggestionRef.current = null
      handleSend(text, [])
    }
  }, [id, conversationDetail]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build messages array from API + optimistic
  const apiMessages: Message[] = (conversationDetail?.messages ?? []).map(toMessage)
  const messages = [...apiMessages, ...optimisticMessages]

  // Build tool events from streaming state
  const toolEvents: ToolEvent[] = streamingTools.map((t) => ({
    type: t.status === 'running' ? 'tool_start' as const : 'tool_done' as const,
    name: t.tool,
    result: t.detail,
    success: t.status === 'done',
  }))

  // Build generation events from pending generations
  const generations: GenerationEvent[] = pendingGenerations.map((g) => ({
    id: g.id,
    agent: g.agent,
    prompt: g.prompt,
    status: 'pending' as const,
  }))

  // Context summary
  const contextSummary = toContextSummary(conversationDetail?.context_summary)

  // Handle send message
  const handleSend = useCallback(
    async (text: string, attachments: Attachment[]) => {
      if (!text.trim() && attachments.length === 0) return

      let targetId = id

      // If no conversation, create one first
      if (!targetId) {
        try {
          const newConv = await createConversation.mutateAsync()
          targetId = newConv.id
          navigate(`/chat/${targetId}`, { replace: true })
        } catch {
          toast.error('Failed to create conversation')
          return
        }
      }

      // Add optimistic user message
      const optimisticMsg: Message = {
        id: `optimistic-${Date.now()}`,
        role: 'user',
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
        created_at: new Date().toISOString(),
      }
      setOptimisticMessages((prev) => [...prev, optimisticMsg])

      // Clear draft
      clearDraft()

      // Upload any file attachments that are blob URLs
      const uploadedAttachments: ApiAttachment[] = []
      for (const att of attachments) {
        if (att.url.startsWith('blob:')) {
          try {
            uploadedAttachments.push({
              type: att.type,
              url: att.url,
              filename: att.filename,
              name: att.filename,
              contentType: att.mimeType,
            })
          } catch {
            toast.error(`Failed to upload ${att.filename}`)
          }
        } else {
          uploadedAttachments.push({
            type: att.type,
            url: att.url,
            filename: att.filename,
            name: att.filename,
            contentType: att.mimeType,
          })
        }
      }

      // Send via streaming
      sendMessage(targetId!, text, {
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        tier: selectedTier !== 'pro' ? selectedTier : undefined,
      })
    },
    [id, createConversation, navigate, clearDraft, sendMessage, selectedTier]
  )

  // Clear optimistic messages when streaming completes and conversation reloads
  useEffect(() => {
    if (!isStreaming && optimisticMessages.length > 0 && conversationDetail) {
      const apiMsgCount = conversationDetail.messages?.length ?? 0
      if (apiMsgCount > 0) {
        setOptimisticMessages([])
      }
    }
  }, [isStreaming, conversationDetail, optimisticMessages.length])

  // Handle suggestion chip click from WelcomeScreen
  const handleSuggestionClick = useCallback(
    async (text: string) => {
      try {
        const newConv = await createConversation.mutateAsync()
        pendingSuggestionRef.current = text
        navigate(`/chat/${newConv.id}`)
      } catch {
        toast.error('Failed to create conversation')
      }
    },
    [createConversation, navigate]
  )

  // Handle gallery image selection
  const handleGallerySelect = useCallback(
    (url: string, filename: string) => {
      useChatStore.getState().addAttachment({
        type: 'image',
        url,
        filename,
        name: filename,
      })
      setGalleryOpen(false)
    },
    []
  )

  // Handle resend (re-send a user message)
  const handleResend = useCallback(
    (content: string) => {
      handleSend(content, [])
    },
    [handleSend]
  )

  // Handle drag and drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const files = Array.from(e.dataTransfer.files)
      for (const file of files) {
        try {
          const result = await upload(file)
          useChatStore.getState().addAttachment(result)
        } catch {
          toast.error(`Failed to upload ${file.name}`)
        }
      }
    },
    [upload]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewChat: () => navigate('/chat'),
    onFocusCompose: () => {
      // Find the textarea in the compose bar and focus it
      const textarea = document.querySelector('textarea[placeholder*="Lucy"]') as HTMLTextAreaElement | null
      textarea?.focus()
    },
    onDeleteConversation: id ? () => {
      // Trigger delete from the sidebar — we don't have direct access here,
      // so we dispatch a custom event that AppShell listens for
      window.dispatchEvent(new CustomEvent('delete-conversation', { detail: { id } }))
    } : undefined,
  })

  // No conversation ID — show welcome screen
  if (!id) {
    return (
      <div className="flex flex-1 flex-col h-full">
        <WelcomeScreen user={user} onSuggestionClick={handleSuggestionClick} />
        <ComposeBar
          onSend={(text, attachments) => {
            handleSend(
              text,
              attachments.map((a) => ({
                id: a.id || `att-${Date.now()}`,
                type: a.type,
                url: a.url,
                filename: a.filename,
                mimeType: a.mimeType,
              }))
            )
          }}
          onGalleryOpen={() => setGalleryOpen(true)}
          tier={selectedTier}
          onTierChange={setSelectedTier}
          value={draftText}
          onTextChange={setDraftText}
        />
        <GalleryPicker
          open={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          onSelect={handleGallerySelect}
        />
      </div>
    )
  }

  return (
    <div
      className="flex flex-1 flex-col h-full relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Header bar with share */}
      {conversationDetail && (
        <div className="flex items-center justify-between px-6 py-2 border-b border-[hsl(var(--border))]/50 md:px-4">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] truncate max-w-[60%]">
            {conversationDetail.title || 'New conversation'}
          </h2>
          <div className="flex items-center gap-2">
            {isStreaming && (
              <button
                onClick={cancelStream}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors duration-200"
                title="Stop generating"
              >
                <StopCircle className="h-3.5 w-3.5" />
                Stop
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setShareMenuOpen((p) => !p)}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:bg-white/5 hover:text-[var(--text)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40"
                title="Share"
              >
                <Share2 className="h-4 w-4" />
              </button>
              {shareMenuOpen && (
                <ShareMenu
                  conversationId={id}
                  shareToken={conversationDetail.share_token ?? null}
                  onClose={() => setShareMenuOpen(false)}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message list */}
      <MessageList
        messages={messages}
        isLoading={isConvLoading}
        isStreaming={isStreaming}
        streamingContent={streamingText}
        toolEvents={toolEvents}
        agentIdentity={streamingAgent?.name}
        tierSwitch={streamingTier?.label}
        generations={generations}
        contextSummary={contextSummary}
        onImageClick={(src) => setLightboxSrc(src)}
        onResend={handleResend}
      />

      {/* Compose bar */}
      <ComposeBar
        onSend={(text, attachments) => {
          handleSend(
            text,
            attachments.map((a) => ({
              id: a.id || `att-${Date.now()}`,
              type: a.type,
              url: a.url,
              filename: a.filename,
              mimeType: a.mimeType,
            }))
          )
        }}
        onGalleryOpen={() => setGalleryOpen(true)}
        disabled={isStreaming || isUploading}
        disabledLabel={isUploading ? 'Uploading...' : 'Lucy is thinking...'}
        tier={selectedTier}
        onTierChange={setSelectedTier}
        value={draftText}
        onTextChange={setDraftText}
      />

      {/* Lightbox */}
      <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      {/* Gallery picker */}
      <GalleryPicker
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSelect={handleGallerySelect}
      />
    </div>
  )
}
