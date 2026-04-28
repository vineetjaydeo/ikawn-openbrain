'use strict';

const { brandContextRead } = require('../../src/tools/brandContextRead.js');

const sampleProfile = {
  name: 'Acme',
  industry: 'fashion',
  tone: 'playful',
  audience: 'gen-z',
  colors: { primary: '#fff', secondary: '#000', accent: '#f00' },
  fonts: { heading: 'Parkinsans', body: 'Google Sans' },
  hasLogo: true,
};

function ctxWithDeps(profile) {
  return {
    brandContext: { brand: 'acme', userId: 'u1' },
    deps: { brandContextRead: { getBrandProfile: async () => profile } },
  };
}

describe('brand_context_read tool', () => {
  it('has locked reliability profile (sync, 3s, no retry)', () => {
    expect(brandContextRead.name).toBe('brand_context_read');
    expect(brandContextRead.mode).toBe('sync');
    expect(brandContextRead.timeoutMs).toBe(3000);
    expect(brandContextRead.retry.maxAttempts).toBe(0);
    expect(brandContextRead.needsApproval).toBe(false);
  });

  it('returns the brand profile object verbatim', async () => {
    const out = await brandContextRead.execute({}, ctxWithDeps(sampleProfile));
    expect(out.profile).toEqual(sampleProfile);
    expect(out.found).toBe(true);
  });

  it('returns found=false when profile is null', async () => {
    const out = await brandContextRead.execute({}, ctxWithDeps(null));
    expect(out.found).toBe(false);
    expect(out.profile).toBeNull();
  });

  it('passes brand and userId into the dep call', async () => {
    let captured;
    const ctx = {
      brandContext: { brand: 'acme', userId: 'u9' },
      deps: { brandContextRead: { getBrandProfile: async (a) => { captured = a; return sampleProfile; } } },
    };
    await brandContextRead.execute({}, ctx);
    expect(captured).toEqual({ brand: 'acme', userId: 'u9' });
  });
});
