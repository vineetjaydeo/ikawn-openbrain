// Shared Ruhi components: wordmark, buttons, badges, citation chips,
// message rows, illustration. Uses theme context everywhere.

import type { CSSProperties, ReactNode } from 'react';
import { RUHI_DARK, RUHI_FONTS, type RuhiTheme } from './tokens';
import { RuhiIcon, type IconName } from './icons';

// --- Wordmark ---

export interface RuhiWordmarkProps {
  t: RuhiTheme;
  size?: number;
  tag?: boolean;
}

export function RuhiWordmark({ t, size = 28, tag = false }: RuhiWordmarkProps) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 0,
        fontFamily: RUHI_FONTS.display,
        fontSize: size, fontWeight: 600, letterSpacing: -0.02 * size,
        color: t.textPrimary, lineHeight: 1,
      }}>
        <span>ruhi</span>
      </div>
      {/* yellow accent bar beneath the wordmark */}
      <div style={{
        height: Math.max(2, size * 0.08),
        width: size * 1.8,
        background: t.accent,
        borderRadius: 2,
      }}/>
    </div>
  );
}

// Compact wordmark with no tagline, for sidebars

export interface RuhiMarkProps {
  t: RuhiTheme;
  size?: number;
}

export function RuhiMark({ t, size = 20 }: RuhiMarkProps) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: size * 1.1, height: size * 1.1, borderRadius: 4,
        background: t === RUHI_DARK ? '#0A0A0A' : '#1A1A1A',
        position: 'relative', flexShrink: 0,
        border: `1px solid ${t === RUHI_DARK ? '#3A3A3A' : '#2A2A2A'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: size * 0.3, height: size * 0.3, background: t.accent,
        }}/>
      </div>
      <div style={{
        fontFamily: RUHI_FONTS.display,
        fontSize: size, fontWeight: 600, letterSpacing: -0.025 * size,
        color: t.textPrimary, lineHeight: 1,
      }}>ruhi</div>
    </div>
  );
}

// --- Buttons ---

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface RuhiButtonProps {
  t: RuhiTheme;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  style?: CSSProperties;
  onClick?: () => void;
  full?: boolean;
}

export function RuhiButton({ t, children, variant = 'primary', size = 'md', icon, iconRight, style = {}, onClick, full = false }: RuhiButtonProps) {
  const sizes = {
    sm: { h: 32, px: 12, fs: 13 },
    md: { h: 40, px: 16, fs: 14 },
    lg: { h: 48, px: 20, fs: 15 },
  };
  const s = sizes[size];
  const variants = {
    primary: { bg: t.accent, fg: '#0A0A0A', border: t.accent, hoverBg: t.accentHover },
    secondary: { bg: 'transparent', fg: t.textPrimary, border: t.borderStrong, hoverBg: t.surface },
    ghost: { bg: 'transparent', fg: t.textSecondary, border: 'transparent', hoverBg: t.surface },
    destructive: { bg: 'transparent', fg: t.danger, border: 'transparent', hoverBg: t.dangerBg },
  };
  const v = variants[variant];
  return (
    <button onClick={onClick} style={{
      height: s.h, padding: `0 ${s.px}px`, fontSize: s.fs,
      fontFamily: RUHI_FONTS.body, fontWeight: 500,
      background: v.bg, color: v.fg,
      border: `1px solid ${v.border}`, borderRadius: 8,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      cursor: 'pointer', transition: 'all .15s',
      width: full ? '100%' : 'auto',
      letterSpacing: 0.1,
      ...style,
    }}>
      {icon && <RuhiIcon name={icon} size={s.fs + 2} color="currentColor"/>}
      {children}
      {iconRight && <RuhiIcon name={iconRight} size={s.fs + 2} color="currentColor"/>}
    </button>
  );
}

// --- Input ---

export type InputState = 'default' | 'focused' | 'error';
export type InputSize = 'md' | 'lg';

export interface RuhiInputProps {
  t: RuhiTheme;
  label?: string;
  value?: string;
  placeholder?: string;
  type?: string;
  state?: InputState;
  error?: string;
  icon?: IconName;
  size?: InputSize;
  style?: CSSProperties;
}

export function RuhiInput({ t, label, value, placeholder, type = 'text', state = 'default', error, icon, size = 'md', style = {} }: RuhiInputProps) {
  const sizes = {
    md: { h: 44, fs: 14, px: 14 },
    lg: { h: 52, fs: 15, px: 16 },
  };
  const s = sizes[size];
  const borders = {
    default: t.borderSubtle,
    focused: t.accent,
    error: t.danger,
  };
  return (
    <div style={style}>
      {label && (
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: 12, fontWeight: 500,
          color: t.textSecondary, marginBottom: 6, letterSpacing: 0.2,
        }}>{label}</div>
      )}
      <div style={{
        height: s.h, display: 'flex', alignItems: 'center',
        background: t.surface, border: `1px solid ${borders[state]}`,
        borderRadius: 8, padding: `0 ${s.px}px`,
        boxShadow: state === 'focused' ? `0 0 0 3px ${t.accentMutedBg}` : 'none',
      }}>
        {icon && <div style={{ marginRight: 10, color: t.textMuted }}><RuhiIcon name={icon} size={16}/></div>}
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: s.fs,
          color: value ? t.textPrimary : t.textMuted, flex: 1,
        }}>{value || placeholder}</div>
        {type === 'password' && value && (
          <div style={{ color: t.textMuted, fontFamily: RUHI_FONTS.body, fontSize: 12, letterSpacing: 2 }}>*********</div>
        )}
      </div>
      {state === 'error' && error && (
        <div style={{ color: t.danger, fontSize: 12, marginTop: 6, fontFamily: RUHI_FONTS.body }}>{error}</div>
      )}
    </div>
  );
}

// --- Access-level badges ---

export type AccessLevel = 'Private' | 'Management' | 'Internal' | 'Advisor' | 'Investor' | 'Public';

export interface AccessBadgeProps {
  t: RuhiTheme;
  level: AccessLevel;
  size?: 'sm' | 'md';
}

export function AccessBadge({ t, level, size = 'md' }: AccessBadgeProps) {
  const map = {
    Private: t.badgePrivate,
    Management: t.badgeManagement,
    Internal: t.badgeInternal,
    Advisor: t.badgeAdvisor,
    Investor: t.badgeInvestor,
    Public: t.badgePublic,
  };
  const b = map[level];
  const h = size === 'sm' ? 20 : 24;
  const fs = size === 'sm' ? 10.5 : 11.5;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      height: h, padding: '0 8px',
      fontFamily: RUHI_FONTS.body, fontSize: fs, fontWeight: 500,
      color: b.fg, background: b.bg, border: `1px solid ${b.border}`,
      borderRadius: 999, letterSpacing: 0.3,
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{level}</span>
  );
}

// --- Citation chip ---

export interface CitationChipProps {
  t: RuhiTheme;
  label: string;
  inline?: boolean;
}

export function CitationChip({ t, label, inline = true }: CitationChipProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      height: 22, padding: '0 8px',
      fontFamily: RUHI_FONTS.body, fontSize: 12, fontWeight: 500,
      color: t.accentMutedText, background: t.accentMutedBg,
      border: `1px solid ${t.accent}25`,
      borderRadius: 999, verticalAlign: inline ? 'baseline' : 'middle',
      cursor: 'pointer',
    }}>
      <RuhiIcon name="hash" size={11} color={t.accentMutedText} strokeWidth={1.8}/>
      <span>{label}</span>
    </span>
  );
}

// --- Hashtag chip ---

export interface HashtagChipProps {
  t: RuhiTheme;
  label: string;
  muted?: boolean;
}

export function HashtagChip({ t, label, muted = false }: HashtagChipProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      height: 22, padding: '0 8px',
      fontFamily: RUHI_FONTS.body, fontSize: 11.5, fontWeight: 500,
      color: muted ? t.textMuted : t.textSecondary,
      background: 'transparent',
      border: `1px solid ${t.borderSubtle}`,
      borderRadius: 999,
    }}>
      <RuhiIcon name="hash" size={10} color="currentColor" strokeWidth={1.8}/>
      <span>{label}</span>
    </span>
  );
}

// --- Ruhi avatar (agent) ---

export interface RuhiAvatarProps {
  t: RuhiTheme;
  size?: number;
}

export function RuhiAvatar({ t, size = 28 }: RuhiAvatarProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: t === RUHI_DARK ? '#0A0A0A' : '#1A1A1A',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, position: 'relative', overflow: 'hidden',
      border: `1px solid ${t === RUHI_DARK ? '#3A3A3A' : '#2A2A2A'}`,
    }}>
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute', inset: 0 }}>
        {/* crosshair */}
        <path d="M 12 4 L 12 10 M 12 14 L 12 20 M 4 12 L 10 12 M 14 12 L 20 12"
          stroke={t === RUHI_DARK ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.22)'} strokeWidth="1"/>
        {/* center notch */}
        <rect x="10" y="10" width="4" height="4" fill={t.accent}/>
        {/* corner ticks */}
        <path d="M 3 3 L 3 6 M 3 3 L 6 3" stroke={t.accent} strokeWidth="1" opacity="0.85"/>
        <path d="M 21 3 L 21 6 M 21 3 L 18 3" stroke={t.accent} strokeWidth="1" opacity="0.85"/>
      </svg>
    </div>
  );
}

// --- User avatar ---

export interface UserAvatarProps {
  t: RuhiTheme;
  initials?: string;
  size?: number;
  color?: string;
}

export function UserAvatar({ t, initials = 'AK', size = 28, color = '#5B6BFF' }: UserAvatarProps) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size,
      background: color, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: RUHI_FONTS.body, fontSize: size * 0.40, fontWeight: 600,
      letterSpacing: 0.5, flexShrink: 0,
    }}>{initials}</div>
  );
}

// --- Brand dot ---

export interface BrandDotProps {
  color?: string;
  size?: number;
}

export function BrandDot({ color = '#FFC01C', size = 10 }: BrandDotProps) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: size,
      background: color, flexShrink: 0,
    }}/>
  );
}

// --- Empty-state illustration ---

export interface EmptyIllustrationProps {
  t: RuhiTheme;
  size?: number;
}

export function EmptyIllustration({ t, size = 180 }: EmptyIllustrationProps) {
  const isDark = t === RUHI_DARK;
  const sand1 = isDark ? '#1F1C14' : '#E8DCC4';
  const sand2 = isDark ? '#2A2519' : '#D9C9A6';
  const sand3 = isDark ? '#3A3322' : '#C9BFA8';
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 200 180" style={{ display: 'block' }}>
      <defs>
        <clipPath id="emptyClip">
          <rect x="0" y="0" width="200" height="180" rx="24"/>
        </clipPath>
      </defs>
      <g clipPath="url(#emptyClip)">
        <rect x="0" y="0" width="200" height="180" fill={sand1}/>
        {/* rising moon disc */}
        <circle cx="140" cy="72" r="42" fill={sand2}/>
        {/* horizon hill */}
        <path d="M -20 130 Q 60 95 120 118 T 220 112 L 220 200 L -20 200 Z" fill={sand3}/>
        {/* small pebble */}
        <ellipse cx="58" cy="138" rx="16" ry="6" fill={sand2} opacity="0.8"/>
        {/* thin yellow accent line, horizon glow */}
        <rect x="28" y="125" width="42" height="2" rx="1" fill={t.accent} opacity="0.85"/>
      </g>
    </svg>
  );
}

// --- Suggested prompt chip (big rectangular) ---

export interface SuggestedPromptProps {
  t: RuhiTheme;
  icon: IconName;
  label: string;
  code?: string;
}

export function SuggestedPrompt({ t, icon, label }: SuggestedPromptProps) {
  return (
    <div style={{
      flex: 1, padding: '12px 14px',
      background: t.surface, border: `1px solid ${t.borderSubtle}`,
      borderRadius: 10, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 10,
      minWidth: 0,
    }}>
      <RuhiIcon name={icon} size={14} color={t.textMuted} strokeWidth={1.6}/>
      <div style={{
        fontFamily: RUHI_FONTS.body, fontSize: 13, fontWeight: 500,
        color: t.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', lineHeight: 1.3,
      }}>{label}</div>
    </div>
  );
}

// --- Precision primitives ---

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface TickCornerProps {
  t: RuhiTheme;
  corner?: Corner;
  size?: number;
  color?: string;
}

export function TickCorner({ t, corner = 'tl', size = 10, color }: TickCornerProps) {
  const c = color || t.textMuted;
  const pos: Record<Corner, CSSProperties> = {
    tl: { top: 6, left: 6, transform: 'rotate(0deg)' },
    tr: { top: 6, right: 6, transform: 'rotate(90deg)' },
    bl: { bottom: 6, left: 6, transform: 'rotate(-90deg)' },
    br: { bottom: 6, right: 6, transform: 'rotate(180deg)' },
  };
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{
      position: 'absolute', pointerEvents: 'none', opacity: 0.55,
      ...pos[corner],
    }}>
      <path d="M 0 3 L 0 0 L 3 0" fill="none" stroke={c} strokeWidth="1"/>
    </svg>
  );
}

export interface FrameTicksProps {
  t: RuhiTheme;
  color?: string;
  size?: number;
}

export function FrameTicks({ t, color, size = 10 }: FrameTicksProps) {
  return (
    <>
      <TickCorner t={t} corner="tl" color={color} size={size}/>
      <TickCorner t={t} corner="tr" color={color} size={size}/>
      <TickCorner t={t} corner="bl" color={color} size={size}/>
      <TickCorner t={t} corner="br" color={color} size={size}/>
    </>
  );
}

// Monospace label with rule - used as precision section header

export type MonoTone = 'muted' | 'accent' | 'primary';

export interface MonoLabelProps {
  t: RuhiTheme;
  children: ReactNode;
  code?: string;
  tone?: MonoTone;
  right?: ReactNode;
  style?: CSSProperties;
}

export function MonoLabel({ t, children, code, tone = 'muted', right, style = {} }: MonoLabelProps) {
  const color = tone === 'accent' ? t.accent : (tone === 'primary' ? t.textSecondary : t.textMuted);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: RUHI_FONTS.mono, fontSize: 10.5, fontWeight: 500,
      color, letterSpacing: 1.2, textTransform: 'uppercase',
      ...style,
    }}>
      {code && <span style={{ color: t.textMuted, opacity: 0.8 }}>{code}</span>}
      <span>{children}</span>
      <div style={{ flex: 1, height: 1, background: t.borderSubtle }}/>
      {right && <span style={{ color: t.textMuted }}>{right}</span>}
    </div>
  );
}

// Tight data stat pair - label stacked on value, monospace

export interface MonoStatProps {
  t: RuhiTheme;
  label: string;
  value: string | number;
  tone?: 'default' | 'accent';
  code?: string;
}

export function MonoStat({ t, label, value, tone = 'default', code }: MonoStatProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{
        fontFamily: RUHI_FONTS.mono, fontSize: 9.5, fontWeight: 500,
        color: t.textMuted, letterSpacing: 1, textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        {code && <span style={{ opacity: 0.6 }}>{code}</span>}
        {label}
      </div>
      <div style={{
        fontFamily: RUHI_FONTS.display, fontSize: 20, fontWeight: 600,
        color: tone === 'accent' ? t.accent : t.textPrimary,
        letterSpacing: -0.3, lineHeight: 1,
      }}>{value}</div>
    </div>
  );
}

// Sharp coordinate-prefixed caption

export interface CoordLabelProps {
  t: RuhiTheme;
  prefix?: string;
  children: ReactNode;
  tone?: 'muted' | 'accent';
}

export function CoordLabel({ t, prefix = 'R/01', children, tone = 'muted' }: CoordLabelProps) {
  return (
    <span style={{
      fontFamily: RUHI_FONTS.mono, fontSize: 10, fontWeight: 500,
      color: tone === 'accent' ? t.accent : t.textMuted,
      letterSpacing: 1, textTransform: 'uppercase',
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{
        padding: '2px 5px', borderRadius: 2,
        background: tone === 'accent' ? t.accentMutedBg : (t === RUHI_DARK ? 'rgba(255,255,255,0.04)' : 'rgba(10,10,10,0.04)'),
        border: `1px solid ${tone === 'accent' ? t.accent + '40' : t.borderSubtle}`,
        color: tone === 'accent' ? t.accent : t.textSecondary,
      }}>{prefix}</span>
      {children}
    </span>
  );
}

// Tiny cross/plus marker - used to denote alignment / selection

export interface CrossMarkProps {
  t: RuhiTheme;
  size?: number;
  color?: string;
}

export function CrossMark({ t, size = 10, color }: CrossMarkProps) {
  const c = color || t.accent;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ display: 'block', flexShrink: 0 }}>
      <path d={`M 5 0 L 5 10 M 0 5 L 10 5`} stroke={c} strokeWidth="1"/>
    </svg>
  );
}

// Segmented meter - renders N blocks, filled = active

export interface SegmentBarProps {
  t: RuhiTheme;
  value?: number;
  segments?: number;
  color?: string;
  height?: number;
}

export function SegmentBar({ t, value = 0.6, segments = 12, color, height = 6 }: SegmentBarProps) {
  const filled = Math.round(value * segments);
  const c = color || t.accent;
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: segments }).map((_, i) => (
        <div key={i} style={{
          width: 6, height,
          background: i < filled ? c : (t === RUHI_DARK ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,10,0.08)'),
          borderRadius: 1,
        }}/>
      ))}
    </div>
  );
}

// --- Screen frame (desktop artboard with title bar) ---

export interface DesktopFrameProps {
  t: RuhiTheme;
  width?: number;
  height?: number;
  children: ReactNode;
  theme?: string;
}

export function DesktopFrame({ t, width = 1280, height = 800, children }: DesktopFrameProps) {
  return (
    <div style={{
      width, height, background: t.bg, overflow: 'hidden',
      fontFamily: RUHI_FONTS.body, color: t.textPrimary,
      position: 'relative',
    }}>
      {children}
    </div>
  );
}

export interface MobileFrameProps {
  t: RuhiTheme;
  width?: number;
  height?: number;
  children: ReactNode;
}

export function MobileFrame({ t, width = 390, height = 844, children }: MobileFrameProps) {
  return (
    <div style={{
      width, height, background: t.bg, overflow: 'hidden',
      fontFamily: RUHI_FONTS.body, color: t.textPrimary,
      position: 'relative',
    }}>
      {/* status bar */}
      <div style={{
        height: 44, padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600,
        color: t.textPrimary,
      }}>
        <span>9:41</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textPrimary }}>
          <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor"><rect x="0" y="7" width="2" height="3" rx="0.5"/><rect x="4" y="5" width="2" height="5" rx="0.5"/><rect x="8" y="3" width="2" height="7" rx="0.5"/><rect x="12" y="0" width="2" height="10" rx="0.5"/></svg>
          <svg width="14" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="3" width="11" height="6" rx="1"/><rect x="2" y="4.5" width="8" height="3" fill="currentColor" rx="0.5"/><rect x="13" y="4.5" width="1.5" height="3" rx="0.5" fill="currentColor"/></svg>
        </div>
      </div>
      <div style={{ height: height - 44, overflow: 'hidden', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}
