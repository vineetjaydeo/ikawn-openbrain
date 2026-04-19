import { useNavigate } from '@tanstack/react-router'
import { useTheme } from '@/design/tokens'
import { Screen_Settings } from '@/design/screens-d'

export default function Settings() {
  const t = useTheme()
  const navigate = useNavigate()

  return (
    <Screen_Settings
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
