// Mobile variants: Home/Chat, Memory browser, and generic wrappers for other screens

import { useState } from 'react';
import { useTheme, RUHI_DARK, RUHI_FONTS } from './tokens';
import type { RuhiTheme } from './tokens';
import {
  RuhiButton,
  RuhiInput,
  AccessBadge,
  UserAvatar,
  BrandDot,
  HashtagChip,
  EmptyIllustration,
  RuhiMark,
  RuhiAvatar,
} from './components';
import { IconButton, Message } from './chat';
import { MemoryCard } from './screens-b';
import { BrandRow } from './screens-c';
import { RuhiIcon as Icon, type IconName } from './icons';
import {
  BRANDS,
  MEMORIES_FULL,
  SUGGESTED_PROMPTS,
  CHAT_TRANSCRIPT,
} from './data';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MobileStatusTopBarProps {
  t: RuhiTheme;
  title: string;
  back?: boolean;
  right?: React.ReactNode;
}

interface MobileBottomNavProps {
  t: RuhiTheme;
  active?: string;
}

interface ThemeProps {
  t: RuhiTheme;
}

// ---------------------------------------------------------------------------
// MobileStatusTopBar
// ---------------------------------------------------------------------------

export function MobileStatusTopBar({ t, title, back = false, right }: MobileStatusTopBarProps) {
  return (
    <div style={{
      height: 52, padding: '0 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: `1px solid ${t.borderSubtle}`, background: t.bg,
    }}>
      {back ? (
        <button style={{ background: 'none', border: 'none', color: t.textSecondary, cursor: 'pointer', padding: 4 }}>
          <Icon name="chevronLeft" size={20}/>
        </button>
      ) : (
        <button style={{ background: 'none', border: 'none', color: t.textSecondary, cursor: 'pointer', padding: 4 }}>
          <Icon name="menu" size={18}/>
        </button>
      )}
      <div style={{ flex: 1, fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600, color: t.textPrimary }}>
        {title}
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileBottomNav
// ---------------------------------------------------------------------------

export function MobileBottomNav({ t, active = 'chat' }: MobileBottomNavProps) {
  const items: { id: string; icon: IconName; label: string }[] = [
    { id: 'chat', icon: 'chat', label: 'Chat' },
    { id: 'memory', icon: 'memory', label: 'Memory' },
    { id: 'brands', icon: 'brand', label: 'Brands' },
    { id: 'settings', icon: 'settings', label: 'More' },
  ];
  return (
    <div style={{
      height: 62, display: 'flex', alignItems: 'stretch',
      borderTop: `1px solid ${t.borderSubtle}`, background: t.bg,
    }}>
      {items.map(it => {
        const a = active === it.id;
        return (
          <div key={it.id} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 3,
            color: a ? t.textPrimary : t.textMuted, cursor: 'pointer',
          }}>
            <Icon name={it.icon} size={18} color="currentColor"/>
            <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 10, fontWeight: a ? 600 : 500 }}>{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_Splash
// ---------------------------------------------------------------------------

export function Mobile_Splash({ t }: ThemeProps) {
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 50% 48%, ${t.accent}${t === RUHI_DARK ? '18' : '22'}, transparent 60%)`,
      }}/>
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div style={{ fontFamily: RUHI_FONTS.display, fontSize: 68, fontWeight: 600, letterSpacing: -2, color: t.textPrimary, lineHeight: 1 }}>
          ruhi
        </div>
        <div style={{ height: 3, width: 80, background: t.accent, borderRadius: 2, margin: '16px auto 22px' }}/>
        <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textSecondary, padding: '0 32px' }}>
          Commerce Intelligence, for people who decide.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_SignIn
// ---------------------------------------------------------------------------

export function Mobile_SignIn({ t }: ThemeProps) {
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg, padding: 20,
      display: 'flex', flexDirection: 'column' }}>
      <div style={{ paddingTop: 24 }}>
        <RuhiMark t={t} size={20}/>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{
          fontFamily: RUHI_FONTS.display, fontSize: 24, fontWeight: 600,
          color: t.textPrimary, letterSpacing: -0.4, marginBottom: 4,
        }}>Welcome back</div>
        <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textSecondary, marginBottom: 24 }}>
          Sign in to your workspace
        </div>
        <RuhiInput t={t} label="Work email" value="amira.khalil@meridianbank.com" icon="user" size="md"/>
        <div style={{ height: 12 }}/>
        <RuhiInput t={t} label="Password" value="••••••••" type="password" icon="lock" size="md"/>
        <div style={{ height: 20 }}/>
        <RuhiButton t={t} variant="primary" size="md" full>Sign in</RuhiButton>
        <div style={{ height: 10 }}/>
        <RuhiButton t={t} variant="secondary" size="md" full icon="shield">Continue with SSO</RuhiButton>
      </div>
      <div style={{ padding: '16px 4px', fontFamily: RUHI_FONTS.body, fontSize: 10.5, color: t.textMuted, textAlign: 'center' }}>
        SOC 2 · ISO 27001 · GDPR · DORA ready
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_Home
// ---------------------------------------------------------------------------

export function Mobile_Home({ t }: ThemeProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <MobileStatusTopBar t={t} title="Treasury review"
        right={<div style={{ display: 'flex', gap: 4 }}>
          <IconButton t={t} icon="bell" dot/>
          <UserAvatar t={t} initials="AK" size={28} color="#5B6BFF"/>
        </div>}/>
      <div style={{
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
        background: t.surface, borderBottom: `1px solid ${t.borderSubtle}`,
      }}>
        <BrandDot color="#0A4D8C"/>
        <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12.5, fontWeight: 600, color: t.textPrimary, flex: 1 }}>
          Meridian Bank
        </div>
        <Icon name="chevronDown" size={12} color={t.textMuted}/>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px' }}>
        {CHAT_TRANSCRIPT.slice(0, 4).map((m, i) => (
          <div key={i}>
            <Message t={t} m={m} idx={i}/>
            {m.role === 'agent' && m.citations && (
              <div style={{ padding: '0 0 10px 44px' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 999,
                  background: t.accentMutedBg, color: t.accentMutedText,
                  border: `1px solid ${t.accent}30`,
                  fontFamily: RUHI_FONTS.body, fontSize: 12, fontWeight: 500,
                  cursor: 'pointer',
                }}
                onClick={() => setExpanded(i === expanded ? null : i)}>
                  <Icon name="database" size={11}/>
                  View sources ({m.citations.length})
                  <Icon name="chevronRight" size={11}/>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* composer */}
      <div style={{ padding: '8px 14px 6px', borderTop: `1px solid ${t.borderSubtle}`, background: t.bg }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflow: 'auto' }}>
          {SUGGESTED_PROMPTS.slice(0, 3).map((p, i) => (
            <div key={i} style={{
              flexShrink: 0, padding: '6px 12px',
              background: t.surface, border: `1px solid ${t.borderSubtle}`,
              borderRadius: 999,
              fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textSecondary,
            }}>{p.label}</div>
          ))}
        </div>
        <div style={{
          background: t.surface, border: `1px solid ${t.borderSubtle}`,
          borderRadius: 12, padding: 10, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="paperclip" size={16} color={t.textMuted}/>
          <div style={{ flex: 1, fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textMuted }}>
            Ask Ruhi...
          </div>
          <Icon name="mic" size={16} color={t.textMuted}/>
          <button style={{
            width: 32, height: 32, borderRadius: 10, background: t.accent, border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="send" size={14} color="#0A0A0A"/>
          </button>
        </div>
      </div>
      <MobileBottomNav t={t} active="chat"/>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_Memory
// ---------------------------------------------------------------------------

export function Mobile_Memory({ t }: ThemeProps) {
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <MobileStatusTopBar t={t} title="Memory"/>
      <div style={{ padding: '12px 16px 8px' }}>
        <RuhiInput t={t} placeholder="Search memories..." icon="search" size="md"/>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, overflow: 'auto' }}>
          {['All','Private','Management','Internal','Advisor'].map((c, i) => (
            <div key={c} style={{
              flexShrink: 0, padding: '6px 12px', borderRadius: 999,
              border: `1px solid ${i === 0 ? t.accent : t.borderSubtle}`,
              background: i === 0 ? t.accentMutedBg : 'transparent',
              color: i === 0 ? t.accentMutedText : t.textSecondary,
              fontFamily: RUHI_FONTS.body, fontSize: 11.5, fontWeight: 500,
            }}>{c}</div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 16px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MEMORIES_FULL.slice(0, 6).map(m => <MemoryCard key={m.id} t={t} m={m}/>)}
        </div>
      </div>
      <MobileBottomNav t={t} active="memory"/>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_MemoryDetail
// ---------------------------------------------------------------------------

export function Mobile_MemoryDetail({ t }: ThemeProps) {
  const m = MEMORIES_FULL[1];
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <MobileStatusTopBar t={t} title="Memory" back/>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px 20px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <AccessBadge t={t} level={m.access} size="sm"/>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 999,
            border: `1px solid ${t.borderSubtle}`,
            fontFamily: RUHI_FONTS.body, fontSize: 10.5, color: t.textMuted,
          }}>
            <Icon name="lock" size={10}/>3 viewers
          </div>
        </div>
        <div style={{
          fontFamily: RUHI_FONTS.display, fontSize: 22, fontWeight: 600,
          color: t.textPrimary, letterSpacing: -0.4, lineHeight: 1.25, marginBottom: 12,
        }}>{m.title}</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 18 }}>
          {m.tags.map((tag, i) => <HashtagChip key={i} t={t} label={tag}/>)}
        </div>
        <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 14, color: t.textPrimary, lineHeight: 1.65 }}>
          First borrower breach of the early-warning ratio on 14 April 2026. Relationship manager Priya Chen filed the notice at 08:12 GMT after the Q1 covenant review.
          <div style={{
            padding: '12px 14px', marginTop: 14, borderLeft: `2px solid ${t.accent}`,
            background: t.accentMutedBg, fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, fontSize: 11, color: t.accentMutedText, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
              RM note · Priya Chen
            </div>
            Not material yet. CFO requested 30-day extension on working-capital facility.
          </div>
        </div>
      </div>
      <MobileBottomNav t={t} active="memory"/>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_Brands
// ---------------------------------------------------------------------------

export function Mobile_Brands({ t }: ThemeProps) {
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <MobileStatusTopBar t={t} title="Brands"/>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {BRANDS.map(b => <BrandRow key={b.id} t={t} b={b}/>)}
      </div>
      <MobileBottomNav t={t} active="brands"/>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_Knowledge
// ---------------------------------------------------------------------------

export function Mobile_Knowledge({ t }: ThemeProps) {
  const clusters = [
    { name: 'Credit risk', count: 42, color: '#5B6BFF' },
    { name: 'Treasury & FX', count: 28, color: '#FFC01C' },
    { name: 'Compliance', count: 31, color: '#2F7D3F' },
    { name: 'Client relationships', count: 19, color: '#B35C00' },
    { name: 'Portfolio', count: 34, color: '#8C0A3F' },
  ];
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <MobileStatusTopBar t={t} title="Knowledge"/>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clusters.map((c, i) => (
          <div key={i} style={{
            padding: 16, background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: `${c.color}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="hash" size={16} color={c.color}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600, color: t.textPrimary }}>
                {c.name}
              </div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted, marginTop: 1 }}>
                {c.count} memories
              </div>
            </div>
            <Icon name="chevronRight" size={14} color={t.textMuted}/>
          </div>
        ))}
      </div>
      <MobileBottomNav t={t} active="memory"/>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_Insights
