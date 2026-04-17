import { useEffect, type ReactNode } from 'react'
import { IconRail } from './IconRail'
import { BottomTabs } from './BottomTabs'
import { useUIStore } from '@/stores/ui'
import { TooltipProvider } from '@/components/ui/tooltip'

const MOBILE_BREAKPOINT = 1024

interface UserLayoutProps {
  children: ReactNode
}

export function UserLayout({ children }: UserLayoutProps) {
  const setIsMobile = useUIStore((s) => s.setIsMobile)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches)
    }

    // Set initial value
    handleChange(mql)

    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [setIsMobile])

  return (
    <TooltipProvider>
      <div className="flex h-dvh bg-background">
        <IconRail />
        <main className="flex-1 flex flex-col min-w-0 pb-14 lg:pb-0">
          {children}
        </main>
        <BottomTabs />
      </div>
    </TooltipProvider>
  )
}
