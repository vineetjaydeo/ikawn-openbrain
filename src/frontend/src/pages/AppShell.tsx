import { useState, useEffect, useCallback } from 'react'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { ThemeContext, RUHI_DARK, RUHI_LIGHT } from '@/design/tokens'
import type { RuhiTheme } from '@/design/tokens'
import { useAuth } from '@/hooks/useAuth'

type ThemeMode = 'dark' | 'light'

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem('ruhi-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return 'dark'
}

export default function AppShell() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme)

  const theme: RuhiTheme = themeMode === 'dark' ? RUHI_DARK : RUHI_LIGHT

  const toggleTheme = useCallback(() => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('ruhi-theme', next)
      return next
    })
  }, [])

  // Apply background color to document based on theme
  useEffect(() => {
    document.documentElement.style.background = theme.bg
  }, [theme.bg])

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [isLoading, isAuthenticated, navigate])

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100dvh',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0A0A',
        }}
      >
        <span
          style={{ fontSize: 36, color: '#FFC01C' }}
          className="gold-glow"
          aria-hidden="true"
        >
          {'\u2726'}
        </span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <ThemeContext.Provider value={theme}>
      <Outlet />
    </ThemeContext.Provider>
  )
}
