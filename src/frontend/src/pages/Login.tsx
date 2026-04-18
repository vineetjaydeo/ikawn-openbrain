import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

export default function Login() {
  const navigate = useNavigate()
  const { login, isLoggingIn, loginError, isAuthenticated, isLoading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // If already authenticated, redirect to chat
  if (!isLoading && isAuthenticated) {
    navigate({ to: '/chat' })
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await login({ email, password })
      navigate({ to: '/chat' })
    } catch {
      // loginError is surfaced via the hook
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0A0A0A]">
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 600px 400px at 50% 40%, rgba(255, 192, 28, 0.04) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-[380px] px-6">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center">
          <span
            className="mb-4 text-5xl gold-glow"
            style={{ color: '#FFC01C' }}
            aria-hidden="true"
          >
            {'\u2726'}
          </span>
          <h1
            className="text-2xl font-semibold tracking-tight text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Sign in to Lucy
          </h1>
          <p className="mt-2 text-sm text-[#71717a]">
            Intelligence layer for your brand
          </p>
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error message */}
          {loginError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              {loginError.message || 'Authentication failed. Please try again.'}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-xs font-medium uppercase tracking-wider text-[#a1a1aa]"
            >
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-11 rounded-xl border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 text-sm text-white placeholder:text-[#52525b] focus-visible:border-[rgba(255,192,28,0.4)] focus-visible:ring-[rgba(255,192,28,0.1)]"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-medium uppercase tracking-wider text-[#a1a1aa]"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="h-11 rounded-xl border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 text-sm text-white placeholder:text-[#52525b] focus-visible:border-[rgba(255,192,28,0.4)] focus-visible:ring-[rgba(255,192,28,0.1)]"
            />
          </div>

          {/* Submit button - gold gradient */}
          <Button
            type="submit"
            disabled={isLoggingIn}
            className="h-11 w-full rounded-xl border-0 text-sm font-semibold text-[#0A0A0A] transition-all duration-200 hover:brightness-110 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #FFC01C 0%, #F59E0B 100%)',
            }}
          >
            {isLoggingIn ? 'Signing in...' : 'Sign in'}
          </Button>

          {/* SSO placeholder */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[rgba(255,255,255,0.06)]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#0A0A0A] px-3 text-xs text-[#52525b]">or</span>
            </div>
          </div>

          <Button
            type="button"
            disabled
            variant="outline"
            className="h-11 w-full rounded-xl border-[rgba(255,255,255,0.08)] bg-transparent text-sm text-[#52525b] hover:bg-transparent"
          >
            Enterprise SSO
          </Button>
        </form>

        {/* Footer */}
        <p className="mt-10 text-center text-xs text-[#3f3f46]">
          Powered by iKawn
        </p>
      </div>
    </div>
  )
}
