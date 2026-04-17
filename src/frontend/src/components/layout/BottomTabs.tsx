import { MessageSquare, ListTodo, FolderOpen, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui'

type TabKey = 'chat' | 'tasks' | 'vault' | 'settings'

interface TabItem {
  key: TabKey
  icon: typeof MessageSquare
  label: string
}

const tabs: TabItem[] = [
  { key: 'chat', icon: MessageSquare, label: 'Chat' },
  { key: 'tasks', icon: ListTodo, label: 'Tasks' },
  { key: 'vault', icon: FolderOpen, label: 'Vault' },
  { key: 'settings', icon: Settings, label: 'Settings' },
]

export function BottomTabs() {
  const activeTab = useUIStore((s) => s.activeTab)
  const setActiveTab = useUIStore((s) => s.setActiveTab)

  return (
    <nav
      className={cn(
        'fixed bottom-0 inset-x-0 z-50 lg:hidden',
        'h-14 bg-card/95 backdrop-blur-xl',
        'border-t border-border',
        'flex items-center justify-around',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.key

        return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-1',
              'flex-1 h-full',
              'transition-colors duration-150 ease-out',
              'active:scale-95 transform',
              'focus-visible:outline-none',
            )}
          >
            <Icon
              size={20}
              strokeWidth={isActive ? 2 : 1.5}
              className={cn(
                'transition-colors duration-150 ease-out',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            />
            {isActive && (
              <span className="text-[10px] font-medium leading-none text-primary">
                {tab.label}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
