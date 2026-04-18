// Screens: Settings, Admin

import React from 'react';
import { type RuhiTheme, RUHI_DARK, RUHI_LIGHT, RUHI_FONTS } from './tokens';
import {
  RuhiButton,
  AccessBadge,
  UserAvatar,
  type AccessLevel,
} from './components';
import { RuhiIcon } from './icons';
import { LeftRail } from './chat';

// ---- Types ----

export interface ScreenSettingsProps {
  t: RuhiTheme;
  onNavigate?: (screen: string) => void;
}

export interface ScreenAdminProps {
  t: RuhiTheme;
  onNavigate?: (screen: string) => void;
}

export interface SettingsSectionProps {
  t: RuhiTheme;
  title: string;
  hint?: string;
  children: React.ReactNode;
}

export interface ToggleProps {
  t: RuhiTheme;
  on: boolean;
}

// ---- Settings Section ----

function SettingsSection({ t, title, hint, children }: SettingsSectionProps) {
  return (
    <div style={{ marginBottom: 28 }}>
      {title && (
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: 11, fontWeight: 600,
          color: t.textMuted, letterSpacing: 0.8, textTransform: 'uppercase',
          marginBottom: hint ? 4 : 12,
        }}>{title}</div>
      )}
      {hint && (
        <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textMuted, marginBottom: 12 }}>
          {hint}
        </div>
      )}
      <div style={{
        padding: 18, background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12,
      }}>
        {children}
      </div>
    </div>
  );
}

// ---- Toggle ----

function Toggle({ t, on }: ToggleProps) {
  return (
    <div style={{
      width: 36, height: 20, borderRadius: 999,
      background: on ? t.accent : t.borderStrong,
      padding: 2, display: 'flex',
      alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start',
      cursor: 'pointer',
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: 16,
        background: on ? '#0A0A0A' : '#F5F5F5',
      }}/>
    </div>
  );
}

// ---- Settings ----

