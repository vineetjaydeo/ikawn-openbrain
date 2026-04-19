import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/auth';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  avatar?: string;
}

interface AuthResponse {
  user: User;
}

interface LoginCredentials {
  email: string;
  password: string;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  const {
    data: user,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () =>
      // /auth/me returns user object directly, not { user: {...} }
      apiFetch<User>('/auth/me').then((u) => {
        setUser(u);
        return u;
      }),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: (creds: LoginCredentials) =>
      // /auth/login returns { ok: true, user: {...} }
      apiFetch<{ ok: boolean; user: User }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.auth.me, data.user);
      setUser(data.user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () =>
      apiFetch<Record<string, never>>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      setUser(null);
      window.location.href = '/login';
    },
  });

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutateAsync,
  };
}
