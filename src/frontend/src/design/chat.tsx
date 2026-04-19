// Chat components: LeftRail, ChatHeader, Message, Composer, MemoryRecallRail

import React, { useState } from 'react';
import { type RuhiTheme, RUHI_DARK, RUHI_LIGHT, RUHI_FONTS } from './tokens';
import {
  RuhiMark,
  RuhiButton,
  RuhiAvatar,
  UserAvatar,
  BrandDot,
  AccessBadge,
  CitationChip,
  HashtagChip,
  SuggestedPrompt,
  SegmentBar,
} from './components';
import { RuhiIcon, type IconName } from './icons';
import {
  BRANDS,
  SUGGESTED_PROMPTS,
  type ChatMessage as ChatMessageData,
  type MemoryRecallItem,
} from './data';

// ---- Types ----

export interface LeftRailProps {
  t: RuhiTheme;
  active?: string;
  collapsed?: boolean;
  onNavigate?: (screen: string) => void;
  mobile?: boolean;
}

export interface ChatHeaderProps {
  t: RuhiTheme;
  onToggleTheme?: () => void;
  theme?: string;
  brand?: string;
  right?: boolean;
  title?: string;
}

export interface IconButtonProps {
  t: RuhiTheme;
  icon: IconName;
  dot?: boolean;
  onClick?: () => void;
  active?: boolean;
}

export interface MessageProps {
  t: RuhiTheme;
  m: ChatMessageData;
  idx?: number;
}

export interface AgentAnswerBodyProps {
  t: RuhiTheme;
  m: ChatMessageData;
}

export interface TypingDotsProps {
  t: RuhiTheme;
}

export interface MemoryRecallRailProps {
  t: RuhiTheme;
  items: MemoryRecallItem[];
  onClose?: () => void;
  collapsed?: boolean;
}

export interface MemoryRecallCardProps {
  t: RuhiTheme;
  m: MemoryRecallItem;
  idx?: number;
}

