// Thin-stroke icons, lucide-ish. 1.5px stroke.

import type { ReactNode } from 'react';

export type IconName =
  | 'chat' | 'memory' | 'brand' | 'knowledge' | 'insights' | 'settings'
  | 'send' | 'paperclip' | 'mic' | 'sun' | 'moon' | 'bell' | 'search'
  | 'hash' | 'chevronDown' | 'chevronUp' | 'chevronRight' | 'chevronLeft'
  | 'close' | 'plus' | 'check' | 'shield' | 'shieldCheck' | 'sparkles'
  | 'menu' | 'filter' | 'edit' | 'archive' | 'user' | 'users' | 'logout'
  | 'dot' | 'arrowRight' | 'database' | 'clock' | 'link' | 'trend'
  | 'lock' | 'sliders' | 'globe' | 'activity' | 'folder' | 'circle'
  | 'bookmark' | 'quote' | 'alert' | 'calendar' | 'layers';

export interface RuhiIconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function RuhiIcon({ name, size = 18, color = 'currentColor', strokeWidth = 1.5 }: RuhiIconProps) {
  const paths: Record<string, ReactNode> = {
    chat: <><path d="M21 12a8 8 0 0 1-11.4 7.3L3 21l1.7-6.6A8 8 0 1 1 21 12Z"/></>,
    memory: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></>,
    brand: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></>,
    knowledge: <><path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4Z"/><path d="M4 16a4 4 0 0 1 4-4h12"/></>,
    insights: <><path d="M3 3v18h18"/><path d="M7 14l4-4 4 3 5-6"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>,
    send: <><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7Z"/></>,
    paperclip: <><path d="M21 11.5 12.2 20.3a5.5 5.5 0 0 1-7.8-7.8L13.2 3.8a3.7 3.7 0 0 1 5.2 5.2L9.6 17.7a1.8 1.8 0 0 1-2.6-2.6l8-8"/></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>,
    hash: <><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></>,
    chevronDown: <><path d="m6 9 6 6 6-6"/></>,
    chevronUp: <><path d="m6 15 6-6 6 6"/></>,
    chevronRight: <><path d="m9 6 6 6-6 6"/></>,
    chevronLeft: <><path d="m15 6-6 6 6 6"/></>,
    close: <><path d="M18 6 6 18M6 6l12 12"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    check: <><path d="m5 12 5 5L20 7"/></>,
    shield: <><path d="M12 3 4 6v6a9 9 0 0 0 8 9 9 9 0 0 0 8-9V6l-8-3Z"/></>,
    shieldCheck: <><path d="M12 3 4 6v6a9 9 0 0 0 8 9 9 9 0 0 0 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    sparkles: <><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><path d="m6.3 6.3 2.4 2.4M15.3 15.3l2.4 2.4M6.3 17.7l2.4-2.4M15.3 8.7l2.4-2.4"/></>,
    menu: <><path d="M3 6h18M3 12h18M3 18h18"/></>,
    filter: <><path d="M3 5h18l-7 9v6l-4-2v-4Z"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
    archive: <><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    users: <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>,
    dot: <><circle cx="12" cy="12" r="4" fill={color} stroke="none"/></>,
    arrowRight: <><path d="M5 12h14M13 5l7 7-7 7"/></>,
    database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    link: <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></>,
    trend: <><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></>,
    lock: <><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
    sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
    activity: <><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>,
    folder: <><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></>,
    circle: <><circle cx="12" cy="12" r="9"/></>,
    bookmark: <><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></>,
    quote: <><path d="M6 8h4v4a4 4 0 0 1-4 4M14 8h4v4a4 4 0 0 1-4 4"/></>,
    alert: <><path d="M12 3 2 20h20Z"/><path d="M12 10v5M12 18.5v.1"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5M3 18l9 5 9-5"/></>,
  };

  const p = paths[name];
  if (!p) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {p}
    </svg>
  );
}
