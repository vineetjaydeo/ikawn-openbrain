import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Plus,
  Search,
  LayoutDashboard,
  FileText,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import { ConversationList } from '@/components/chat/ConversationList'
import { getInitials, type User } from '@/hooks/useAuth'
import type { Conversation } from '@/components/chat/ConversationItem'

interface ChatSidebarProps {
  user: User | null
  conversations: Conversation[]
  onNewChat: () => void
  onRename: (id: string, newTitle: string) => void
  onDelete: (id: string) => void
  onLogout: () => void
}

const navItems = [
  { icon: Plus, label: 'New Chat', action: 'new-chat' as const },
  { icon: Search, label: 'Search', path: '/chat' },
  { icon: LayoutDashboard, label: 'Mission Control', path: '/mission' },
  { icon: FileText, label: 'Reports', path: '/reports' },
  { icon: Settings, label: 'Settings', path: '/admin/settings' },
]

export function ChatSidebar({ user, conversations, onNewChat, onRename, onDelete, onLogout }: ChatSidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { sidebarExpanded, setSidebarExpanded, toggleSidebar, isMobile } = useUIStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchVisible, setSearchVisible] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) setSidebarExpanded(false)
  }, [location.pathname, isMobile, setSidebarExpanded])

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations
    const q = searchQuery.toLowerCase()
    return conversations.filter(
      (c) => c.title?.toLowerCase().includes(q)
    )
  }, [conversations, searchQuery])

  // Focus search input when search becomes visible
  useEffect(() => {
    if (searchVisible) {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
  }, [searchVisible])

  function handleNavClick(item: (typeof navItems)[number]) {
    if (item.action === 'new-chat') {
      onNewChat()
      return
    }
    if (item.path) navigate(item.path)
  }

  function isNavActive(item: (typeof navItems)[number]) {
    if (!item.path) return false
    return location.pathname.startsWith(item.path)
  }

  const initials = user ? getInitials(user.name) : '?'

  return (
    <>
      {/* Mobile hamburger button — fixed top-left on mobile */}
      {isMobile && !sidebarExpanded && (
        <button
          onClick={() => setSidebarExpanded(true)}
          className="fixed top-3 left-3 z-50 flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--surface-1)] border border-[hsl(var(--border))] text-[var(--text-secondary)] transition-all duration-200 hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
          aria-label="Open menu"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
      )}

      {/* Backdrop for mobile */}
      {isMobile && sidebarExpanded && (
        <div
          className="fixed inset-0 z-40 bg-black/50 animate-in fade-in-0 duration-200"
          onClick={() => setSidebarExpanded(false)}
        />
      )}

      {/* Rail — always visible on desktop, hidden on mobile */}
      <div
        className={cn(
          'fixed left-0 top-0 bottom-0 z-50 flex w-12 flex-col items-center border-r border-[hsl(var(--border))] bg-[rgb(8,8,8)] py-3',
          isMobile && 'hidden',
        )}
        onMouseEnter={() => { if (!isMobile) setSidebarExpanded(true) }}
      >
        {/* Logo */}
        <button
          onClick={toggleSidebar}
          className="mb-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--gold)] text-[1.1rem] font-bold text-[rgb(5,5,5)] transition-transform duration-200 hover:scale-105"
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {'\u2726'}
        </button>

        {/* Nav icons */}
        <nav className="flex flex-1 flex-col items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavClick(item)}
              title={item.label}
              aria-label={item.label}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--text-tertiary)] transition-all duration-150',
                'hover:bg-[var(--surface-3)] hover:text-[var(--text)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40',
                isNavActive(item) && 'bg-[var(--surface-3)] text-[var(--text)]',
                item.action === 'new-chat' && 'text-[var(--gold)] hover:text-[var(--gold-hover)]',
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
            </button>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="mt-auto flex flex-col items-center gap-1">
          <button
            onClick={toggleSidebar}
            title={sidebarExpanded ? 'Collapse' : 'Expand'}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--text-tertiary)] transition-all duration-200 hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40"
          >
            {sidebarExpanded ? (
              <PanelLeftClose className="h-[18px] w-[18px]" />
            ) : (
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowUserMenu((p) => !p)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--border))] text-[0.65rem] font-semibold text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--surface-3)]"
              title={user?.name || 'Account'}
            >
              {initials}
            </button>

            {showUserMenu && (
              <div className="absolute bottom-9 left-0 z-50 w-36 rounded-lg border border-[hsl(var(--border))] bg-[var(--surface-1)] py-1 shadow-xl" role="menu">
                <div className="px-3 py-1.5 text-xs text-[var(--text-tertiary)] truncate">
                  {user?.email}
                </div>
                <div className="mx-2 my-1 h-px bg-[hsl(var(--border))]" />
                <button
                  onClick={() => {
                    setShowUserMenu(false)
                    navigate('/admin/settings')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors"
                >
                  <Settings className="h-3 w-3" />
                  Settings
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false)
                    onLogout()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-red-400 transition-colors"
                >
                  <LogOut className="h-3 w-3" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel — slides out from rail */}
      <div
        className={cn(
          'fixed top-0 bottom-0 z-50 flex flex-col border-r border-[hsl(var(--border))] bg-[var(--surface-1)] transition-all duration-250',
          isMobile
            ? 'left-0 w-[270px]'
            : 'left-12 w-[220px]',
          sidebarExpanded
            ? 'translate-x-0 opacity-100'
            : '-translate-x-full opacity-0 pointer-events-none',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        onMouseLeave={() => { if (!isMobile) setSidebarExpanded(false) }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2.5">
          <div
            className="flex items-center gap-2 text-[0.95rem] font-semibold text-[var(--text)]"
            style={{ fontFamily: "'Parkinsans', 'Google Sans', sans-serif" }}
          >
            {isMobile && <span className="text-[var(--gold)]">{'\u2726'}</span>}
            Lucy
          </div>
          <button
            onClick={() => setSidebarExpanded(false)}
            className="flex items-center rounded-md p-1 text-[0.8rem] text-[var(--text-tertiary)] transition-colors duration-200 hover:text-[var(--text)]"
          >
            {isMobile ? <X className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {/* New chat button */}
        <div className="px-2 pb-2">
          <button
            onClick={onNewChat}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[0.82rem] font-medium text-[var(--gold)] transition-all duration-200 hover:bg-[rgba(255,192,28,0.08)]"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>

        {/* Nav items in panel */}
        <nav className="flex flex-col gap-0.5 px-2 pb-2">
          {navItems
            .filter((i) => i.path && i.action !== 'new-chat')
            .map((item) => (
              <button
                key={item.label}
                onClick={() => handleNavClick(item)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.82rem] font-medium text-[var(--text-secondary)] transition-all duration-200',
                  'hover:bg-[var(--surface-3)] hover:text-[var(--text)]',
                  isNavActive(item) && 'bg-[var(--surface-3)] text-[var(--text)]',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            ))}
        </nav>

        <div className="mx-3 h-px bg-[hsl(var(--border))]" />

        {/* Section label + search toggle */}
        <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1">
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            Conversations
          </span>
          <button
            onClick={() => {
              setSearchVisible((v) => !v)
              if (searchVisible) setSearchQuery('')
            }}
            className="flex items-center justify-center w-5 h-5 rounded text-[var(--text-tertiary)] hover:text-[var(--text)] transition-colors duration-200"
            title="Search conversations"
          >
            {searchVisible ? <X className="h-3 w-3" /> : <Search className="h-3 w-3" />}
          </button>
        </div>

        {/* Search input */}
        {searchVisible && (
          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-tertiary)]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchQuery('')
                    setSearchVisible(false)
                  }
                }}
                placeholder="Search..."
                className="w-full bg-[var(--surface-2)] border border-[hsl(var(--border))] rounded-lg pl-7 pr-3 py-1.5 text-[0.78rem] text-[var(--text)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[rgb(55,55,55)] transition-colors duration-200"
              />
            </div>
          </div>
        )}

        {/* Conversation list */}
        <ConversationList
          conversations={filteredConversations}
          onRename={onRename}
          onDelete={onDelete}
        />

        {/* Panel footer */}
        <div className="border-t border-[hsl(var(--border))] px-3.5 py-2.5">
          <div className="truncate text-[0.75rem] text-[var(--text-secondary)]">
            {user?.name}
          </div>
          <div className="truncate text-[0.65rem] text-[var(--text-tertiary)]">
            {user?.email}
          </div>
        </div>
      </div>
    </>
  )
}
