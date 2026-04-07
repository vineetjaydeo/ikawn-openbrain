import { useState, useEffect, useRef, useCallback } from 'react'
import { Link2, Copy, Check, X, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useShareConversation, useUnshareConversation, useExportConversation } from '@/hooks/useConversations'
import { toast } from 'sonner'

interface ShareMenuProps {
  conversationId: string
  shareToken: string | null
  onClose: () => void
}

export function ShareMenu({ conversationId, shareToken, onClose }: ShareMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [token, setToken] = useState(shareToken)
  const [copied, setCopied] = useState(false)

  const shareMutation = useShareConversation()
  const unshareMutation = useUnshareConversation()
  const exportMutation = useExportConversation()

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const shareUrl = token ? `${window.location.origin}/shared/${token}` : null

  const handleCreateShare = useCallback(async () => {
    try {
      const result = await shareMutation.mutateAsync(conversationId)
      setToken(result.share_token)
      toast.success('Share link created')
    } catch {
      toast.error('Failed to create share link')
    }
  }, [conversationId, shareMutation])

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }, [shareUrl])

  const handleRevoke = useCallback(async () => {
    try {
      await unshareMutation.mutateAsync(conversationId)
      setToken(null)
      toast.success('Share link revoked')
    } catch {
      toast.error('Failed to revoke share link')
    }
  }, [conversationId, unshareMutation])

  const handleExportMarkdown = useCallback(async () => {
    try {
      const result = await exportMutation.mutateAsync(conversationId)
      await navigator.clipboard.writeText(result.markdown)
      toast.success('Copied as Markdown')
      onClose()
    } catch {
      toast.error('Failed to export')
    }
  }, [conversationId, exportMutation, onClose])

  return (
    <div
      ref={menuRef}
      className={cn(
        'absolute right-0 top-full mt-1 z-50',
        'w-64 rounded-xl border border-[hsl(var(--border))]',
        'bg-[var(--surface-1)] shadow-xl py-1'
      )}
    >
      <div className="px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
        Share
      </div>

      {!token ? (
        <button
          onClick={handleCreateShare}
          disabled={shareMutation.isPending}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-[0.82rem] text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text)] transition-colors disabled:opacity-50"
        >
          {shareMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          Create share link
        </button>
      ) : (
        <>
          <button
            onClick={handleCopyLink}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-[0.82rem] text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text)] transition-colors"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied!' : 'Copy share link'}
          </button>
          <button
            onClick={handleRevoke}
            disabled={unshareMutation.isPending}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-[0.82rem] text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {unshareMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            Revoke share link
          </button>
        </>
      )}

      <div className="mx-2 my-1 h-px bg-[hsl(var(--border))]" />

      <button
        onClick={handleExportMarkdown}
        disabled={exportMutation.isPending}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-[0.82rem] text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text)] transition-colors disabled:opacity-50"
      >
        {exportMutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        Copy as Markdown
      </button>
    </div>
  )
}