export interface ComposerProps {
  t: RuhiTheme;
  suggestedPrompts?: boolean;
  mobile?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onSend?: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// ---- Left Rail ----

export function LeftRail({ t, active = 'chat', collapsed = false, onNavigate, mobile = false }: LeftRailProps) {
  const items: { id: string; icon: IconName; label: string; count?: number }[] = [
    { id: 'chat', icon: 'chat', label: 'Chat' },
    { id: 'memory', icon: 'memory', label: 'Memory' },
    { id: 'vault', icon: 'folder', label: 'Vault' },
    { id: 'tasks', icon: 'layers', label: 'Tasks' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
    { id: 'admin', icon: 'shield', label: 'Admin' },
  ];
  const currentBrand = BRANDS[0];
  const w = collapsed ? 64 : 240;
  return (
    <div style={{
      width: w, height: '100%', flexShrink: 0,
      borderRight: `1px solid ${t.borderSubtle}`,
      background: t.bg,
      display: 'flex', flexDirection: 'column',
      padding: '20px 12px 16px',
      transition: 'width .2s',
    }}>
      {/* Brand wordmark */}
      <div style={{ padding: '0 8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {!collapsed ? (
          <>
            <RuhiMark t={t} size={22}/>
            <div style={{ flex: 1 }}/>
            <div style={{
              fontFamily: RUHI_FONTS.mono, fontSize: 9.5, color: t.textMuted,
              letterSpacing: 0.8, fontWeight: 600,
            }}>v3.1</div>
          </>
        ) : (
          <div style={{
            width: 24, height: 24, borderRadius: 4,
            background: t === RUHI_DARK ? '#0A0A0A' : '#1A1A1A',
            margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${t === RUHI_DARK ? '#3A3A3A' : '#2A2A2A'}`,
          }}>
            <div style={{ width: 6, height: 6, background: t.accent }}/>
          </div>
        )}
      </div>

      {/* Brand switcher */}
      <div style={{
        padding: collapsed ? '8px 0' : '10px 12px',
        background: t.surface,
        border: `1px solid ${t.borderSubtle}`,
        borderRadius: 10, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer',
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        <BrandDot color={currentBrand.color} size={10}/>
        {!collapsed && <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: RUHI_FONTS.body, fontSize: 12.5, fontWeight: 600,
              color: t.textPrimary, letterSpacing: 0.1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{currentBrand.name}</div>
            <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted, marginTop: 1 }}>
              {currentBrand.industry}
            </div>
          </div>
          <RuhiIcon name="chevronDown" size={14} color={t.textMuted}/>
        </>}
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {!collapsed && <div style={{
          padding: '10px 12px 6px',
          fontFamily: RUHI_FONTS.body, fontSize: 11,
          color: t.textMuted, fontWeight: 500, letterSpacing: 0.4,
        }}>Workspace</div>}
        {items.map(it => {
          const isActive = active === it.id;
          return (
            <div key={it.id} onClick={() => onNavigate && onNavigate(it.id)} style={{
              height: 36, padding: collapsed ? 0 : '0 12px',
              display: 'flex', alignItems: 'center', gap: 10,
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 8, cursor: 'pointer',
              background: isActive ? t.surface : 'transparent',
              color: isActive ? t.textPrimary : t.textSecondary,
              position: 'relative',
            }}>
              {isActive && !collapsed && (
                <div style={{
                  position: 'absolute', left: -12, top: 6, bottom: 6, width: 2,
                  background: t.accent, borderRadius: 1,
                }}/>
              )}
              <RuhiIcon name={it.icon} size={16} color="currentColor"/>
              {!collapsed && <>
                <span style={{ flex: 1, fontFamily: RUHI_FONTS.body, fontSize: 13, fontWeight: isActive ? 500 : 400 }}>
                  {it.label}
                </span>
                {it.count != null && (
                  <span style={{
                    fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
                    background: isActive ? 'transparent' : 'transparent',
                  }}>{it.count}</span>
                )}
              </>}
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1 }}/>

      {/* User block */}
      {!collapsed && <div style={{
        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
        borderRadius: 10, background: t.surface, border: `1px solid ${t.borderSubtle}`,
      }}>
        <UserAvatar t={t} initials="AK" size={28} color="#5B6BFF"/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 12.5, fontWeight: 600, color: t.textPrimary }}>
            Amira Khalil
          </div>
          <div style={{ fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted }}>
            Chief Risk Officer
          </div>
        </div>
        <RuhiIcon name="chevronDown" size={14} color={t.textMuted}/>
      </div>}
    </div>
  );
}

// ---- Chat header ----

export function ChatHeader({ t, onToggleTheme, theme, brand, right = true, title }: ChatHeaderProps) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div style={{
      height: 60, padding: '0 28px', flexShrink: 0,
      borderBottom: `1px solid ${t.borderSubtle}`,
      display: 'flex', alignItems: 'center', gap: 16,
      background: t.bg, position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600,
          color: t.textPrimary, letterSpacing: 0.1,
        }}>{title || 'New conversation'}</div>
        <button
          onClick={() => setShowDetails(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', borderRadius: 999,
            background: 'transparent', border: `1px solid ${t.borderSubtle}`,
            fontFamily: RUHI_FONTS.body, fontSize: 11, color: t.textMuted,
            cursor: 'pointer',
          }}
        >
          {showDetails ? '10 msgs . 06:42 -> 07:08 . 212ms' : 'Details'}
        </button>
      </div>

      <div style={{ flex: 1 }}/>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconButton t={t} icon={theme === 'dark' ? 'sun' : 'moon'} onClick={onToggleTheme}/>
        <IconButton t={t} icon="bell" dot/>
        <div style={{ width: 1, height: 20, background: t.borderSubtle, margin: '0 4px' }}/>
        <UserAvatar t={t} initials="AK" size={30} color="#5B6BFF"/>
      </div>
    </div>
  );
}

export function IconButton({ t, icon, dot, onClick, active }: IconButtonProps) {
  return (
    <button onClick={onClick} style={{
      width: 34, height: 34, borderRadius: 8,
      background: active ? t.surface : 'transparent',
      border: `1px solid ${active ? t.borderSubtle : 'transparent'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', color: t.textSecondary, position: 'relative',
    }}>
      <RuhiIcon name={icon} size={16} color="currentColor"/>
      {dot && <span style={{
        position: 'absolute', top: 7, right: 8, width: 6, height: 6,
        borderRadius: 6, background: t.accent, border: `1.5px solid ${t.bg}`,
      }}/>}
    </button>
  );
}

// ---- Message ----

export function Message({ t, m, idx = 0 }: MessageProps) {
  // Support both design data (role:'agent', text) and API data (role:'assistant', content)
  const messageText = m.text || (m as any).content || '';
  const isUser = m.role === 'user';
  if (isUser) {
    return (
      <div style={{ display: 'flex', gap: 14, padding: '18px 0' }}>
        <UserAvatar t={t} initials="AK" size={30} color="#5B6BFF"/>
        <div style={{ flex: 1, paddingTop: 2 }}>
          <div style={{
            fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textMuted,
            marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <span style={{ fontWeight: 600, color: t.textSecondary }}>Amira</span>
            <span>06:43</span>
          </div>
          <div style={{
            fontFamily: RUHI_FONTS.body, fontSize: 14.5, lineHeight: 1.6,
            color: t.textPrimary,
          }}>{messageText}</div>
        </div>
      </div>
    );
  }

  // agent
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '18px 18px',
      background: t.surface, borderRadius: 12,
      border: `1px solid ${t.borderSubtle}`,
      margin: '8px 0', position: 'relative',
    }}>
      <RuhiAvatar t={t} size={30}/>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textMuted,
          marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span style={{ fontWeight: 600, color: t.textPrimary, letterSpacing: 0.1 }}>ruhi</span>
          <span>06:43</span>
        </div>

        {m.typing ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '6px 0' }}>
            <TypingDots t={t}/>
            <span style={{ fontFamily: RUHI_FONTS.body, fontSize: 13, color: t.textMuted, marginLeft: 6 }}>
              reading memories
            </span>
          </div>
        ) : (
          <AgentAnswerBody t={t} m={m}/>
        )}

        {m.footnote && !m.typing && !m.headline && (
          <div style={{
            marginTop: 12, display: 'flex', gap: 12, alignItems: 'center',
            fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RuhiIcon name="database" size={11} color={t.textMuted}/>
              {m.footnote}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentAnswerBody({ t, m }: AgentAnswerBodyProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      {m.headline && (
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: 17, fontWeight: 600,
          color: t.textPrimary, lineHeight: 1.35, letterSpacing: -0.1,
          marginBottom: expanded || !m.text ? 10 : 0,
        }}>{m.headline}</div>
      )}
      {!m.headline && m.text && (
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: 14.5, lineHeight: 1.65,
          color: t.textPrimary,
        }}>{m.text}</div>
      )}
      {m.headline && expanded && m.text && (
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: 14, lineHeight: 1.65,
          color: t.textSecondary, marginBottom: 10,
        }}>
          {m.text}{' '}
          {m.citations && m.citations.map((c, i) => (
            <React.Fragment key={i}>
              <CitationChip t={t} label={c.tag}/>{' '}
            </React.Fragment>
          ))}
        </div>
      )}
      {m.headline && m.text && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            marginTop: 8, padding: '4px 0',
            background: 'transparent', border: 'none',
            fontFamily: RUHI_FONTS.body, fontSize: 12.5, fontWeight: 500,
            color: t.textSecondary, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            letterSpacing: 0.1,
          }}
        >
          {expanded ? 'Hide detail' : 'Show detail'}
          <RuhiIcon name={expanded ? 'chevronUp' : 'chevronDown'} size={12} color="currentColor"/>
          {!expanded && m.citations && (
            <span style={{ color: t.textMuted, marginLeft: 6, fontSize: 11.5 }}>
              . {m.citations.length} {m.citations.length === 1 ? 'source' : 'sources'}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

export function TypingDots({ t }: TypingDotsProps) {
  const dot: React.CSSProperties = { width: 5, height: 5, borderRadius: 5, background: t.textMuted, animation: 'ruhi-blink 1.2s infinite' };
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <div style={{ ...dot, animationDelay: '0s' }}/>
      <div style={{ ...dot, animationDelay: '0.2s' }}/>
      <div style={{ ...dot, animationDelay: '0.4s' }}/>
    </div>
  );
}

// ---- Right rail: Memory recall ----

export function MemoryRecallRail({ t, items, onClose, collapsed }: MemoryRecallRailProps) {
  if (collapsed) return null;
  return (
    <div style={{
      width: 320, flexShrink: 0, height: '100%',
      borderLeft: `1px solid ${t.borderSubtle}`,
      background: t.bg,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: `1px solid ${t.borderSubtle}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: 14, fontWeight: 600,
          color: t.textPrimary, flex: 1, letterSpacing: 0.1,
        }}>Sources</div>
        <div style={{
          fontFamily: RUHI_FONTS.body, fontSize: 11.5, color: t.textMuted,
        }}>{items.length} pulled</div>
        <IconButton t={t} icon="close" onClick={onClose}/>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px 20px' }}>
        {items.map((m, i) => <MemoryRecallCard key={i} t={t} m={m} idx={i}/>)}
      </div>

      <div style={{
        padding: '12px 16px', borderTop: `1px solid ${t.borderSubtle}`,
      }}>
        <RuhiButton t={t} variant="secondary" size="sm" full iconRight="arrowRight">
          Open memory browser
        </RuhiButton>
      </div>
    </div>
  );
}

export function MemoryRecallCard({ t, m, idx = 0 }: MemoryRecallCardProps) {
  return (
    <div style={{
      padding: '12px 12px', marginTop: 6,
      borderRadius: 10,
      border: '1px solid transparent',
      cursor: 'pointer', position: 'relative',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.background = t.surface;
      (e.currentTarget as HTMLDivElement).style.borderColor = t.borderSubtle;
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
    }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <AccessBadge t={t} level={m.access} size="sm"/>
        <div style={{ flex: 1 }}/>
        <SegmentBar t={t} value={m.score} segments={5} color={t.accent} height={4}/>
      </div>
      <div style={{
        fontFamily: RUHI_FONTS.body, fontSize: 13, fontWeight: 500,
        color: t.textPrimary, lineHeight: 1.35, marginBottom: 4,
        letterSpacing: 0.05,
      }}>{m.title}</div>
      <div style={{
        fontFamily: RUHI_FONTS.body, fontSize: 12, color: t.textMuted,
        lineHeight: 1.5, marginBottom: 8,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{m.snippet}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {m.tags.slice(0, 3).map((tag, i) => (
          <HashtagChip key={i} t={t} label={tag}/>
        ))}
      </div>
    </div>
  );
}

// ---- Composer ----

export function Composer({ t, suggestedPrompts = true, mobile = false, value, onChange, onSend, disabled, placeholder }: ComposerProps) {
  const [localValue, setLocalValue] = useState('');
  const text = value !== undefined ? value : localValue;
  const setText = onChange || setLocalValue;
  const placeholderText = placeholder || 'Ask Lucy anything...';

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend?.(trimmed);
    if (!onChange) setLocalValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      padding: mobile ? '12px 14px 14px' : '14px 28px 22px',
      borderTop: `1px solid ${t.borderSubtle}`,
      background: t.bg, flexShrink: 0,
    }}>
      {suggestedPrompts && !mobile && !text && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {SUGGESTED_PROMPTS.map((p, i) => <SuggestedPrompt key={i} t={t} {...p}/>)}
        </div>
      )}
      <div style={{
        background: t.surface,
        border: `1px solid ${t.borderSubtle}`,
        borderRadius: 12, padding: mobile ? 10 : 12,
        boxShadow: t === RUHI_LIGHT ? '0 1px 2px rgba(0,0,0,0.03)' : 'none',
      }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          disabled={disabled}
          rows={1}
          style={{
            width: '100%', resize: 'none', border: 'none', outline: 'none',
            background: 'transparent',
            fontFamily: RUHI_FONTS.body, fontSize: 14.5, color: t.textPrimary,
            padding: '6px 4px 14px', minHeight: mobile ? 24 : 40,
            lineHeight: 1.5,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconButton t={t} icon="paperclip"/>
          <div style={{ flex: 1 }}/>
          <div style={{
            fontFamily: RUHI_FONTS.mono, fontSize: 11, color: t.textMuted, marginRight: 10,
          }}>Cmd+Enter</div>
          <RuhiButton t={t} variant="primary" size="sm" icon="send" onClick={handleSend}>
            Send
          </RuhiButton>
        </div>
      </div>
      <div style={{
        marginTop: 10, fontFamily: RUHI_FONTS.body, fontSize: 11,
        color: t.textMuted, textAlign: 'center',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <RuhiIcon name="lock" size={11} color={t.textMuted}/>
        Your data stays on this server. Nothing leaves your infrastructure.
      </div>
    </div>
  );
}
