import { useNavigate } from '@tanstack/react-router'
import { useTheme } from '@/design/tokens'
import { Screen_MemoryBrowser } from '@/design/screens-b'

export default function MemoryBrowser() {
  const t = useTheme()
  const navigate = useNavigate()

  return (
    <Screen_MemoryBrowser
      t={t}
      onNavigate={(screen: string) => {
        const routes: Record<string, string> = {
          chat: '/chat',
          memory: '/memory',
          vault: '/vault',
          tasks: '/tasks',
          settings: '/settings',
          admin: '/admin',
        }
        navigate({ to: routes[screen] || '/chat' })
      }}
    />
  )
}