// ---------------------------------------------------------------------------

export function Mobile_Insights({ t }: ThemeProps) {
  const rows: [string, string, string, string, number][] = [
    ['06:43', '#0A4D8C', 'Meridian', 'Treasury exposure for CRO', 5],
    ['06:12', '#0A4D8C', 'Meridian', 'Keyline Q1 breach policy', 2],
    ['Yest', '#8C0A3F', 'Helix', 'Q2 rebalance risk view', 2],
    ['Yest', '#2F7D3F', 'Floret', 'March cohort reorder', 1],
    ['Mon', '#4A3B8C', 'Cartograph', 'Supplier concentration', 1],
  ];
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <MobileStatusTopBar t={t} title="Insights"/>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px 16px' }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            padding: '14px 14px',
            borderBottom: `1px solid ${t.borderSubtle}`,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <BrandDot color={r[1]} size={10}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textMuted, marginBottom: 2 }}>
                {r[0]} · {r[2]}
              </div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13.5, color: t.textPrimary, marginBottom: 6 }}>
                {r[3]}
              </div>
              <div style={{ fontFamily: RUHI_FONTS.mono, fontSize: 11, color: t.textSecondary,
                display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="database" size={10} color={t.textSecondary}/>{r[4]} memories recalled
              </div>
            </div>
          </div>
        ))}
      </div>
      <MobileBottomNav t={t} active="chat"/>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_Settings
