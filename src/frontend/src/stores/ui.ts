import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  activeTab: 'chat' | 'memory' | 'tasks' | 'vault' | 'settings'
  isMobile: boolean
  setSidebarOpen: (open: boolean) => void
  setActiveTab: (tab: UIState['activeTab']) => void
  setIsMobile: (mobile: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  activeTab: 'chat',
  isMobile: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setIsMobile: (mobile) => set({ isMobile: mobile }),
}))
