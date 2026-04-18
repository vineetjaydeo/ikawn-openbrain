import { useEffect } from 'react'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { UserLayout } from '@/components/layout/UserLayout'
import { useAuth } from '@/hooks/useAuth'

export default function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [isLoading, isAuthenticated, navigate])

  // Show nothing while checking auth
  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0A0A0A]">
        <span
          className="text-4xl gold-glow"
          style={{ color: '#FFC01C' }}
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
    <UserLayout>
      <Outlet />
    </UserLayout>
  )
}
