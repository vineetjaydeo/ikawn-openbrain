// Screens: Memory Browser, Memory Detail

import React, { useState } from 'react';
import { type RuhiTheme, RUHI_DARK, RUHI_FONTS } from './tokens';
import {
  RuhiButton,
  RuhiInput,
  AccessBadge,
  HashtagChip,
  BrandDot,
  UserAvatar,
  EmptyIllustration,
} from './components';
import { RuhiIcon } from './icons';
import { MEMORIES_FULL, type MemoryItem } from './data';
import { LeftRail } from './chat';

// ---- Types ----

export interface MemoryCardProps {
  t: RuhiTheme;
  m: MemoryItem;
  onClick?: () => void;
}

export interface ScreenMemoryBrowserProps {
  t: RuhiTheme;
  empty?: boolean;
  onNavigate?: (screen: string) => void;
}

export interface ScreenMemoryDetailProps {
  t: RuhiTheme;
  onNavigate?: (screen: string) => void;
}

// ---- Memory Card ----

export function MemoryCard({ t, m, onClick }: MemoryCardProps) {
  return (
    <div onClick={onClick} style={{
      padding: '16px 18px',
      background: t.surface,
      border: `1px solid ${t.borderSubtle}`,
      borderRadius: 12, cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 10,
      minHeight: 170,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <BrandDot color={m.brandColor} size={8}/>
        <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted, flex: 1 }}>
          {m.brand}
        </div>
        <AccessBadge t={t} level={m.access} size="sm"/>
      </div>
      <div style={{
        fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600,
        color: t.textPrimary, lineHeight: 1.35, letterSpacing: 0.05,
      }}>{m.title}</div>
      <div style={{
        fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textSecondary,
        lineHeight: 1.55, flex: 1,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{m.snippet}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {m.tags.slice(0, 3).map((tag, i) => <HashtagChip key={i} t={t} label={tag}/>)}
      </div>
      <div style={{
        fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
        paddingTop: 6, borderTop: `1px solid ${t.borderSubtle}`,
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>Created {m.date}</span>
        <span>Referenced 12x</span>
      </div>
    </div>
  );
}

// ---- Memory Browser ----

export function Screen_MemoryBrowser({ t, empty = false, onNavigate }: ScreenMemoryBrowserProps) {
  const chips = ['All', 'Private', 'Management', 'Internal', 'Advisor', 'Investor', 'Public'];
  const [active, setActive] = useState('All');
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: t.bg }}>
      <LeftRail t={t} active="memory" onNavigate={onNavigate}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          padding: '28px 40px 20px', borderBottom: `1px solid ${t.borderSubtle}`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20,
          }}>
            <div>
              <div style={{
                fontFamily: RUHI_FONTS.display, fontSize: 26, fontWeight: 600,
                color: t.textPrimary, letterSpacing: -0.4,
              }}>Memory</div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                312 memories across 5 brands
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <RuhiButton t={t} variant="secondary" size="md" icon="filter">Filters</RuhiButton>
              <RuhiButton t={t} variant="primary" size="md" icon="plus">New memory</RuhiButton>
            </div>
          </div>
          <RuhiInput t={t} value={empty ? 'keyline growthplan Q3' : ''}
                     placeholder="Search memory content, hashtags, or brand..."
                     icon="search" size="lg"/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {chips.map(c => (
              <div key={c} onClick={() => setActive(c)} style={{
                height: 30, padding: '0 14px',
                display: 'inline-flex', alignItems: 'center',
                borderRadius: 999,
                border: `1px solid ${active === c ? t.accent : t.borderSubtle}`,
                background: active === c ? t.accentMutedBg : 'transparent',
                color: active === c ? t.accentMutedText : t.textSecondary,
                fontFamily: RUHI_FONTS.body, fontSize: 12.5, fontWeight: 500,
                cursor: 'pointer',
              }}>{c}</div>
            ))}
            <div style={{ flex: 1 }}/>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 30, padding: '0 12px', borderRadius: 999,
              border: `1px dashed ${t.borderStrong}`,
              color: t.textSecondary,
              fontFamily: RUHI_FONTS.body, fontSize: 12, cursor: 'pointer',
            }}>
              <RuhiIcon name="hash" size={12}/>
              hashtag: any
              <RuhiIcon name="chevronDown" size={12}/>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px 40px' }}>
          {empty ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '40px 20px', textAlign: 'center', gap: 14,
            }}>
              <EmptyIllustration t={t} size={160}/>
              <div style={{
                fontFamily: RUHI_FONTS.display, fontSize: 20, fontWeight: 600,
                color: t.textPrimary, marginTop: 8,
              }}>Nothing matches that search.</div>
              <div style={{
                fontFamily: RUHI_FONTS.body, fontSize: 14, color: t.textSecondary,
                maxWidth: 400,
              }}>Try broadening the query, removing the access filter, or switching brand.</div>
              <RuhiButton t={t} variant="primary" size="md">Clear filters</RuhiButton>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}>
              {MEMORIES_FULL.map(m => <MemoryCard key={m.id} t={t} m={m}/>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Memory Detail ----

export function Screen_MemoryDetail({ t, onNavigate }: ScreenMemoryDetailProps) {
  const m = MEMORIES_FULL[1]; // Keyline
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: t.bg }}>
      <LeftRail t={t} active="memory" onNavigate={onNavigate}/>
      <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
        {/* content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '28px 48px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textMuted, marginBottom: 18,
            }}>
              <span style={{ cursor: 'pointer' }}>Memory</span>
              <RuhiIcon name="chevronRight" size={12}/>
              <span style={{ cursor: 'pointer' }}>Meridian Bank</span>
              <RuhiIcon name="chevronRight" size={12}/>
              <span style={{ color: t.textSecondary }}>Keyline Foods credit file</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <AccessBadge t={t} level={m.access}/>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                border: `1px solid ${t.borderSubtle}`,
                fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
              }}>
                <RuhiIcon name="lock" size={11}/>
                Visible to 3 people only
              </div>
            </div>

            <div style={{
              fontFamily: RUHI_FONTS.display, fontSize: 32, fontWeight: 600,
              color: t.textPrimary, letterSpacing: -0.6, lineHeight: 1.2, marginBottom: 20,
            }}>{m.title}</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
              {m.tags.map((tag, i) => <HashtagChip key={i} t={t} label={tag}/>)}
            </div>

            <div style={{
              fontFamily: RUHI_FONTS.body, fontSize: 15, color: t.textPrimary,
              lineHeight: 1.7,
            }}>
              <p style={{ margin: '0 0 14px' }}>
                First borrower breach of the early-warning ratio on 14 April 2026. Relationship manager Priya Chen filed the notice at 08:12 GMT after the Q1 covenant package review.
              </p>
              <p style={{ margin: '0 0 14px' }}>
                Keyline operates in the ready-meals segment. Margin compression in Q4 2025 was visible but within headroom. The Q1 file shows the compression has continued into private-label contract renegotiations with two of the five grocery partners.
              </p>
              <p style={{ margin: '0 0 14px' }}>
                Policy treatment: first breach moves to review, not escalation. Next covenant date is 30 June. A second breach would trigger credit committee review within 10 business days.
              </p>
              <div style={{
                padding: '14px 16px', marginTop: 18,
                borderLeft: `2px solid ${t.accent}`,
                background: t.accentMutedBg,
                fontSize: 14, color: t.textPrimary,
              }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: t.accentMutedText, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
                  RM note . Priya Chen, 14 Apr
                </div>
                Pricing power with Group A buyer is the variable to watch. Keyline's CFO has requested a 30-day extension on the working-capital facility. Not material yet.
              </div>
            </div>

            <div style={{
              marginTop: 36, padding: '18px 0',
              borderTop: `1px solid ${t.borderSubtle}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textMuted }}>
                Version 4 . last edited by Priya Chen 16 Apr 14:02
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <RuhiButton t={t} variant="secondary" size="sm" icon="archive">Archive</RuhiButton>
                <RuhiButton t={t} variant="secondary" size="sm" icon="edit">Edit memory</RuhiButton>
              </div>
            </div>
          </div>
        </div>

        {/* metadata panel */}
        <div style={{
          width: 320, flexShrink: 0,
          borderLeft: `1px solid ${t.borderSubtle}`,
          padding: '24px 24px',
          overflow: 'auto',
        }}>
          <div style={{
            fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14, fontWeight: 600,
          }}>Metadata</div>

          {([
            ['Access', <AccessBadge key="ab" t={t} level={m.access} size="sm"/>],
            ['Brand', <div key="bd" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textPrimary }}><BrandDot color={m.brandColor} size={8}/> {m.brand}</div>],
            ['Created by', <div key="cb" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><UserAvatar t={t} initials="PC" size={20} color="#2F7D3F"/><span style={{ fontSize: 13, color: t.textPrimary }}>Priya Chen</span></div>],
            ['Created', <span key="cd" style={{ fontSize: 13, color: t.textPrimary }}>{m.date}</span>],
            ['Last referenced', <span key="lr" style={{ fontSize: 13, color: t.textPrimary }}>Today, 06:43</span>],
            ['Referenced', <span key="rf" style={{ fontSize: 13, color: t.textPrimary }}>12 times</span>],
          ] as [string, React.ReactNode][]).map(([k, v], i) => (
            <div key={i} style={{
              padding: '10px 0', borderBottom: i < 5 ? `1px solid ${t.borderSubtle}` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textMuted }}>{k}</div>
              <div>{v}</div>
            </div>
          ))}

          <div style={{ height: 24 }}/>
          <div style={{
            fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, fontWeight: 600,
          }}>Applies to brands</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Meridian Bank'].map(b => (
              <div key={b} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                background: t.surface, border: `1px solid ${t.borderSubtle}`,
                fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textPrimary,
              }}>
                <BrandDot color="#0A4D8C" size={7}/>
                {b}
              </div>
            ))}
          </div>

          <div style={{ height: 24 }}/>
          <div style={{
            fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, fontWeight: 600,
          }}>Related memories</div>
          {[MEMORIES_FULL[0], MEMORIES_FULL[3], MEMORIES_FULL[7]].map((r, i) => (
            <div key={i} style={{
              padding: '10px 0', borderTop: i === 0 ? `1px solid ${t.borderSubtle}` : 'none',
              borderBottom: `1px solid ${t.borderSubtle}`,
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <AccessBadge t={t} level={r.access} size="sm"/>
                <div style={{ flex: 1 }}/>
                <RuhiIcon name="chevronRight" size={12} color={t.textMuted}/>
              </div>
              <div style={{
                fontFamily: RUHI_FONTS.body, fontSize: 12.5, fontWeight: 500,
                color: t.textPrimary, lineHeight: 1.4,
              }}>{r.title}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
