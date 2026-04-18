// Screens: Brand Switcher, Brand Detail, Knowledge, Insights

import React, { useState } from 'react';
import { type RuhiTheme, RUHI_DARK, RUHI_LIGHT, RUHI_FONTS } from './tokens';
import {
  RuhiButton,
  AccessBadge,
  BrandDot,
  UserAvatar,
  type AccessLevel,
} from './components';
import { RuhiIcon } from './icons';
import { BRANDS, MEMORIES_FULL, type Brand } from './data';
import { LeftRail, IconButton } from './chat';

// ---- Types ----

export interface ScreenBrandSwitcherProps {
  t: RuhiTheme;
  onClose?: () => void;
}

export interface BrandRowProps {
  t: RuhiTheme;
  b: Brand;
}

export interface ScreenBrandDetailProps {
  t: RuhiTheme;
  onNavigate?: (screen: string) => void;
}

export interface BrandOverviewBodyProps {
  t: RuhiTheme;
}

export interface BrandKnowledgeBodyProps {
  t: RuhiTheme;
}

export interface BrandIntegrationsBodyProps {
  t: RuhiTheme;
}

export interface ScreenKnowledgeProps {
  t: RuhiTheme;
  onNavigate?: (screen: string) => void;
}

export interface ScreenInsightsProps {
  t: RuhiTheme;
  onNavigate?: (screen: string) => void;
}

// ---- Brand Switcher ----

