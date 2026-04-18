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
        'h-[3.25rem] bg-[#111113]/95 backdrop-blur-2xl',
        'border-t border-[rgba(255,255,255,0.06)] shadow-[0_-4px_20px_rgba(0,0,0,0.3)]',
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
              'transition-all duration-150 ease-out',
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
              <span className="h-1 w-1 rounded-full bg-primary" />
            )}
          </button>
        )
      })}
    </nav>
  )
}
