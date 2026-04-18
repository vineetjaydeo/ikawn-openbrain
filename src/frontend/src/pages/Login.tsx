import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { RUHI_DARK, RUHI_FONTS } from '@/design/tokens'
import { RuhiMark } from '@/design/components'
import { RuhiIcon } from '@/design/icons'
import { DotGrid, DiffuseGradient, IKawnFooter } from '@/design/backdrop'

export default function Login() {
  const navigate = useNavigate()
  const { login, isLoggingIn, loginError, isAuthenticated, isLoading } = useAuth()
  const t = RUHI_DARK

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // If already authenticated, redirect to chat
  if (!isLoading && isAuthenticated) {
    navigate({ to: '/chat' })
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await login({ email, password })
      navigate({ to: '/chat' })
    } catch {
      // loginError is surfaced via the hook
    }
  }

  const hasError = !!loginError

  const inputStyle = {
    height: 52,
    width: '100%',
    padding: '0 16px 0 42px',
    fontFamily: RUHI_FONTS.body,
    fontSize: 15,
    color: t.textPrimary,
    background: t.surface,
    border: `1px solid ${hasError ? t.danger : t.borderSubtle}`,
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{
      width: '100%', height: '100dvh', background: t.bg,
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      <DotGrid t={t} opacity={0.6}/>
      <DiffuseGradient t={t} variant="topLeft" opacity={0.9}/>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* top nav */}
        <div style={{
          height: 64, padding: '0 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <RuhiMark t={t} size={22}/>
          <div style={{
            fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textMuted,
          }}>Need access? <span style={{ color: t.textPrimary, fontWeight: 500 }}>Contact your admin</span></div>
        </div>

        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 420, padding: 36,
            background: t.surface,
            border: `1px solid ${t.borderSubtle}`,
            borderRadius: 16,
          }}>
            <div style={{
              fontFamily: RUHI_FONTS.display, fontSize: 28, fontWeight: 600,
              color: t.textPrimary, letterSpacing: -0.6, marginBottom: 6,
            }}>Welcome back</div>
            <div style={{
              fontFamily: RUHI_FONTS.body, fontSize: 13.5, color: t.textSecondary,
              marginBottom: 28,
            }}>Sign in to your workspace</div>

            <form onSubmit={handleSubmit}>
              {hasError && (
                <div style={{
                  marginBottom: 16, padding: '10px 14px',
                  background: t.dangerBg, border: `1px solid ${t.dangerBorder}`,
                  borderRadius: 10, fontFamily: RUHI_FONTS.body, fontSize: 13,
                  color: t.danger,
                }}>
                  {loginError?.message || 'Incorrect email or password. Try again or use SSO.'}
                </div>
              )}

              {/* Email field */}
              <div>
                <div style={{
                  fontFamily: RUHI_FONTS.body, fontSize: 12, fontWeight: 500,
                  color: t.textSecondary, marginBottom: 6, letterSpacing: 0.2,
                }}>Work email</div>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                    color: t.textMuted, display: 'flex', alignItems: 'center',
                  }}>
                    <RuhiIcon name="user" size={16} />
                  </div>
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ height: 14 }}/>

              {/* Password field */}
              <div>
                <div style={{
                  fontFamily: RUHI_FONTS.body, fontSize: 12, fontWeight: 500,
                  color: t.textSecondary, marginBottom: 6, letterSpacing: 0.2,
                }}>Password</div>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                    color: t.textMuted, display: 'flex', alignItems: 'center',
                  }}>
                    <RuhiIcon name="lock" size={16} />
                  </div>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    style={{
                      ...inputStyle,
                      border: `1px solid ${hasError ? t.danger : t.borderSubtle}`,
                    }}
                  />
                </div>
                {hasError && (
                  <div style={{ color: t.danger, fontSize: 12, marginTop: 6, fontFamily: RUHI_FONTS.body }}>
                    Incorrect email or password. Try again or use SSO.
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 14, marginBottom: 22,
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${t.borderStrong}`,
                  }}/>
                  <span style={{ fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textSecondary }}>
                    Keep me signed in
                  </span>
                </label>
                <a href="#" style={{
                  fontFamily: RUHI_FONTS.body, fontSize: 12.5,
                  color: t.accentMutedText, textDecoration: 'none',
                }}>Forgot password?</a>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                style={{
                  height: 48, width: '100%', fontSize: 15,
                  fontFamily: RUHI_FONTS.body, fontWeight: 500,
                  background: t.accent, color: '#0A0A0A',
                  border: `1px solid ${t.accent}`, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: isLoggingIn ? 'wait' : 'pointer',
                  opacity: isLoggingIn ? 0.6 : 1,
                  transition: 'all .15s',
                  letterSpacing: 0.1,
                }}
              >
                {isLoggingIn ? 'Signing in...' : 'Sign in'}
              </button>
              <div style={{ height: 10 }}/>
              <button
                type="button"
                disabled
                style={{
                  height: 48, width: '100%', fontSize: 15,
                  fontFamily: RUHI_FONTS.body, fontWeight: 500,
                  background: 'transparent', color: t.textPrimary,
                  border: `1px solid ${t.borderStrong}`, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  cursor: 'not-allowed', opacity: 0.5,
                  letterSpacing: 0.1,
                }}
              >
                <RuhiIcon name="shield" size={17} color="currentColor"/>
                Continue with SSO
              </button>
            </form>

            <div style={{
              marginTop: 24, paddingTop: 20,
              borderTop: `1px solid ${t.borderSubtle}`,
              fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
              textAlign: 'center', lineHeight: 1.5,
            }}>
              By signing in you agree to the Ruhi MSA and the enterprise acceptable use policy for regulated workspaces.
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{
          padding: '22px 32px', fontFamily: RUHI_FONTS.body, fontSize: 11,
          color: t.textMuted, display: 'flex', gap: 24, justifyContent: 'center', alignItems: 'center',
        }}>
          <span>SOC 2 Type II</span>
          <span>ISO 27001</span>
          <span>GDPR</span>
          <span>DORA ready</span>
          <span style={{ width: 1, height: 12, background: t.borderSubtle }}/>
          <IKawnFooter t={t} variant="minimal"/>
        </div>
      </div>
    </div>
  )
}
