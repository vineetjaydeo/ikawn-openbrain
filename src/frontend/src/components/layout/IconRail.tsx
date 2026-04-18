import { MessageSquare, ListTodo, FolderOpen, Settings, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

type TabKey = 'chat' | 'tasks' | 'vault' | 'settings'

interface NavItem {
  key: TabKey
  icon: typeof MessageSquare
  label: string
}

const navItems: NavItem[] = [
  { key: 'chat', icon: MessageSquare, label: 'Chat' },
  { key: 'tasks', icon: ListTodo, label: 'Tasks' },
  { key: 'vault', icon: FolderOpen, label: 'Vault' },
]

function NavButton({
  item,
  isActive,
  onClick,
}: {
  item: NavItem
  isActive: boolean
  onClick: () => void
}) {
  const Icon = item.icon

  return (
    <div className="relative w-full flex items-center justify-center">
      <span
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full',
          'bg-primary transition-opacity duration-150 ease-out',
          isActive ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={onClick}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'transition-colors duration-150 ease-out active:scale-95',
                isActive
                  ? 'text-primary hover:text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            />
          }
        >
          <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    </div>
  )
}

export function IconRail() {
  const activeTab = useUIStore((s) => s.activeTab)
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const user = useAuthStore((s) => s.user)

  return (
    <nav
      className={cn(
        'hidden lg:flex flex-col items-center w-16 h-full flex-shrink-0',
        'bg-gradient-to-b from-[#111113] to-[#0d0d0f] border-r border-[rgba(255,255,255,0.08)]',
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-center h-14 w-full">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[rgba(255,192,28,0.08)]">
          <Sparkles
            size={22}
            className="text-primary gold-glow drop-shadow-[0_0_6px_hsl(var(--primary)/0.3)]"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 flex flex-col items-center gap-1 mt-2 w-full">
        {navItems.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            isActive={activeTab === item.key}
            onClick={() => setActiveTab(item.key)}
          />
        ))}
      </div>

      {/* Bottom pinned items */}
      <div className="mt-auto flex flex-col items-center gap-1 pb-3 w-full">
        {/* Settings */}
        <div className="relative w-full flex items-center justify-center">
          <span
            className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full',
              'bg-primary transition-opacity duration-150 ease-out',
              activeTab === 'settings' ? 'opacity-100' : 'opacity-0',
            )}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setActiveTab('settings')}
                  aria-label="Settings"
                  className={cn(
                    'transition-colors duration-150 ease-out active:scale-95',
                    activeTab === 'settings'
                      ? 'text-primary hover:text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                />
              }
            >
              <Settings
                size={20}
                strokeWidth={activeTab === 'settings' ? 2 : 1.5}
              />
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
        </div>

        <Separator className="w-8 opacity-50" />

        {/* User Avatar */}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                aria-label="Account"
                className={cn(
                  'flex items-center justify-center w-full h-10',
                  'transition-colors duration-150 ease-out',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                )}
              />
            }
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
                {user?.name?.charAt(0).toUpperCase() ?? 'U'}
              </AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent side="right">
            {user?.name ?? 'Account'}
          </TooltipContent>
        </Tooltip>
      </div>
    </nav>
  )
}
