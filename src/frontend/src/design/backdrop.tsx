// Subtle background textures - spacetime grid, dot grid, diffused gradients
// All absolute-positioned with pointerEvents:none; pair with position:relative parent.

import type { ReactNode } from 'react';
import { RUHI_DARK, RUHI_FONTS, type RuhiTheme } from './tokens';
import { RuhiIcon } from './icons';

// --- SpacetimeGrid ---

export interface SpacetimeGridProps {
  t: RuhiTheme;
  opacity?: number;
}

export function SpacetimeGrid({ t, opacity = 1 }: SpacetimeGridProps) {
  const isDark = t === RUHI_DARK;
  const line = isDark ? 'rgba(255,255,255,0.035)' : 'rgba(10,10,10,0.04)';
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
      opacity,
    }}>
      <div style={{
        position: 'absolute', inset: '-20% -10%',
        backgroundImage: `
          linear-gradient(to right, ${line} 1px, transparent 1px),
          linear-gradient(to bottom, ${line} 1px, transparent 1px)
        `,
        backgroundSize: '56px 56px',
        maskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, black 40%, transparent 90%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, black 40%, transparent 90%)',
        transform: 'perspective(900px) rotateX(55deg) translateY(20%) scale(1.4)',
        transformOrigin: '50% 50%',
      }}/>
    </div>
  );
}

// --- DotGrid ---

export interface DotGridProps {
  t: RuhiTheme;
  opacity?: number;
  size?: number;
}

export function DotGrid({ t, opacity = 1, size = 22 }: DotGridProps) {
  const isDark = t === RUHI_DARK;
  const dot = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(10,10,10,0.05)';
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      opacity,
      backgroundImage: `radial-gradient(circle, ${dot} 1px, transparent 1px)`,
      backgroundSize: `${size}px ${size}px`,
      maskImage: 'radial-gradient(ellipse 80% 80% at 50% 40%, black 40%, transparent 90%)',
      WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 40%, black 40%, transparent 90%)',
    }}/>
  );
}

// --- DiffuseGradient ---

export type GradientVariant = 'center' | 'topLeft' | 'diagonal' | 'subtle';

export interface DiffuseGradientProps {
  t: RuhiTheme;
  variant?: GradientVariant;
  opacity?: number;
}

export function DiffuseGradient({ t, variant = 'center', opacity = 1 }: DiffuseGradientProps) {
  const isDark = t === RUHI_DARK;
  const amber = isDark ? 'rgba(255,192,28,0.07)' : 'rgba(255,192,28,0.14)';
  const navy = isDark ? 'rgba(99,117,255,0.06)' : 'rgba(10,15,46,0.05)';
  const variants: Record<GradientVariant, string> = {
    center: `radial-gradient(ellipse 80% 60% at 50% 48%, ${amber}, transparent 70%)`,
    topLeft: `radial-gradient(ellipse 60% 50% at 10% 0%, ${amber}, transparent 60%), radial-gradient(ellipse 60% 50% at 100% 100%, ${navy}, transparent 60%)`,
    diagonal: `radial-gradient(ellipse 50% 40% at 5% 10%, ${amber}, transparent 60%), radial-gradient(ellipse 50% 40% at 95% 90%, ${navy}, transparent 60%)`,
    subtle: `radial-gradient(ellipse 70% 60% at 50% 0%, ${amber}, transparent 70%)`,
  };
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: variants[variant], opacity,
    }}/>
  );
}

// Combined spacetime texture used behind hero surfaces

export type SpacetimeVariant = 'dots' | 'grid';

export interface SpacetimeProps {
  t: RuhiTheme;
  variant?: SpacetimeVariant;
}

export function Spacetime({ t, variant = 'dots' }: SpacetimeProps) {
  return (
    <>
      <DiffuseGradient t={t} variant="diagonal" opacity={0.9}/>
      {variant === 'dots' && <DotGrid t={t} opacity={0.7}/>}
      {variant === 'grid' && <SpacetimeGrid t={t} opacity={0.7}/>}
    </>
  );
}

// --- iKawn OS footer badge ---

export interface IKawnGlyphProps {
  t: RuhiTheme;
  size?: number;
}

export function IKawnGlyph({ t, size = 14 }: IKawnGlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <rect x="2" y="2" width="10" height="10" rx="2" transform="rotate(45 7 7)"
        fill="none" stroke={t.accent} strokeWidth="1.6"/>
      <circle cx="7" cy="7" r="1.6" fill={t.accent}/>
    </svg>
  );
}

export type FooterVariant = 'default' | 'minimal';

export interface IKawnFooterProps {
  t: RuhiTheme;
  variant?: FooterVariant;
}

export function IKawnFooter({ t, variant = 'default' }: IKawnFooterProps) {
  if (variant === 'minimal') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: RUHI_FONTS.body, fontSize: 10.5,
        color: t.textMuted, letterSpacing: 0.4,
      }}>
        <span style={{
          display: 'inline-block', width: 5, height: 5, borderRadius: 5,
          background: t.accent,
        }}/>
        Powered by iKawn OS
      </div>
    );
  }
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', borderRadius: 999,
      background: t === RUHI_DARK ? 'rgba(255,255,255,0.03)' : 'rgba(10,10,10,0.03)',
      border: `1px solid ${t.borderSubtle}`,
      fontFamily: RUHI_FONTS.body, fontSize: 11, fontWeight: 500,
      color: t.textMuted, letterSpacing: 0.3,
    }}>
      <IKawnGlyph t={t} size={12}/>
      Powered by iKawn OS
    </div>
  );
}

// --- Status badges (success / error / neutral) ---

export type StatusTone = 'success' | 'error' | 'neutral' | 'warning';

export interface StatusPillProps {
  t: RuhiTheme;
  tone?: StatusTone;
  children: ReactNode;
  icon?: string;
}

export function StatusPill({ t, tone = 'success', children, icon }: StatusPillProps) {
  const tones: Record<StatusTone, { bg: string; fg: string; border: string }> = {
    success: { bg: t.successBg, fg: t === RUHI_DARK ? t.success : '#2A6B35', border: t.successBorder },
    error:   { bg: t.dangerBg,  fg: t === RUHI_DARK ? t.danger  : '#8A1F14', border: t.dangerBorder  },
    neutral: { bg: t.badgePrivate.bg, fg: t.badgePrivate.fg, border: t.badgePrivate.border },
    warning: { bg: t.accentMutedBg, fg: t.accentMutedText, border: `${t.accent}30` },
  };
  const c = tones[tone];
  const iconFallback: Record<StatusTone, string> = { success: 'check', error: 'alert', neutral: 'dot', warning: 'alert' };
  const iconName = (icon || iconFallback[tone]) as import('./icons').IconName;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      height: 22, padding: '0 9px',
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      borderRadius: 999,
      fontFamily: RUHI_FONTS.body, fontSize: 11.5, fontWeight: 600,
      letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      <RuhiIcon name={iconName} size={11} color="currentColor" strokeWidth={1.8}/>
      {children}
    </span>
  );
}
