export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
  });

  if (res.status === 401) {
    if (window.location.pathname !== '/login' && window.location.pathname !== '/splash') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({} as Record<string, unknown>));
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as Record<string, unknown>).error)
        : res.statusText;
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}
