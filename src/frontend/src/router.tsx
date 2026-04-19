import { createRouter, createRoute, createRootRoute, redirect, lazyRouteComponent, Outlet } from '@tanstack/react-router'

// ---------------------------------------------------------------------------
// Root route
// ---------------------------------------------------------------------------
const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

// ---------------------------------------------------------------------------
// Index route - redirect / to /chat
// ---------------------------------------------------------------------------
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/chat' })
  },
})

// ---------------------------------------------------------------------------
// Standalone routes (no app shell)
// ---------------------------------------------------------------------------
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: lazyRouteComponent(() => import('@/pages/Login')),
})

const splashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/splash',
  component: lazyRouteComponent(() => import('@/pages/SplashPage')),
})

// ---------------------------------------------------------------------------
// App Shell - wraps all authenticated routes with ThemeContext
// ---------------------------------------------------------------------------
const appShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app-shell',
  component: lazyRouteComponent(() => import('@/pages/AppShell')),
})

// ---------------------------------------------------------------------------
// Chat routes
// ---------------------------------------------------------------------------
const chatRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/chat',
  component: lazyRouteComponent(() => import('@/pages/Chat')),
})

const chatConversationRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/chat/$conversationId',
  component: lazyRouteComponent(() => import('@/pages/Chat')),
})

// ---------------------------------------------------------------------------
// Memory routes
// ---------------------------------------------------------------------------
const memoryRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/memory',
  component: lazyRouteComponent(() => import('@/pages/MemoryBrowser')),
})

const memoryDetailRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/memory/$memoryId',
  component: lazyRouteComponent(() => import('@/pages/MemoryDetailPage')),
})

// ---------------------------------------------------------------------------
// Vault & Tasks
// ---------------------------------------------------------------------------
const vaultRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/vault',
  component: lazyRouteComponent(() => import('@/pages/VaultPage')),
})

const tasksRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/tasks',
  component: lazyRouteComponent(() => import('@/pages/TasksPage')),
})

// ---------------------------------------------------------------------------
// Settings & Admin
// ---------------------------------------------------------------------------
const settingsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('@/pages/Settings')),
})

const settingsConnectionsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/settings/connections',
  component: lazyRouteComponent(() => import('@/pages/SettingsConnectionsPage')),
})

const adminRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/admin',
  component: lazyRouteComponent(() => import('@/pages/AdminPage')),
})

// ---------------------------------------------------------------------------
// Route tree
// ---------------------------------------------------------------------------
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  splashRoute,
  appShellRoute.addChildren([
    chatRoute,
    chatConversationRoute,
    memoryRoute,
    memoryDetailRoute,
    vaultRoute,
    tasksRoute,
    settingsRoute,
    settingsConnectionsRoute,
    adminRoute,
  ]),
])

// ---------------------------------------------------------------------------
// Router instance
// ---------------------------------------------------------------------------
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// ---------------------------------------------------------------------------
// Type registration for type-safe navigation
// ---------------------------------------------------------------------------
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
