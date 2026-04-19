import { useNavigate } from '@tanstack/react-router'
import { useTheme } from '@/design/tokens'
import { Screen_MemoryDetail } from '@/design/screens-b'

export default function MemoryDetailPage() {
  const t = useTheme()
  const navigate = useNavigate()

  const handleNavigate = (screen: string) => {
    const routes: Record<string, string> = {
      chat: '/chat', memory: '/memory', vault: '/vault',
      tasks: '/tasks', settings: '/settings', admin: '/admin',
    }
    navigate({ to: routes[screen] || '/chat' })
  }

  return (
    <Screen_MemoryDetail
      t={t}
      onNavigate={handleNavigate}
    />
  )
}
