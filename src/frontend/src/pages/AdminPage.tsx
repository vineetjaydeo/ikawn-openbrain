import { useNavigate } from '@tanstack/react-router'
import { useTheme } from '@/design/tokens'
import { Screen_Admin } from '@/design/screens-d'

export default function AdminPage() {
  const t = useTheme()
  const navigate = useNavigate()

  return (
    <Screen_Admin
      t={t}
      onNavigate={(path: string) => navigate({ to: path })}
    />
  )
}
