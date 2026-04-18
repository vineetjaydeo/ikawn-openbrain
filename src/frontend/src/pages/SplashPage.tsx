import { useTheme } from '@/design/tokens'
import { Screen_Splash } from '@/design/screens-a'

export default function SplashPage() {
  const t = useTheme()
  return <Screen_Splash t={t} />
}
