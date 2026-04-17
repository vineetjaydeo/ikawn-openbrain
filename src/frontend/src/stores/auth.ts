import { create } from 'zustand'

interface User {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
  avatar?: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: {
    id: 'demo-user',
    email: 'demo@lucy.ai',
    name: 'Vineet',
    role: 'admin',
  },
  isAuthenticated: true,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
}))
