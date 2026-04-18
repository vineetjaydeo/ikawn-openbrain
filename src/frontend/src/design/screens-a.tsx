// Screens: Splash, Sign In, Home/Chat, Empty States

import React from 'react';
import { type RuhiTheme, RUHI_DARK, RUHI_LIGHT, RUHI_FONTS } from './tokens';
import {
  RuhiMark,
  RuhiButton,
  RuhiInput,
  EmptyIllustration,
} from './components';
import {
  IKawnFooter,
  SpacetimeGrid,
  DiffuseGradient,
  DotGrid,
} from './backdrop';
import { RuhiIcon } from './icons';
import { CHAT_TRANSCRIPT, MEMORY_RECALL } from './data';
import { LeftRail, ChatHeader, Message, Composer, MemoryRecallRail } from './chat';

// ---- Types ----

export interface ScreenSplashProps {
  t: RuhiTheme;
}

export interface ScreenSignInProps {
  t: RuhiTheme;
  error?: boolean;
}

export interface ScreenHomeProps {
  t: RuhiTheme;
  onToggleTheme?: () => void;
  theme?: string;
  onNavigate?: (screen: string) => void;
}

export interface ScreenEmptyStatesProps {
  t: RuhiTheme;
}

// ---- Splash ----

export function Screen_Splash({ t }: ScreenSplashProps) {
  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      <SpacetimeGrid t={t} opacity={0.9}/>
      <DiffuseGradient t={t} variant="center" opacity={1}/>
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div style={{
          fontFamily: RUHI_FONTS.display,
          fontSize: 108, fontWeight: 600, letterSpacing: -3,
          color: t.textPrimary, lineHeight: 1,
        }}>ruhi</div>
        <div style={{
          height: 4, width: 120, background: t.accent, borderRadius: 2,
          margin: '22px auto 32px',
        }}/>
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: 17,
          color: t.textSecondary, letterSpacing: 0.2,
        }}>Commerce Intelligence, for people who decide.</div>
        <div style={{ marginTop: 36, display: 'flex', justifyContent: 'center' }}>
          <IKawnFooter t={t}/>
        </div>
      </div>
      <div style={{
        position: 'absolute', bottom: 28, left: 0, right: 0,
        textAlign: 'center', fontFamily: RUHI_FONTS.body, fontSize: 11,
        color: t.textMuted, letterSpacing: 0.4,
      }}>v3.1 . regulated release channel</div>
    </div>
  );
}

// ---- Sign In ----

export function Screen_SignIn({ t, error = false }: ScreenSignInProps) {
  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg,
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
          background: t === RUHI_DARK ? t.surface : t.elevated,
          border: `1px solid ${t.borderSubtle}`,
          borderRadius: 16,
          boxShadow: t === RUHI_LIGHT ? '0 1px 2px rgba(0,0,0,0.04), 0 12px 40px rgba(60,50,20,0.06)' : 'none',
        }}>
          <div style={{
            fontFamily: RUHI_FONTS.display, fontSize: 28, fontWeight: 600,
            color: t.textPrimary, letterSpacing: -0.6, marginBottom: 6,
          }}>Welcome back</div>
          <div style={{
            fontFamily: RUHI_FONTS.body, fontSize: 13.5, color: t.textSecondary,
            marginBottom: 28,
          }}>Sign in to your workspace</div>

          <RuhiInput t={t} label="Work email" value="amira.khalil@meridianbank.com" icon="user" size="lg" state="default"/>
          <div style={{ height: 14 }}/>
          <RuhiInput t={t} label="Password" value="*************" type="password" icon="lock" size="lg"
                     state={error ? 'error' : 'default'}
                     error={error ? 'Incorrect email or password. Try again or use SSO.' : undefined}/>

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
            <a style={{
              fontFamily: RUHI_FONTS.body, fontSize: 12.5,
              color: t.accentMutedText, textDecoration: 'none',
            }}>Forgot password?</a>
          </div>

          <RuhiButton t={t} variant="primary" size="lg" full>Sign in</RuhiButton>
          <div style={{ height: 10 }}/>
          <RuhiButton t={t} variant="secondary" size="lg" full icon="shield">Continue with SSO</RuhiButton>

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
  );
}

// ---- Home / Chat ----

export function Screen_Home({ t, onToggleTheme, theme, onNavigate }: ScreenHomeProps) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: t.bg }}>
      <LeftRail t={t} active="chat" onNavigate={onNavigate}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <ChatHeader t={t} onToggleTheme={onToggleTheme} theme={theme}/>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px 8px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ maxWidth: 760, width: '100%', margin: '0 auto', flex: 1 }}>
            {/* day divider */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 0 16px',
            }}>
              <div style={{ flex: 1, height: 1, background: t.borderSubtle }}/>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted, letterSpacing: 0.4 }}>
                Today . 18 April
              </div>
              <div style={{ flex: 1, height: 1, background: t.borderSubtle }}/>
            </div>
            {CHAT_TRANSCRIPT.map((m, i) => <Message key={i} t={t} m={m} idx={i}/>)}
          </div>
        </div>
        <Composer t={t}/>
      </div>
      <MemoryRecallRail t={t} items={MEMORY_RECALL}/>
    </div>
  );
}

// ---- Empty States ----

export function Screen_EmptyStates({ t }: ScreenEmptyStatesProps) {
  const variants = [
    { heading: 'Nothing to recall yet.', sub: 'Memories will appear here as you work with Ruhi across your brands.', cta: 'Create a memory' },
    { heading: 'Start your first conversation.', sub: 'Ask Ruhi about exposure, compliance, or any brand in your workspace.', cta: 'Open chat' },
    { heading: 'Add your first brand.', sub: 'Connect a brand to give Ruhi its working context. You can add more later.', cta: 'Add brand' },
    { heading: 'Nothing matches that search.', sub: 'Try a different hashtag, a broader query, or remove a filter.', cta: 'Clear filters' },
  ];
  return (
    <div style={{
      width: '100%', height: '100%', background: t.bg, padding: '40px 48px',
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignContent: 'start',
    }}>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{
          fontFamily: RUHI_FONTS.display, fontSize: 26, fontWeight: 600,
          color: t.textPrimary, letterSpacing: -0.4,
        }}>Empty states</div>
        <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textMuted }}>
          4 variants . shared pattern
        </div>
      </div>
      {variants.map((v, i) => (
        <div key={i} style={{
          padding: '36px 28px', background: t.surface,
          border: `1px solid ${t.borderSubtle}`, borderRadius: 12,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          textAlign: 'center', minHeight: 260,
        }}>
          <EmptyIllustration t={t} size={140}/>
          <div style={{
            marginTop: 6,
            fontFamily: RUHI_FONTS.display, fontSize: 18, fontWeight: 600,
            color: t.textPrimary, letterSpacing: -0.2,
          }}>{v.heading}</div>
          <div style={{
            fontFamily: RUHI_FONTS.body, fontSize: 13.5, color: t.textSecondary,
            maxWidth: 340, lineHeight: 1.55,
          }}>{v.sub}</div>
          <div style={{ marginTop: 6 }}>
            <RuhiButton t={t} variant="primary" size="md">{v.cta}</RuhiButton>
          </div>
        </div>
      ))}
    </div>
  );
}
