import { useNavigate } from '@tanstack/react-router'
import { useTheme } from '@/design/tokens'
import { Screen_BrandDetail } from '@/design/screens-c'

export default function BrandsPage() {
  const t = useTheme()
  const navigate = useNavigate()

  return (
    <Screen_BrandDetail
      t={t}
      onNavigate={(path: string) => navigate({ to: path })}
    />
  )
}
