import { useNavigate } from '@tanstack/react-router'
import { useTheme, RUHI_FONTS } from '@/design/tokens'
import { LeftRail } from '@/design/chat'
import { RuhiIcon } from '@/design/icons'

export default function VaultPage() {
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
    <div style={{ width: '100%', height: '100%', display: 'flex', background: t.bg }}>
      <LeftRail t={t} active="vault" onNavigate={handleNavigate} />
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
      }}>
        <RuhiIcon name="folder" size={48} color={t.textMuted} />
        <div style={{
          fontFamily: RUHI_FONTS.display, fontSize: 22, fontWeight: 600,
          color: t.textPrimary, letterSpacing: -0.3,
        }}>Vault</div>
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: 14, color: t.textSecondary,
          maxWidth: 360, textAlign: 'center', lineHeight: 1.6,
        }}>
          Your documents, uploads, and generated artifacts in one place.
        </div>
      </div>
    </div>
  )
}
