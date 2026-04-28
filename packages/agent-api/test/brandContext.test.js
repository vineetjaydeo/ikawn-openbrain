'use strict';

const { buildBrandContext } = require('../src/engine/brandContext.js');
const { BrandIsolationError } = require('../src/errors.js');

function fakeDeps(overrides = {}) {
  return {
    getUser: async (id) => (id === 'u1' ? { id: 'u1' } : null),
    isBrandMember: async (userId, brand) => userId === 'u1' && ['ikawn', 'maxfashion'].includes(brand),
    isAgentAllowed: async (userId, brand, agent) =>
      userId === 'u1' && agent === 'ruhi',
    resolvePermissions: async (userId, brand, agent) =>
      new Set(['read', 'write']),
    ...overrides,
  };
}

const principal = (over = {}) => ({
  userId: 'u1',
  brandAllowlist: ['ikawn', 'maxfashion'],
  agentAllowlist: ['ruhi', 'lucy'],
  ...over,
});

describe('buildBrandContext', () => {
  it('builds a context for a valid principal+brand+agent', async () => {
    const ctx = await buildBrandContext({
      authPrincipal: principal(),
      requestedBrand: 'maxfashion',
      agent: 'ruhi',
      deps: fakeDeps(),
    });
    expect(ctx.brand).toBe('maxfashion');
    expect(ctx.userId).toBe('u1');
    expect(ctx.agent).toBe('ruhi');
    expect(ctx.permissions.has('read')).toBe(true);
    expect(ctx.transitionDefault).toBe(false);
    expect(typeof ctx.isolationToken).toBe('string');
  });

  it('throws BrandIsolationError when user is unknown', async () => {
    await expect(buildBrandContext({
      authPrincipal: principal({ userId: 'u_missing' }),
      requestedBrand: 'maxfashion',
      agent: 'ruhi',
      deps: fakeDeps(),
    })).rejects.toThrow(BrandIsolationError);
  });

  it('throws when brand is not in user membership', async () => {
    await expect(buildBrandContext({
      authPrincipal: principal({ brandAllowlist: ['shubhkart'] }),
      requestedBrand: 'shubhkart',
      agent: 'ruhi',
      deps: fakeDeps(),
    })).rejects.toThrow(/not a member/);
  });

  it('throws when agent is not allowed for user/brand', async () => {
    await expect(buildBrandContext({
      authPrincipal: principal(),
      requestedBrand: 'ikawn',
      agent: 'leadspark',
      deps: fakeDeps(),
    })).rejects.toThrow(/agent not allowed/);
  });

  it('falls back to transitionDefault when principal lacks brand allowlist', async () => {
    const ctx = await buildBrandContext({
      authPrincipal: { userId: 'u1' }, // legacy key, no claims
      requestedBrand: undefined,
      agent: 'ruhi',
      deps: fakeDeps(),
    });
    expect(ctx.brand).toBe('ikawn');
    expect(ctx.transitionDefault).toBe(true);
  });

  it('produces a stable isolationToken for same brand+revision', async () => {
    const deps = fakeDeps();
    const ctxA = await buildBrandContext({
      authPrincipal: principal(), requestedBrand: 'ikawn', agent: 'ruhi', deps,
      brandRevision: 7,
    });
    const ctxB = await buildBrandContext({
      authPrincipal: principal(), requestedBrand: 'ikawn', agent: 'ruhi', deps,
      brandRevision: 7,
    });
    expect(ctxA.isolationToken).toBe(ctxB.isolationToken);
  });

  it('produces a different isolationToken when brandRevision changes', async () => {
    const deps = fakeDeps();
    const ctxA = await buildBrandContext({
      authPrincipal: principal(), requestedBrand: 'ikawn', agent: 'ruhi', deps,
      brandRevision: 7,
    });
    const ctxB = await buildBrandContext({
      authPrincipal: principal(), requestedBrand: 'ikawn', agent: 'ruhi', deps,
      brandRevision: 8,
    });
    expect(ctxA.isolationToken).not.toBe(ctxB.isolationToken);
  });
});
