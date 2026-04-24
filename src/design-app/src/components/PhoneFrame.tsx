import type { ReactElement } from 'react';

interface PhoneFrameProps {
  children: ReactElement;
}

export const PHONE_FRAME_SIZING = {
  screenWidthVar: '--size-preview-mobile-width',
  screenHeightVar: '--size-preview-mobile-height',
  bezelWidthVar: '--border-width-phone-bezel',
  bodyColorVar: '--color-phone-body',
  islandColorVar: '--color-phone-island',
  islandWidthVar: '--size-preview-mobile-island-width',
  islandHeightVar: '--size-preview-mobile-island-height',
  expectedScreenWidthPx: 375,
  expectedScreenHeightPx: 812,
  expectedBezelWidthPx: 3,
  get expectedFrameWidthPx(): number {
    return this.expectedScreenWidthPx + this.expectedBezelWidthPx * 2;
  },
  get expectedFrameHeightPx(): number {
    return this.expectedScreenHeightPx + this.expectedBezelWidthPx * 2;
  },
} as const;

export const PHONE_FRAME_TEST_IDS = {
  body: 'phone-frame-body',
  dynamicIsland: 'phone-frame-dynamic-island',
} as const;

export function PhoneFrame({ children }: PhoneFrameProps): ReactElement {
  return (
    <div
      data-testid={PHONE_FRAME_TEST_IDS.body}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        position: 'relative',
        flexShrink: 0,
        boxSizing: 'content-box',
        padding: 'var(--border-width-phone-bezel, 3px)',
        borderRadius: 'var(--radius-phone, 40px)',
        background: 'var(--color-phone-body, #1a1a1a)',
        boxShadow: 'var(--shadow-elevated, 0 8px 30px rgba(0,0,0,0.12))',
      }}
    >
      {/* Screen */}
      <div
        style={{
          position: 'relative',
          width: 'var(--size-preview-mobile-width, 375px)',
          height: 'var(--size-preview-mobile-height, 812px)',
          flexShrink: 0,
          overflow: 'hidden',
          background: '#ffffff',
          borderRadius: 'calc(var(--radius-phone, 40px) - var(--border-width-phone-bezel, 3px))',
        }}
      >
        {children}
      </div>
      {/* Dynamic Island */}
      <div
        data-testid={PHONE_FRAME_TEST_IDS.dynamicIsland}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 'var(--space-2, 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'var(--size-preview-mobile-island-width, 120px)',
          height: 'var(--size-preview-mobile-island-height, 36px)',
          background: 'var(--color-phone-island, #000)',
          borderRadius: 'var(--radius-full, 9999px)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      {/* Home indicator */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 'var(--space-2, 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'var(--size-preview-mobile-home-indicator-width, 140px)',
          height: 'var(--size-preview-mobile-home-indicator-height, 5px)',
          background: 'var(--color-phone-island, #000)',
          borderRadius: 'var(--radius-full, 9999px)',
          opacity: 0.5,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
