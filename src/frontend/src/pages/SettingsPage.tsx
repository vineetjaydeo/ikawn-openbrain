import { useState, useEffect } from 'react'
import { useCustomInstructions, useUpdateCustomInstructions } from '@/hooks/useSettings'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

export function SettingsPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useCustomInstructions()
  const updateMutation = useUpdateCustomInstructions()
  const [text, setText] = useState('')
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (data && !initialized) {
      setText(data.custom_instructions || '')
      setInitialized(true)
    }
  }, [data, initialized])

  function handleSave() {
    updateMutation.mutate(text, {
      onSuccess: () => toast.success('Custom instructions saved'),
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <button
            onClick={() => navigate('/chat')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--border))] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-[Parkinsans] text-xl font-semibold text-[var(--text)]">Settings</h1>
            <p className="text-sm text-[var(--text-secondary)]">Personalize your experience</p>
          </div>
        </div>

        {/* Custom Instructions Card */}
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Custom Instructions
          </h2>
          <p className="mb-4 text-sm text-[var(--text-tertiary)]">
            Tell Lucy about yourself -- your role, preferences, or how you'd like responses.
            This is added to every conversation.
          </p>

          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--gold)] border-t-transparent" />
            </div>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                placeholder="e.g. I'm the CTO. Keep answers technical and concise. Always suggest test cases."
                className="w-full resize-y rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--gold)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
                rows={4}
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-[var(--text-tertiary)]">{text.length}/500</span>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-[hsl(var(--background))] transition-colors hover:bg-[var(--gold-hover)] disabled:opacity-50"
                >
                  {updateMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Save
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