// ---------------------------------------------------------------------------

export function Mobile_Settings({ t }: ThemeProps) {
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <MobileStatusTopBar t={t} title="Settings"/>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 14px 24px' }}>
        <div style={{
          padding: 14, background: t.surface, border: `1px solid ${t.borderSubtle}`,
          borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        }}>
          <UserAvatar t={t} initials="AK" size={44} color="#5B6BFF"/>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600, color: t.textPrimary }}>
              Amira Khalil
            </div>
            <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted }}>
              Chief Risk Officer
            </div>
          </div>
          <Icon name="chevronRight" size={14} color={t.textMuted}/>
        </div>

        {([
          ['Access levels', 'Private, Management, Internal, Advisor, Public', 'shield'],
          ['Appearance', t === RUHI_DARK ? 'Dark' : 'Light', t === RUHI_DARK ? 'moon' : 'sun'],
          ['Notifications', '3 enabled', 'bell'],
          ['Release channel', 'ruhi · regulated', 'shieldCheck'],
          ['API and integrations', 'Webhooks, SCIM', 'link'],
        ] as [string, string, IconName][]).map(([lbl, sub, icon], i) => (
          <div key={i} style={{
            padding: '14px 14px', background: t.surface,
            border: `1px solid ${t.borderSubtle}`, borderTop: i === 0 ? `1px solid ${t.borderSubtle}` : 'none',
            borderRadius: i === 0 ? '12px 12px 0 0' : i === 4 ? '0 0 12px 12px' : 0,
            display: 'flex', alignItems: 'center', gap: 12,
            borderBottomWidth: i === 4 ? 1 : 0,
            marginTop: i === 0 ? 0 : -1,
          }}>
            <Icon name={icon} size={16} color={t.textSecondary}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13.5, fontWeight: 500, color: t.textPrimary }}>{lbl}</div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted }}>{sub}</div>
            </div>
            <Icon name="chevronRight" size={14} color={t.textMuted}/>
          </div>
        ))}

        <div style={{ height: 20 }}/>
        <div style={{
          padding: 14, background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 12,
          color: t.danger, cursor: 'pointer',
        }}>
          <Icon name="logout" size={16} color="currentColor"/>
          <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13.5, fontWeight: 500 }}>Sign out</div>
        </div>
      </div>
      <MobileBottomNav t={t} active="settings"/>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_BrandDetail
