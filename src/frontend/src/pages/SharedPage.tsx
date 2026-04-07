import { useParams } from 'react-router-dom'
import { useSharedConversation } from '@/hooks/useShared'
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer'
import { Loader2 } from 'lucide-react'

export function SharedPage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, error } = useSharedConversation(token)

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0A0F2E]">
        <Loader2 size={24} className="animate-spin text-[var(--gold)]" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0A0F2E] text-[#E8EAF0]">
        <h1 className="mb-2 text-2xl font-semibold">Conversation not found</h1>
        <p className="text-[#9498B0]">This link may have been revoked or is invalid.</p>
        <a href="/" className="mt-4 text-sm text-[var(--gold)] hover:underline">
          Go to Lucy
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0F2E] text-[#E8EAF0]" style={{ fontFamily: "'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Header */}
      <div className="mx-auto flex max-w-[900px] items-center justify-between border-b border-[#1C2452] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--gold)] text-xs font-bold text-[#0a0a0a]">
            {'\u2726'}
          </div>
          <div>
            <div className="font-[Parkinsans] text-base font-semibold text-[#E8EAF0]">{data.title}</div>
            <div className="text-xs text-[#5C6185]">{data.date}</div>
          </div>
        </div>
        <span className="rounded-full border border-[#252D5E] bg-[#1C2452] px-3 py-1 text-[11px] text-[#9498B0]">
          Shared conversation
        </span>
      </div>

      {/* Messages */}
      <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-6 py-8 pb-20">
        {data.messages.map((m, i) => (
          <div key={i} className={`flex gap-3.5 ${m.role === 'user' ? 'justify-end' : ''}`} style={{ lineHeight: 1.8 }}>
            {m.role === 'assistant' && (
              <div className="mt-6 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--gold)] text-[11px] font-semibold text-[#0a0a0a]">
                R
              </div>
            )}
            <div className={m.role === 'user' ? 'max-w-[75%]' : 'min-w-0 max-w-full'}>
              <div className={`mb-1 text-[11px] text-[#5C6185] ${m.role === 'user' ? 'text-right' : ''}`}>
                {m.role === 'assistant' ? 'Lucy' : data.author}
                <span className="ml-1.5">{m.time}</span>
              </div>
              {m.role === 'assistant' ? (
                <div className="font-[Noto_Serif] text-[15px] leading-[1.7] text-[#E8EAF0]">
                  <MarkdownRenderer content={m.content} />
                </div>
              ) : (
                <div className="rounded-[20px_20px_6px_20px] bg-gradient-to-br from-[#FFC01C] to-[#F59E0B] px-5 py-3 text-[15px] font-medium text-[#0A0F2E] shadow-[0_2px_12px_rgba(255,192,28,0.15)]">
                  {m.content}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mx-auto max-w-[900px] border-t border-[#1C2452] py-6 text-center">
        <a href="https://ikawn.com" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--gold)] hover:underline">
          Powered by Lucy -- iKawn
        </a>
      </div>
    </div>
  )
}
