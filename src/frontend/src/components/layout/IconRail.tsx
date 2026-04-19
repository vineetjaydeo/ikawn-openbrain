import { MessageSquare, Brain, FolderOpen, ListTodo, Settings } from 'lucide-react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'

type TabKey = 'chat' | 'memory' | 'vault' | 'tasks' | 'settings'

interface NavItem {
  key: TabKey
  icon: typeof MessageSquare
  label: string
}

const navItems: NavItem[] = [
  { key: 'chat', icon: MessageSquare, label: 'Chat' },
  { key: 'memory', icon: Brain, label: 'Memory' },
  { key: 'vault', icon: FolderOpen, label: 'Vault' },
  { key: 'tasks', icon: ListTodo, label: 'Tasks' },
  { key: 'settings', icon: Settings, label: 'Settings' },
]

const tabRoutes: Record<TabKey, string> = {
  chat: '/chat',
  memory: '/memory',
  vault: '/vault',
  tasks: '/tasks',
  settings: '/settings',
}

function getInitials(name?: string): string {
  if (!name) return 'U'
  return name
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getAvatarColor(name?: string): string {
  if (!name) return '#6B6B6B'
  const colors = ['#E07C4F', '#7C4FE0', '#4FE07C', '#E04F7C', '#4F7CE0', '#E0C04F']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export function IconRail() {
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const routerState = useRouterState()

  const currentPath = routerState.location.pathname
  const derivedActiveTab: TabKey = currentPath.startsWith('/settings')
    ? 'settings'
    : currentPath.startsWith('/tasks')
      ? 'tasks'
      : currentPath.startsWith('/vault')
        ? 'vault'
        : currentPath.startsWith('/memory')
          ? 'memory'
          : 'chat'

  const handleNav = (key: TabKey) => {
    setActiveTab(key)
    navigate({ to: tabRoutes[key] })
  }

  return (
    <nav
      className="hidden lg:flex flex-col flex-shrink-0"
      style={{
        width: 240,
        height: '100%',
        background: '#0A0A0A',
        borderRight: '1px solid #2A2A2A',
        padding: '20px 12px 16px',
      }}
    >
      {/* Brand wordmark */}
      <div
        className="flex items-center"
        style={{ padding: '0 8px', marginBottom: 16 }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: '#0A0A0A',
            border: '1px solid #3A3A3A',
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              background: '#FFC01C',
              borderRadius: 1,
            }}
          />
        </div>
        <span
          style={{
            fontFamily: 'Parkinsans, sans-serif',
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: -0.5,
            color: '#F5F5F5',
            marginLeft: 8,
          }}
        >
          ruhi
        </span>
        <span
          className="ml-auto"
          style={{
            fontFamily: 'monospace',
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: 0.8,
            color: '#6B6B6B',
          }}
        >
          v3.1
        </span>
      </div>

      {/* Brand switcher */}
      <div
        style={{
          background: '#161616',
          border: '1px solid #2A2A2A',
          borderRadius: 10,
          padding: '10px 12px',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: '#F5F5F5',
            lineHeight: 1.3,
          }}
        >
          Lucy
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#6B6B6B',
            lineHeight: 1.3,
            marginTop: 2,
          }}
        >
          R&D Assistant
        </div>
      </div>

      {/* Section label */}
      <div
        style={{
          padding: '10px 12px 6px',
          fontSize: 11,
          fontWeight: 500,
          color: '#6B6B6B',
          letterSpacing: 0.4,
        }}
      >
        Workspace
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const isActive = derivedActiveTab === item.key
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => handleNav(item.key)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex items-center w-full cursor-pointer border-none outline-none',
                'transition-colors duration-150 ease-out',
              )}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 8,
                gap: 10,
                background: isActive ? '#161616' : 'transparent',
                color: isActive ? '#F5F5F5' : '#A8A8A8',
                fontSize: 13,
                fontWeight: isActive ? 500 : 400,
              }}
            >
              {isActive && (
                <span
                  style={{
                    position: 'absolute',
                    left: -12,
                    top: 6,
                    bottom: 6,
                    width: 2,
                    background: '#FFC01C',
                    borderRadius: 1,
                  }}
                />
              )}
              <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
              {item.label}
            </button>
          )
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User block */}
      <div
        className="flex items-center"
        style={{
          padding: '10px 12px',
          borderRadius: 10,
          background: '#161616',
          border: '1px solid #2A2A2A',
          gap: 10,
        }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: getAvatarColor(user?.name),
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {getInitials(user?.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: '#F5F5F5',
              lineHeight: 1.3,
            }}
          >
            {user?.name ?? 'User'}
          </div>
          <div
            className="truncate"
            style={{
              fontSize: 11,
              color: '#6B6B6B',
              lineHeight: 1.3,
              marginTop: 1,
            }}
          >
            {user?.role ?? user?.email ?? ''}
          </div>
        </div>
      </div>
    </nav>
  )
}
