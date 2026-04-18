import { createRouter, createRoute, createRootRoute, redirect, lazyRouteComponent, Outlet } from '@tanstack/react-router'

// ---------------------------------------------------------------------------
// Root route - no component, children define their own layouts
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
// Login route - no layout wrapper, standalone page
// ---------------------------------------------------------------------------
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: lazyRouteComponent(() => import('@/pages/Login')),
})

// ---------------------------------------------------------------------------
// Authenticated layout route - wraps all auth-required routes
// ---------------------------------------------------------------------------
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: lazyRouteComponent(() => import('@/pages/AuthenticatedLayout')),
})

// ---------------------------------------------------------------------------
// Chat routes
// ---------------------------------------------------------------------------
const chatRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/chat',
  component: lazyRouteComponent(() => import('@/pages/Chat')),
})

const chatConversationRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/chat/$conversationId',
  component: lazyRouteComponent(() => import('@/pages/Chat')),
})

// ---------------------------------------------------------------------------
// Memory browser (placeholder)
// ---------------------------------------------------------------------------
const memoryRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/memory',
  component: lazyRouteComponent(() => import('@/pages/MemoryBrowser')),
})

// ---------------------------------------------------------------------------
// Settings (placeholder)
// ---------------------------------------------------------------------------
const settingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('@/pages/Settings')),
})

// ---------------------------------------------------------------------------
// Route tree
// ---------------------------------------------------------------------------
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  authenticatedRoute.addChildren([
    chatRoute,
    chatConversationRoute,
    memoryRoute,
    settingsRoute,
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