export function Screen_Settings({ t, onNavigate }: ScreenSettingsProps) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: t.bg }}>
      <LeftRail t={t} active="settings" onNavigate={onNavigate}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>
        <div style={{ padding: '28px 40px 20px', maxWidth: 820, width: '100%', margin: '0 auto' }}>
          <div style={{
            fontFamily: RUHI_FONTS.display, fontSize: 26, fontWeight: 600,
            color: t.textPrimary, letterSpacing: -0.4, marginBottom: 4,
          }}>Settings</div>
          <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textMuted, marginBottom: 28 }}>
            Manage your profile, appearance, and access.
          </div>

          <SettingsSection t={t} title="Profile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <UserAvatar t={t} initials="AK" size={52} color="#5B6BFF"/>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 15, fontWeight: 600, color: t.textPrimary }}>
                  Amira Khalil
                </div>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                  amira.khalil@meridianbank.com . Chief Risk Officer
                </div>
              </div>
              <RuhiButton t={t} variant="secondary" size="sm" icon="edit">Edit</RuhiButton>
            </div>
          </SettingsSection>

          <SettingsSection t={t} title="Access levels"
            hint="What you can see across the workspace. Granted by your workspace admin.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(['Private','Management','Internal','Advisor','Public'] as AccessLevel[]).map(l => (
                <AccessBadge key={l} t={t} level={l}/>
              ))}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 24, padding: '0 10px', borderRadius: 999,
                border: `1px dashed ${t.borderSubtle}`,
                fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
                textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 500,
              }}>
                <RuhiIcon name="lock" size={10} color={t.textMuted}/>
                Investor (not granted)
              </div>
            </div>
          </SettingsSection>

          <SettingsSection t={t} title="Appearance">
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { id: 'dark', label: 'Dark', swatch: ['#0A0A0A', '#161616', '#FFC01C'] },
                { id: 'light', label: 'Light', swatch: ['#FFFFFF', '#F5F4F0', '#FFC01C'] },
              ].map(opt => (
                <div key={opt.id} style={{
                  flex: 1, padding: 14,
                  border: `1px solid ${(t === RUHI_DARK && opt.id === 'dark') || (t === RUHI_LIGHT && opt.id === 'light') ? t.accent : t.borderSubtle}`,
                  borderRadius: 12, background: t.surface, cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                    {opt.swatch.map((c, i) => (
                      <div key={i} style={{ width: 28, height: 44, borderRadius: 6, background: c, border: `1px solid ${t.borderSubtle}` }}/>
                    ))}
                  </div>
                  <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, fontWeight: 600, color: t.textPrimary }}>
                    {opt.label}
                  </div>
                  <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted, marginTop: 1 }}>
                    {opt.id === 'dark' ? 'Low-light dense' : 'Daylight, warm'}
                  </div>
                </div>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection t={t} title="Notifications">
            {([
              ['Risk alerts', 'Early-warning triggers on any watchlist entity', true],
              ['Daily summary', '07:00 local brief of overnight activity', true],
              ['Memory mentions', 'When a memory you authored is referenced', false],
              ['Workspace announcements', 'Product updates and regulatory posts', true],
            ] as [string, string, boolean][]).map(([lbl, sub, on], i) => (
              <div key={i} style={{
                padding: '12px 0',
                borderTop: i === 0 ? 'none' : `1px solid ${t.borderSubtle}`,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13.5, fontWeight: 500, color: t.textPrimary }}>
                    {lbl}
                  </div>
                  <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textMuted, marginTop: 1 }}>
                    {sub}
                  </div>
                </div>
                <Toggle t={t} on={on}/>
              </div>
            ))}
          </SettingsSection>

          <SettingsSection t={t} title="Release channel">
            <div style={{
              padding: '14px 16px', background: t.surface,
              border: `1px solid ${t.borderSubtle}`, borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: t.accentMutedBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <RuhiIcon name="shieldCheck" size={14} color={t.accent}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13.5, fontWeight: 600, color: t.textPrimary }}>
                  ruhi . regulated
                </div>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted, marginTop: 1 }}>
                  Weekly model updates, full audit log retention, single-tenant
                </div>
              </div>
              <div style={{
                padding: '3px 10px', borderRadius: 999,
                background: t.surface, border: `1px solid ${t.borderSubtle}`,
                fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
              }}>Read only</div>
            </div>
          </SettingsSection>

          <SettingsSection t={t} title="API and integrations">
            {([
              ['Personal access token', '.... wj29, created 12 Jan 2026', 'Rotate'],
              ['Webhook receivers', '2 configured', 'Manage'],
              ['SCIM provisioning', 'Active . Okta', 'Configure'],
            ] as [string, string, string][]).map(([lbl, sub, act], i) => (
              <div key={i} style={{
                padding: '12px 0',
                borderTop: i === 0 ? 'none' : `1px solid ${t.borderSubtle}`,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13.5, fontWeight: 500, color: t.textPrimary }}>{lbl}</div>
                  <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textMuted, marginTop: 1 }}>{sub}</div>
                </div>
                <RuhiButton t={t} variant="secondary" size="sm">{act}</RuhiButton>
              </div>
            ))}
          </SettingsSection>

          <SettingsSection t={t} title="">
            <RuhiButton t={t} variant="destructive" size="md" icon="logout">Sign out of Ruhi</RuhiButton>
          </SettingsSection>

          <div style={{ height: 40 }}/>
        </div>
      </div>
    </div>
  );
}

// ---- Admin ----