// ---------------------------------------------------------------------------

export function Mobile_BrandDetail({ t }: ThemeProps) {
  const b = BRANDS[0];
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <MobileStatusTopBar t={t} title="Brand" back/>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '20px 16px 16px' }}>
          <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: b.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontFamily: RUHI_FONTS.display, fontSize: 22, fontWeight: 600,
            }}>{b.initial}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: RUHI_FONTS.display, fontSize: 20, fontWeight: 600, color: t.textPrimary, letterSpacing: -0.3 }}>
                {b.name}
              </div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textMuted }}>{b.industry}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {([['Memories','164'],['Agents','3'],['Last active','2 min'],['Access used','5/6']] as [string, string][]).map(([k,v], i) => (
              <div key={i} style={{ padding: 12, background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 10 }}>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 10.5, color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3 }}>{k}</div>
                <div style={{ fontFamily: RUHI_FONTS.display, fontSize: 18, fontWeight: 600, color: t.textPrimary }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <MobileBottomNav t={t} active="brands"/>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_Admin
// ---------------------------------------------------------------------------

export function Mobile_Admin({ t }: ThemeProps) {
  const users: [string, string, string, string, string][] = [
    ['AK', 'Amira Khalil', '#5B6BFF', 'Admin', '2 min'],
    ['DN', 'David Ng', '#2F7D3F', 'Compliance', '18 min'],
    ['PC', 'Priya Chen', '#B35C00', 'Credit RM', '1 h'],
    ['MR', 'Miles Rey', '#8C0A3F', 'Advisor', 'Yest'],
    ['TO', 'Tariq Osei', '#4A3B8C', 'Ops Lead', '3 days'],
  ];
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <MobileStatusTopBar t={t} title="Access" back
        right={<button style={{ width: 28, height: 28, borderRadius: 8, background: t.accent, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={14} color="#0A0A0A"/>
        </button>}/>
      <div style={{ padding: '10px 14px', fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
        letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>
        6 people in workspace
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 14px 14px' }}>
        {users.map((u, i) => (
          <div key={i} style={{
            padding: 14, background: t.surface, border: `1px solid ${t.borderSubtle}`,
            borderRadius: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <UserAvatar t={t} initials={u[0]} size={36} color={u[2]}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{u[1]}</div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted }}>{u[3]} · {u[4]}</div>
            </div>
            <Icon name="chevronRight" size={14} color={t.textMuted}/>
          </div>
        ))}
      </div>
      <MobileBottomNav t={t} active="settings"/>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile_Empty
// ---------------------------------------------------------------------------

export function Mobile_Empty({ t }: ThemeProps) {
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <MobileStatusTopBar t={t} title="Memory"/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 12 }}>
        <EmptyIllustration t={t} size={140}/>
        <div style={{ fontFamily: RUHI_FONTS.display, fontSize: 20, fontWeight: 600, color: t.textPrimary, marginTop: 8 }}>
          Nothing to recall yet.
        </div>
        <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textSecondary, maxWidth: 280 }}>
          Memories will appear here as you work with Ruhi across your brands.
        </div>
        <div style={{ marginTop: 10 }}>
          <RuhiButton t={t} variant="primary" size="md">Create a memory</RuhiButton>
        </div>
      </div>
      <MobileBottomNav t={t} active="memory"/>
    </div>
  );
}
