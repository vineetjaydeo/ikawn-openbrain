import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(email, password)
    setLoading(false)
    if (result.ok) {
      navigate('/chat', { replace: true })
    } else {
      setError(result.error || 'Login failed')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <span className="text-4xl text-[var(--gold)]">{'\u2726'}</span>
          <h1
            className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]"
            style={{ fontFamily: "'Parkinsans', 'Google Sans', sans-serif" }}
          >
            Lucy
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-[var(--text-secondary)]">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@ikawn.com"
              autoComplete="email"
              required
              className="h-10 rounded-lg border border-[hsl(var(--border))] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-[var(--text-secondary)]">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
              className="h-10 rounded-lg border border-[hsl(var(--border))] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-10 rounded-lg bg-[var(--gold)] text-sm font-semibold text-[hsl(var(--background))] transition-colors hover:bg-[var(--gold-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