export function Screen_Admin({ t, onNavigate }: ScreenAdminProps) {
  const users: [string, string, string, string, string, AccessLevel[], string][] = [
    ['AK', 'Amira Khalil', 'amira.khalil@meridianbank.com', '#5B6BFF', 'Admin', ['Private','Management','Internal','Advisor','Public'], '2 min ago'],
    ['DN', 'David Ng', 'david.ng@meridianbank.com', '#2F7D3F', 'Compliance', ['Management','Internal','Public'], '18 min ago'],
    ['PC', 'Priya Chen', 'priya.chen@meridianbank.com', '#B35C00', 'Credit RM', ['Private','Management','Internal'], '1 h ago'],
    ['MR', 'Miles Rey', 'miles.rey@helix.co', '#8C0A3F', 'Advisor', ['Advisor','Public'], 'Yesterday'],
    ['TO', 'Tariq Osei', 'tariq@cartograph.com', '#4A3B8C', 'Ops Lead', ['Internal','Public'], '3 days ago'],
    ['JM', 'Jun Matsuda', 'jun@floret.com', '#2F7D3F', 'Brand Lead', ['Management','Internal','Public'], '5 days ago'],
  ];
  const roles: [string, number[]][] = [
    ['Admin', [1,1,1,1,1,1]],
    ['Compliance', [0,1,1,0,0,1]],
    ['Credit RM', [1,1,1,0,0,1]],
    ['Advisor', [0,0,0,1,0,1]],
    ['Brand Lead', [0,1,1,0,0,1]],
    ['Viewer', [0,0,0,0,0,1]],
  ];
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: t.bg }}>
      <LeftRail t={t} active="settings" onNavigate={onNavigate}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>
        <div style={{ padding: '28px 40px 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
            fontFamily: RUHI_FONTS.body, fontSize: 12.5, color: t.textMuted,
          }}>
            <span style={{ cursor: 'pointer' }}>Settings</span>
            <RuhiIcon name="chevronRight" size={12}/>
            <span style={{ color: t.textSecondary }}>Access control</span>
            <div style={{
              padding: '2px 8px', borderRadius: 999,
              background: t.accentMutedBg, color: t.accentMutedText,
              fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
              border: `1px solid ${t.accent}30`,
            }}>Admin only</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{
                fontFamily: RUHI_FONTS.display, fontSize: 26, fontWeight: 600,
                color: t.textPrimary, letterSpacing: -0.4,
              }}>Access control</div>
              <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                Who can see what, across all brands in this workspace.
              </div>
            </div>
            <RuhiButton t={t} variant="primary" size="md" icon="plus">Add user</RuhiButton>
          </div>
        </div>

        {/* user list */}
        <div style={{ padding: '0 40px 24px' }}>
          <div style={{
            background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.4fr 130px 1.6fr 120px 48px',
              padding: '12px 20px',
              fontFamily: RUHI_FONTS.body, fontSize: 11, fontWeight: 600, color: t.textMuted,
              letterSpacing: 0.6, textTransform: 'uppercase',
              borderBottom: `1px solid ${t.borderSubtle}`,
            }}>
              <div>Person</div><div>Role</div><div>Access levels</div><div>Last active</div><div/>
            </div>
            {users.map(([ini, name, email, color, role, levels, active], i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1.4fr 130px 1.6fr 120px 48px',
                padding: '14px 20px', alignItems: 'center',
                borderBottom: i < users.length - 1 ? `1px solid ${t.borderSubtle}` : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <UserAvatar t={t} initials={ini} size={32} color={color}/>
                  <div>
                    <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{name}</div>
                    <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted }}>{email}</div>
                  </div>
                </div>
                <div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px',
                    borderRadius: 999, background: role === 'Admin' ? t.trustNavy + (t === RUHI_DARK ? '80' : '') : t.surface,
                    color: role === 'Admin' ? (t === RUHI_DARK ? '#A8B4FF' : '#fff') : t.textSecondary,
                    border: `1px solid ${role === 'Admin' ? 'transparent' : t.borderSubtle}`,
                    fontFamily: RUHI_FONTS.body, fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase',
                  }}>{role}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {levels.map(l => <AccessBadge key={l} t={t} level={l} size="sm"/>)}
                </div>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textMuted }}>{active}</div>
                <div style={{ textAlign: 'right' }}>
                  <RuhiIcon name="chevronRight" size={14} color={t.textMuted}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* role permissions matrix */}
        <div style={{ padding: '0 40px 40px' }}>
          <div style={{
            fontFamily: RUHI_FONTS.body, fontSize: 13, fontWeight: 600,
            color: t.textPrimary, marginBottom: 10,
          }}>Role permissions matrix</div>
          <div style={{
            background: t.surface, border: `1px solid ${t.borderSubtle}`, borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '180px repeat(6, 1fr)',
              padding: '12px 20px',
              fontFamily: RUHI_FONTS.body, fontSize: 11, fontWeight: 600, color: t.textMuted,
              letterSpacing: 0.6, textTransform: 'uppercase',
              borderBottom: `1px solid ${t.borderSubtle}`,
            }}>
              <div>Role</div>
              {['Private','Management','Internal','Advisor','Investor','Public'].map(l => (
                <div key={l} style={{ textAlign: 'center' }}>{l.slice(0,4)}</div>
              ))}
            </div>
            {roles.map(([role, perms], i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '180px repeat(6, 1fr)',
                padding: '12px 20px', alignItems: 'center',
                borderBottom: i < 5 ? `1px solid ${t.borderSubtle}` : 'none',
              }}>
                <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, fontWeight: 500, color: t.textPrimary }}>{role}</div>
                {perms.map((p, j) => (
                  <div key={j} style={{ textAlign: 'center' }}>
                    {p ? (
                      <div style={{ display: 'inline-flex', width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
                        borderRadius: 6, background: t.accentMutedBg, color: t.accent }}>
                        <RuhiIcon name="check" size={12}/>
                      </div>
                    ) : (
                      <div style={{ width: 16, height: 1, background: t.borderStrong, margin: '0 auto', opacity: 0.5 }}/>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
