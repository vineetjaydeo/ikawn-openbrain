import { useNavigate } from '@tanstack/react-router'
import { useTheme } from '@/design/tokens'
import { Screen_MemoryDetail } from '@/design/screens-b'

export default function MemoryDetailPage() {
  const t = useTheme()
  const navigate = useNavigate()

  return (
    <Screen_MemoryDetail
      t={t}
      onNavigate={(path: string) => navigate({ to: path })}
    />
  )
}
