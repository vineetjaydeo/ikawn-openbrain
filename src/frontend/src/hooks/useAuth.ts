import { useState, useEffect, useCallback } from 'react'

export interface User {
  id: number
  email: string
  name: string
  role: string
  status: string
}

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function checkAuth() {
      try {
        const res = await fetch('/auth/me')
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setUser(data)
        } else {
          if (!cancelled) setUser(null)
        }
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    checkAuth()
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setUser(data.user)
        return { ok: true }
      }
      return { ok: false, error: data.error || 'Login failed' }
    } catch {
      return { ok: false, error: 'Network error' }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }, [])

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  }
}

/** Derive initials from a user's name */
export function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
