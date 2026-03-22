
// Test auth middleware directly — these are pure functions that don't need DB
// (requireAuthOrApiKey needs DB, tested separately)

describe('Auth Middleware', () => {
  let requireAuth, requireAdmin;

  beforeEach(() => {
    // Import the functions fresh — auth.js requires ../db at top level
    // but requireAuth and requireAdmin don't use pool, so we can test them directly
    vi.resetModules();
    vi.doMock('../../src/db', () => ({
      pool: { query: vi.fn() },
    }));
    const auth = require('../../src/auth');
    requireAuth = auth.requireAuth;
    requireAdmin = auth.requireAdmin;
  });

  describe('requireAuth', () => {
    it('calls next() when session has user', () => {
      const req = { session: { user: { id: 1, role: 'user' } } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), redirect: vi.fn() };
      const next = vi.fn();
      requireAuth(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 401 JSON for API requests without session', () => {
      const req = { session: {}, headers: { accept: 'application/json' } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), redirect: vi.fn() };
      const next = vi.fn();
      requireAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('redirects to /login for browser requests without session', () => {
      const req = { session: {}, headers: { accept: 'text/html' } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), redirect: vi.fn() };
      const next = vi.fn();
      requireAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/login');
    });

    it('returns 403 for suspended users', () => {
      const req = { session: { user: { id: 1, role: 'user', status: 'suspended' } } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), redirect: vi.fn() };
      const next = vi.fn();
      requireAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireAdmin', () => {
    it('calls next() for admin users', () => {
      const req = { session: { user: { id: 1, role: 'admin' } } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      requireAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 403 for non-admin users', () => {
      const req = { session: { user: { id: 1, role: 'user' } } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      requireAdmin(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 401 for unauthenticated requests', () => {
      const req = { session: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      requireAdmin(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
