import { useNavigate } from '@tanstack/react-router'
import { useTheme } from '@/design/tokens'
import { Screen_Knowledge } from '@/design/screens-c'

export default function KnowledgePage() {
  const t = useTheme()
  const navigate = useNavigate()

  return (
    <Screen_Knowledge
      t={t}
      onNavigate={(path: string) => navigate({ to: path })}
    />
  )
}
