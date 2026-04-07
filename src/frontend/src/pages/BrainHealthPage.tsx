import { useCosts, useBrainHealth, type CostData, type BrainHealthData } from '@/hooks/useBrainHealth'
import { ArrowLeft, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { api } from '@/lib/api'

function fmt(n: number): string {
  return Number(n).toLocaleString()
}

function fmtUsd(n: number): string {
  return '$' + Number(n).toFixed(2)
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'Just updated'
  return `Updated ${mins} min ago`
}

export function BrainHealthPage() {
  const navigate = useNavigate()
  const { data: costs, isLoading: costsLoading, error: costsError, refetch: refetchCosts } = useCosts()
  const { data: health, isLoading: healthLoading, error: healthError } = useBrainHealth()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      // Fetch with refresh=true to bust cache
      await api.admin.costs()
      await refetchCosts()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/chat')}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--border))] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="font-[Parkinsans] text-xl font-semibold text-[var(--text)]">Brain Health</h1>
              <p className="text-sm text-[var(--text-secondary)]">Cost monitoring & system health</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/admin')}
              className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              Admin
            </button>
          </div>
        </div>

        {/* Warning Banner */}
        {costs && !costs.error && costs.today.spend_usd > 5 && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertTriangle size={16} className="text-red-400" />
            <strong className="text-red-400">Warning:</strong> Today's spend exceeds $5.00
          </div>
        )}

        {/* Cost Section */}
        {costsLoading ? (
          <LoadingSkeleton label="Loading cost data..." />
        ) : costsError || costs?.error ? (
          <div className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-8 text-center text-sm italic text-[var(--text-secondary)]">
            {costs?.error || 'Failed to load cost data'}
          </div>
        ) : costs ? (
          <CostSection costs={costs} />
        ) : null}

        {/* Updated + Refresh */}
        {costs && !costs.error && (
          <div className="mb-8 mt-3 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <span>{costs.cached_at ? timeAgo(costs.cached_at) : '--'}</span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        )}

        {/* System Health Section */}
        <div className="mt-4 border-t border-[hsl(var(--border))] pt-6">
          <h2 className="mb-4 font-[Parkinsans] text-lg font-semibold text-[var(--text)]">System Health</h2>

          {healthLoading ? (
            <LoadingSkeleton label="Loading health data..." />
          ) : healthError ? (
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-6 text-center text-sm text-red-400">
              Failed to load health data
            </div>
          ) : health ? (
            <HealthSection health={health} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CostSection({ costs }: { costs: CostData }) {
  const maxSpend = Math.max(...costs.last_7_days.map(d => d.spend_usd), 0.01)

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Today's Spend */}
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Today's Spend</h3>
          <div className={`text-4xl font-bold tracking-tight ${costs.today.spend_usd > 5 ? 'text-red-400' : 'text-green-400'}`}>
            {fmtUsd(costs.today.spend_usd)}
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">{costs.today.date}</div>
        </div>

        {/* 7-Day Chart */}
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Last 7 Days</h3>
          <div className="flex h-28 items-end gap-2">
            {costs.last_7_days.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1" style={{ height: '100%', justifyContent: 'flex-end' }}>
                <span className="text-[10px] font-medium text-[var(--text)]">{fmtUsd(d.spend_usd)}</span>
                <div
                  className="w-full rounded-t bg-[var(--gold)]"
                  style={{ height: `${Math.max((d.spend_usd / maxSpend) * 100, 2)}%`, minHeight: 2 }}
                />
                <span className="text-[10px] text-[var(--text-tertiary)]">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Model Breakdown */}
      <div className="mb-4 rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Completions by Model (7 days)</h3>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Model</th>
              <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Requests</th>
              <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Input Tokens</th>
              <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Output Tokens</th>
            </tr>
          </thead>
          <tbody>
            {costs.by_model.length === 0 ? (
              <tr><td colSpan={4} className="py-3 text-center text-sm text-[var(--text-secondary)]">No completions data</td></tr>
            ) : (
              costs.by_model
                .sort((a, b) => b.requests - a.requests)
                .map((m) => (
                  <tr key={m.model} className="border-b border-[hsl(var(--border))] last:border-0">
                    <td className="py-2.5 text-sm text-[var(--text)]">{m.model}</td>
                    <td className="py-2.5 text-right text-sm tabular-nums text-[var(--text)]">{fmt(m.requests)}</td>
                    <td className="py-2.5 text-right text-sm tabular-nums text-[var(--text)]">{fmt(m.input_tokens)}</td>
                    <td className="py-2.5 text-right text-sm tabular-nums text-[var(--text)]">{fmt(m.output_tokens)}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {/* Embeddings + Images */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Embeddings (7 days)</h3>
          <div className="text-xl font-semibold text-[var(--text)]">{fmt(costs.embeddings.tokens)} tokens</div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">{fmt(costs.embeddings.requests)} requests</div>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Images (7 days)</h3>
          <div className="text-xl font-semibold text-[var(--text)]">{fmt(costs.images.count)} images</div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">{fmt(costs.images.requests)} requests</div>
        </div>
      </div>
    </>
  )
}

function HealthSection({ health }: { health: BrainHealthData }) {
  const mod = health.moderation || { total: 0, unscored: 0, flagged: 0, severe: 0 }

  return (
    <>
      {/* Metrics */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total Memories" value={fmt(mod.total)} />
        <MetricCard label="Unscored" value={fmt(mod.unscored)} />
        <MetricCard label="Flagged" value={fmt(mod.flagged)} color="text-amber-400" />
        <MetricCard label="Severe" value={fmt(mod.severe)} color="text-red-400" />
      </div>

      {/* Embedding Queue */}
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Embedding Queue</h3>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[hsl(var(--border))]">
              <th className="py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Status</th>
              <th className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Count</th>
            </tr>
          </thead>
          <tbody>
            {!health.embedding_queue?.length ? (
              <tr><td colSpan={2} className="py-3 text-center text-sm text-[var(--text-secondary)]">No data</td></tr>
            ) : (
              health.embedding_queue.map((r) => (
                <tr key={r.embedding_status} className="border-b border-[hsl(var(--border))] last:border-0">
                  <td className="py-2.5 text-sm text-[var(--text)]">{r.embedding_status || 'null'}</td>
                  <td className="py-2.5 text-right text-sm tabular-nums text-[var(--text)]">{fmt(parseInt(r.count))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-4">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{label}</div>
      <div className={`text-2xl font-bold ${color || 'text-[var(--text)]'}`}>{value}</div>
    </div>
  )
}

function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-12 text-sm text-[var(--text-secondary)]">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  )
}
