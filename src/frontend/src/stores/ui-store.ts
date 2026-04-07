import { create } from 'zustand'

interface UIStore {
  sidebarExpanded: boolean
  setSidebarExpanded: (expanded: boolean) => void
  toggleSidebar: () => void
  isMobile: boolean
  setIsMobile: (mobile: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarExpanded: false,
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  toggleSidebar: () => set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),
  isMobile: false,
  setIsMobile: (mobile) => set({ isMobile: mobile }),
}))
