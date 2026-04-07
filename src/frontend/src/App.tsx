import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/components/auth/LoginPage'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { ChatPage } from '@/pages/ChatPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AdminPage } from '@/pages/AdminPage'
import { BrainHealthPage } from '@/pages/BrainHealthPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { MissionPage } from '@/pages/MissionPage'
import { SharedPage } from '@/pages/SharedPage'

function LoadingScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[hsl(var(--background))]">
      <span className="text-3xl text-[var(--gold)] animate-pulse">{'\u2726'}</span>
    </div>
  )
}

function AuthenticatedRoutes() {
  const { user, logout } = useAuth()

  return (
    <AppShell user={user} onLogout={logout}>
      <ErrorBoundary>
        <Routes>
          <Route path="/chat/:id" element={<ChatPage user={user} />} />
          <Route path="/chat" element={<ChatPage user={user} />} />
          <Route path="/mission" element={<MissionPage user={user} />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route path="/admin/brain-health" element={<BrainHealthPage />} />
          <Route path="/admin" element={<AdminPage user={user} />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  )
}

export function App() {
  const { isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <Routes>
      {/* Public routes — outside AppShell */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/chat" replace /> : <LoginPage />}
      />
      <Route path="/shared/:token" element={<SharedPage />} />

      {/* Protected routes — inside AppShell */}
      <Route
        path="/*"
        element={isAuthenticated ? <AuthenticatedRoutes /> : <Navigate to="/login" replace />}
      />
    </Routes>
  )
}