export function Screen_BrandSwitcher({ t, onClose }: ScreenBrandSwitcherProps) {
  return (
    <div style={{ width: '100%', height: '100%', background: t.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', padding: 40,
    }}>
      {/* backdrop with faint chat pattern */}
      <div style={{ position: 'absolute', inset: 0, background: t === RUHI_DARK ? '#00000090' : '#1a1a1a20' }}/>

      <div style={{
        position: 'relative', width: 560, maxHeight: '100%',
        background: t === RUHI_DARK ? t.elevated : t.bg,
        border: `1px solid ${t.borderSubtle}`,
        borderRadius: 16,
        boxShadow: t === RUHI_LIGHT ? '0 16px 60px rgba(60,50,20,0.15)' : '0 20px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '22px 24px 18px', borderBottom: `1px solid ${t.borderSubtle}`,
          display: 'flex', alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontFamily: RUHI_FONTS.display, fontSize: 20, fontWeight: 600,
              color: t.textPrimary, letterSpacing: -0.3,
            }}>Switch brand context</div>
            <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>
              Ruhi only pulls memories and insights from the active brand.
            </div>
          </div>
          <div style={{ flex: 1 }}/>
          <IconButton t={t} icon="close" onClick={onClose}/>
        </div>

        <div style={{ padding: '8px 12px', overflow: 'auto' }}>
          <div style={{
            padding: '14px 14px 6px', fontFamily: RUHI_FONTS.body,
            fontSize: 10.5, fontWeight: 600, color: t.textMuted,
            textTransform: 'uppercase', letterSpacing: 0.8,
          }}>Recent</div>
          {BRANDS.slice(0, 2).map(b => <BrandRow key={b.id} t={t} b={b}/>)}

          <div style={{
            padding: '16px 14px 6px', fontFamily: RUHI_FONTS.body,
            fontSize: 10.5, fontWeight: 600, color: t.textMuted,
            textTransform: 'uppercase', letterSpacing: 0.8,
          }}>All brands</div>
          {BRANDS.map(b => <BrandRow key={b.id} t={t} b={b}/>)}

          <div style={{
            padding: '10px 14px', marginTop: 8,
            borderRadius: 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
            color: t.textSecondary,
            border: `1px dashed ${t.borderStrong}`,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: t.surface, border: `1px solid ${t.borderSubtle}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RuhiIcon name="plus" size={14} color={t.textSecondary}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13.5, fontWeight: 500, color: t.textPrimary }}>
                Add a brand
              </div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted, marginTop: 1 }}>
                Requires admin role
              </div>
            </div>
          </div>
        </div>

        <div style={{
          padding: '14px 20px', borderTop: `1px solid ${t.borderSubtle}`,
          fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <RuhiIcon name="lock" size={11}/>
          Access-level separation enforced across all brands
        </div>
      </div>
    </div>
  );
}

export function BrandRow({ t, b }: BrandRowProps) {
  return (
    <div style={{
      padding: '12px 14px', marginBottom: 2, borderRadius: 10, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 12,
      background: b.current ? t.surface : 'transparent',
      border: `1px solid ${b.current ? t.borderSubtle : 'transparent'}`,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: b.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontFamily: RUHI_FONTS.display, fontSize: 16, fontWeight: 600,
      }}>{b.initial}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13.5, fontWeight: 600, color: t.textPrimary }}>
          {b.name}
        </div>
        <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted, marginTop: 1 }}>
          {b.industry}
        </div>
      </div>
      {b.current ? (
        <div style={{
          padding: '3px 10px', borderRadius: 999,
          background: t.accentMutedBg, color: t.accentMutedText,
          fontFamily: RUHI_FONTS.body, fontSize: 11, fontWeight: 600,
          letterSpacing: 0.4, textTransform: 'uppercase',
          border: `1px solid ${t.accent}30`,
        }}>Current</div>
      ) : (
        <RuhiIcon name="chevronRight" size={14} color={t.textMuted}/>
      )}
    </div>
  );
}

// ---- Brand Detail ----

export function Screen_BrandDetail({ t, onNavigate }: ScreenBrandDetailProps) {
  const [tab, setTab] = useState('overview');
  const b = BRANDS[0];
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: t.bg }}>
      <LeftRail t={t} active="brands" onNavigate={onNavigate}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>
        {/* brand header */}
        <div style={{ padding: '28px 40px 0' }}>
          <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textMuted, marginBottom: 14 }}>
            Brands . {b.industry}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 22 }}>
            <div style={{
              width: 62, height: 62, borderRadius: 16, background: b.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontFamily: RUHI_FONTS.display, fontSize: 28, fontWeight: 600,
            }}>{b.initial}</div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: RUHI_FONTS.display, fontSize: 28, fontWeight: 600,
                color: t.textPrimary, letterSpacing: -0.5,
              }}>{b.name}</div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                {b.industry} . workspace owner: Amira Khalil
              </div>
            </div>
            <RuhiButton t={t} variant="secondary" size="md" icon="settings">Configure</RuhiButton>
            <RuhiButton t={t} variant="primary" size="md" icon="chat">Open chat</RuhiButton>
          </div>

          {/* stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24,
          }}>
            {([
              ['Memories', '164', '+12 this week'],
              ['Active agents', '3', 'Ruhi, Lucy, Compliance'],
              ['Last activity', '2 min ago', 'Amira Khalil'],
              ['Access levels in use', '5 of 6', 'Investor not granted'],
            ] as [string, string, string][]).map(([k, v, s], i) => (
              <div key={i} style={{
                padding: '14px 16px',
                background: t.surface, border: `1px solid ${t.borderSubtle}`,
                borderRadius: 12,
              }}>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted, marginBottom: 4, letterSpacing: 0.2 }}>
                  {k}
                </div>
                <div style={{
                  fontFamily: RUHI_FONTS.display, fontSize: 22, fontWeight: 600,
                  color: t.textPrimary, letterSpacing: -0.4, marginBottom: 2,
                }}>{v}</div>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted }}>{s}</div>
              </div>
            ))}
          </div>

          {/* tabs */}
          <div style={{ display: 'flex', gap: 24, borderBottom: `1px solid ${t.borderSubtle}` }}>
            {([['overview','Overview'],['knowledge','Knowledge'],['integrations','Integrations']] as [string, string][]).map(([id, lbl]) => (
              <div key={id} onClick={() => setTab(id)} style={{
                padding: '10px 0', cursor: 'pointer', position: 'relative',
                fontFamily: RUHI_FONTS.body, fontSize: 13.5,
                fontWeight: tab === id ? 600 : 500,
                color: tab === id ? t.textPrimary : t.textMuted,
              }}>
                {lbl}
                {tab === id && <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: -1, height: 2,
                  background: t.accent, borderRadius: 1,
                }}/>}
              </div>
            ))}
          </div>
        </div>

        {/* body */}
        <div style={{ padding: '24px 40px 40px' }}>
          {tab === 'overview' && <BrandOverviewBody t={t}/>}
          {tab === 'knowledge' && <BrandKnowledgeBody t={t}/>}
          {tab === 'integrations' && <BrandIntegrationsBody t={t}/>}
        </div>
      </div>
    </div>
  );
}

function BrandOverviewBody({ t }: BrandOverviewBodyProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
      {/* recent activity */}
      <div style={{
        padding: 20, background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12,
      }}>
        <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600, color: t.textPrimary, marginBottom: 14 }}>
          Recent activity
        </div>
        {([
          ['06:43', 'Amira asked: treasury exposure summary', 'Ruhi pulled 5 memories'],
          ['06:12', 'Priya filed Keyline Q1 breach note', 'Tagged #keyline-foods'],
          ['Yesterday', 'Compliance audit packet exported', 'By David Ng'],
          ['Yesterday', 'Ardent Logistics watchlist updated', 'Next review 30 Apr'],
          ['Mon', 'New memory: Trafalgar desk mandate', 'By Amira Khalil'],
        ] as [string, string, string][]).map(([ts, line, sub], i) => (
          <div key={i} style={{
            padding: '12px 0', borderTop: i === 0 ? 'none' : `1px solid ${t.borderSubtle}`,
            display: 'flex', gap: 14,
          }}>
            <div style={{ width: 68, fontFamily: RUHI_FONTS.mono, fontSize: 11, color: t.textMuted, paddingTop: 2 }}>
              {ts}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textPrimary }}>{line}</div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* key people + top memories */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ padding: 20, background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12 }}>
          <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600, color: t.textPrimary, marginBottom: 14 }}>
            Key people
          </div>
          {([
            ['Amira Khalil', 'Chief Risk Officer', '#5B6BFF', 'AK'],
            ['David Ng', 'Head of Compliance', '#2F7D3F', 'DN'],
            ['Priya Chen', 'Credit Relationship', '#B35C00', 'PC'],
          ] as [string, string, string, string][]).map(([n, r, c, ini], i) => (
            <div key={i} style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: 12,
              borderTop: i === 0 ? 'none' : `1px solid ${t.borderSubtle}` }}>
              <UserAvatar t={t} initials={ini} size={32} color={c}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, fontWeight: 500, color: t.textPrimary }}>{n}</div>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted }}>{r}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: 20, background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12 }}>
          <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600, color: t.textPrimary, marginBottom: 14 }}>
            Top memories
          </div>
          {MEMORIES_FULL.slice(0, 3).map((m, i) => (
            <div key={i} style={{
              padding: '12px 0', borderTop: i === 0 ? 'none' : `1px solid ${t.borderSubtle}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <AccessBadge t={t} level={m.access} size="sm"/>
                <div style={{ flex: 1 }}/>
                <span style={{ fontFamily: RUHI_FONTS.mono, fontSize: 10.5, color: t.textMuted }}>
                  {Math.floor(20 - i*3)}x
                </span>
              </div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12.5, fontWeight: 500, color: t.textPrimary, lineHeight: 1.4 }}>
                {m.title}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BrandKnowledgeBody({ t }: BrandKnowledgeBodyProps) {
  const clusters = [
    { name: 'Credit risk', count: 42, levels: ['Private','Management'] as AccessLevel[], color: '#5B6BFF' },
    { name: 'Treasury & FX', count: 28, levels: ['Management','Internal'] as AccessLevel[], color: '#FFC01C' },
    { name: 'Compliance', count: 31, levels: ['Internal','Public'] as AccessLevel[], color: '#2F7D3F' },
    { name: 'Client relationships', count: 19, levels: ['Private','Advisor'] as AccessLevel[], color: '#B35C00' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
      {clusters.map((c, i) => (
        <div key={i} style={{
          padding: 20, background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <BrandDot color={c.color} size={10}/>
            <div style={{ flex: 1, fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600, color: t.textPrimary }}>
              {c.name}
            </div>
            <div style={{ fontFamily: RUHI_FONTS.mono, fontSize: 12, color: t.textMuted }}>{c.count}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {c.levels.map(l => <AccessBadge key={l} t={t} level={l} size="sm"/>)}
          </div>
          {MEMORIES_FULL.slice(i*2, i*2+3).map((m, j) => (
            <div key={j} style={{
              padding: '8px 0', borderTop: `1px solid ${t.borderSubtle}`,
              fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textSecondary,
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <RuhiIcon name="bookmark" size={11} color={t.textMuted}/>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.title}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function BrandIntegrationsBody({ t }: BrandIntegrationsBodyProps) {
  const sources: [string, string, string, string][] = [
    ['Core banking ledger', 'Connected', '2.1M records', '.... 4821'],
    ['Credit risk engine', 'Connected', '312K records', '.... 9024'],
    ['Compliance filings', 'Connected', '4.8K records', '.... 0011'],
    ['CRM pipeline', 'Read only', '88K records', '.... 2294'],
    ['Treasury desk feed', 'Read only', 'Streaming', '.... 7733'],
  ];
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
        padding: '12px 20px', fontFamily: RUHI_FONTS.body, fontSize: 11, fontWeight: 600,
        color: t.textMuted, letterSpacing: 0.6, textTransform: 'uppercase',
        borderBottom: `1px solid ${t.borderSubtle}`,
      }}>
        <div>Source</div><div>Access</div><div>Records</div><div>Account</div>
      </div>
      {sources.map(([n, acc, rec, id], i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
          padding: '14px 20px', alignItems: 'center',
          borderBottom: i < sources.length - 1 ? `1px solid ${t.borderSubtle}` : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: 8, background: t.accent }}/>
            <span style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textPrimary }}>{n}</span>
          </div>
          <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textSecondary }}>{acc}</div>
          <div style={{ fontFamily: RUHI_FONTS.mono, fontSize: 12, color: t.textSecondary }}>{rec}</div>
          <div style={{ fontFamily: RUHI_FONTS.mono, fontSize: 12, color: t.textMuted }}>{id}</div>
        </div>
      ))}
    </div>
  );
}

// ---- Knowledge ----

export function Screen_Knowledge({ t, onNavigate }: ScreenKnowledgeProps) {
  const clusters = [
    { name: 'Credit risk', count: 42, color: '#5B6BFF', preview: [0, 7, 3] },
    { name: 'Treasury & FX', count: 28, color: '#FFC01C', preview: [0, 8, 6] },
    { name: 'Compliance', count: 31, color: '#2F7D3F', preview: [6, 7, 4] },
    { name: 'Client relationships', count: 19, color: '#B35C00', preview: [1, 4, 10] },
    { name: 'Portfolio & investment', count: 34, color: '#8C0A3F', preview: [2, 10, 5] },
    { name: 'Operations & supply', count: 22, color: '#4A3B8C', preview: [5, 11, 9] },
  ];
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: t.bg }}>
      <LeftRail t={t} active="knowledge" onNavigate={onNavigate}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>
        <div style={{ padding: '28px 40px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{
                fontFamily: RUHI_FONTS.display, fontSize: 26, fontWeight: 600,
                color: t.textPrimary, letterSpacing: -0.4,
              }}>Knowledge library</div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                176 memories grouped into 6 clusters by hashtag
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 14px', borderRadius: 8,
                border: `1px solid ${t.borderSubtle}`, background: t.surface,
                fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textSecondary,
              }}>
                Sort: most referenced <RuhiIcon name="chevronDown" size={12}/>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 40px 40px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
          }}>
            {clusters.map((c, i) => (
              <div key={i} style={{
                padding: 20, background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12,
                display: 'flex', flexDirection: 'column', gap: 12, minHeight: 260,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 10, background: `${c.color}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <RuhiIcon name="hash" size={14} color={c.color}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600, color: t.textPrimary }}>
                      {c.name}
                    </div>
                    <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted, marginTop: 1 }}>
                      {c.count} memories
                    </div>
                  </div>
                </div>

                {/* access level distribution bar */}
                <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', gap: 2 }}>
                  <div style={{ flex: 3, background: t.badgePrivate.fg, opacity: 0.5 }}/>
                  <div style={{ flex: 5, background: t.accent }}/>
                  <div style={{ flex: 2, background: t.textMuted, opacity: 0.4 }}/>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {c.preview.map((idx, j) => {
                    const m = MEMORIES_FULL[idx];
                    return (
                      <div key={j} style={{
                        padding: '8px 0', borderTop: `1px solid ${t.borderSubtle}`,
                        display: 'flex', gap: 8, alignItems: 'center',
                      }}>
                        <AccessBadge t={t} level={m.access} size="sm"/>
                        <span style={{ flex: 1, fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textSecondary,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.title}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.accentMutedText,
                  fontWeight: 500, cursor: 'pointer',
                }}>
                  Open cluster <RuhiIcon name="arrowRight" size={12}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Insights ----

export function Screen_Insights({ t, onNavigate }: ScreenInsightsProps) {
  const rows: [string, string, string, string, number[]][] = [
    ['06:43', 'Meridian', 'AK', 'Treasury exposure summary for CRO brief', [0,1,8,9,7]],
    ['06:12', 'Meridian', 'PC', 'Keyline Q1 covenant breach, what policy applies', [3,1]],
    ['Yesterday 17:04', 'Helix', 'DN', 'Q2 rebalance risk view, energy sector', [2,10]],
    ['Yesterday 14:22', 'Floret', 'MR', 'March cohort reorder velocity trend', [3]],
    ['Yesterday 11:38', 'Northfield', 'AK', 'Wholesale pricing tier proposal draft', [4]],
    ['Mon 09:12', 'Cartograph', 'TO', 'Supplier concentration risk, ceramics', [5]],
    ['Sun 19:20', 'Meridian', 'AK', 'Regulatory filing calendar this quarter', [6]],
  ];
  const userColors: Record<string, string> = { AK: '#5B6BFF', PC: '#B35C00', DN: '#2F7D3F', MR: '#8C0A3F', TO: '#4A3B8C' };
  const brandColors: Record<string, string> = { Meridian: '#0A4D8C', Helix: '#8C0A3F', Floret: '#2F7D3F', Northfield: '#B35C00', Cartograph: '#4A3B8C' };
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: t.bg }}>
      <LeftRail t={t} active="insights" onNavigate={onNavigate}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>
        <div style={{ padding: '28px 40px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{
                fontFamily: RUHI_FONTS.display, fontSize: 26, fontWeight: 600,
                color: t.textPrimary, letterSpacing: -0.4,
              }}>Insights</div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                Always-on visibility into every query Ruhi answers across your brands.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 34, padding: '0 12px', borderRadius: 8,
                border: `1px solid ${t.borderSubtle}`, background: t.surface,
                fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textSecondary,
              }}>
                <RuhiIcon name="calendar" size={12}/> Last 7 days
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 34, padding: '0 12px', borderRadius: 8,
                border: `1px solid ${t.borderSubtle}`, background: t.surface,
                fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textSecondary,
              }}>
                <BrandDot color={t.accent}/> All brands
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 34, padding: '0 12px', borderRadius: 8,
                border: `1px solid ${t.borderSubtle}`, background: t.surface,
                fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textSecondary,
              }}>
                <RuhiIcon name="users" size={12}/> All users
              </div>
            </div>
          </div>

          {/* stat row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {([
              ['Queries this week', '84', '+12 vs last'],
              ['Memories recalled', '312', 'Across 5 brands'],
              ['Active users', '9', '3 admins'],
              ['Average confidence', '89%', 'Up from 84% last week'],
            ] as [string, string, string][]).map(([k, v, s], i) => (
              <div key={i} style={{
                padding: '14px 16px', background: t.surface,
                border: `1px solid ${t.borderSubtle}`, borderRadius: 12,
              }}>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted, marginBottom: 4 }}>{k}</div>
                <div style={{
                  fontFamily: RUHI_FONTS.display, fontSize: 22, fontWeight: 600,
                  color: t.textPrimary, letterSpacing: -0.4, marginBottom: 2,
                }}>{v}</div>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.accentMutedText }}>{s}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '0 40px 40px' }}>
          <div style={{
            background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '140px 140px 140px 1fr 120px',
              padding: '12px 20px',
              fontFamily: RUHI_FONTS.body, fontSize: 11, fontWeight: 600, color: t.textMuted,
              letterSpacing: 0.6, textTransform: 'uppercase',
              borderBottom: `1px solid ${t.borderSubtle}`,
            }}>
              <div>When</div><div>Brand</div><div>Who</div><div>Query</div><div>Memories</div>
            </div>
            {rows.map(([when, brand, who, q, mems], i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '140px 140px 140px 1fr 120px',
                padding: '16px 20px', alignItems: 'center',
                borderBottom: i < rows.length - 1 ? `1px solid ${t.borderSubtle}` : 'none',
              }}>
                <div style={{ fontFamily: RUHI_FONTS.mono, fontSize: 11.5, color: t.textMuted }}>{when}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BrandDot color={brandColors[brand]} size={8}/>
                  <span style={{ fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textSecondary }}>{brand}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UserAvatar t={t} initials={who} size={22} color={userColors[who]}/>
                </div>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textPrimary }}>{q}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RuhiIcon name="database" size={11} color={t.textMuted}/>
                  <span style={{ fontFamily: RUHI_FONTS.mono, fontSize: 11.5, color: t.textSecondary }}>
                    {mems.length} recalled
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
