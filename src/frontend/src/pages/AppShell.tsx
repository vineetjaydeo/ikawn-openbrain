import React, { useState, useEffect, useCallback, useContext } from 'react'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { ThemeContext, RUHI_DARK, RUHI_LIGHT } from '@/design/tokens'
import type { RuhiTheme } from '@/design/tokens'
import { useAuth } from '@/hooks/useAuth'
import { UserLayout } from '@/components/layout/UserLayout'

type ThemeMode = 'dark' | 'light'

// Context for theme mode control (separate from ThemeContext which provides design tokens)
export const ThemeModeContext = React.createContext<{
  mode: ThemeMode
  toggle: () => void
}>({ mode: 'dark', toggle: () => {} })

export function useThemeMode() {
  return useContext(ThemeModeContext)
}

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

  // Apply background color and dark class to document based on theme
  useEffect(() => {
    document.documentElement.style.background = theme.bg
    document.documentElement.classList.toggle('dark', themeMode === 'dark')
  }, [theme.bg, themeMode])

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
    <ThemeModeContext.Provider value={{ mode: themeMode, toggle: toggleTheme }}>
      <ThemeContext.Provider value={theme}>
        <UserLayout>
          <Outlet />
        </UserLayout>
      </ThemeContext.Provider>
    </ThemeModeContext.Provider>
  )
}
