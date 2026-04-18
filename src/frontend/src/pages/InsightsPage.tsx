import { useNavigate } from '@tanstack/react-router'
import { useTheme } from '@/design/tokens'
import { Screen_Insights } from '@/design/screens-c'

export default function InsightsPage() {
  const t = useTheme()
  const navigate = useNavigate()

  return (
    <Screen_Insights
      t={t}
      onNavigate={(path: string) => navigate({ to: path })}
    />
  )
}
