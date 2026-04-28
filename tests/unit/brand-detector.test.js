// Brand detector — natural-language brand mention detection from chat content.
// Tests pure detection logic with an in-memory alias map (no real DB).

const {
  detectBrandFromAliases,
  buildAliasIndex,
  _testing,
} = require('../../src/utils/brand-detector');

describe('buildAliasIndex', () => {
  it('builds longest-alias-first ordering across brands', () => {
    const rows = [
      {
        brand_id: 'fedfina',
        name: 'Fedbank Financial Services Limited',
        preferences: { short_name: 'Fedfina', legal_name: 'Fedbank Financial Services Ltd' },
      },
      {
        brand_id: 'ikawn',
        name: 'iKawn Technologies',
        preferences: { short_name: 'iKawn', legal_name: 'iKawn Technologies Pvt Ltd' },
      },
    ];
    const idx = buildAliasIndex(rows);
    // Longest first
    expect(idx[0].alias.length).toBeGreaterThanOrEqual(idx[idx.length - 1].alias.length);
    // Includes brand_id, name, short_name, legal_name as aliases
    const aliases = idx.map(e => e.alias.toLowerCase());
    expect(aliases).toContain('fedfina');
    expect(aliases).toContain('fedbank financial services limited');
    expect(aliases).toContain('ikawn');
    expect(aliases).toContain('ikawn technologies');
  });

  it('skips empty / null aliases and dedupes per brand', () => {
    const rows = [
      {
        brand_id: 'acme',
        name: 'ACME',
        preferences: { short_name: 'ACME', legal_name: null },
      },
    ];
    const idx = buildAliasIndex(rows);
    const aliases = idx.map(e => e.alias.toLowerCase());
    // 'acme' appears multiple times in source but should be deduped per brand
    const acmeCount = aliases.filter(a => a === 'acme').length;
    expect(acmeCount).toBe(1);
  });
});

describe('detectBrandFromAliases', () => {
  const aliasIndex = buildAliasIndex([
    {
      brand_id: 'fedfina',
      name: 'Fedbank Financial Services Limited',
      preferences: { short_name: 'Fedfina', legal_name: 'Fedbank Financial Services Ltd' },
    },
    {
      brand_id: 'ikawn',
      name: 'iKawn Technologies',
      preferences: { short_name: 'iKawn', legal_name: 'iKawn Technologies Pvt Ltd' },
    },
  ]);

  it('detects Fedfina by short name', () => {
    const r = detectBrandFromAliases('make a Fedfina pitch deck', aliasIndex);
    expect(r).toEqual({ brandId: 'fedfina', matchedAlias: 'Fedfina' });
  });

  it('detects iKawn by short name', () => {
    const r = detectBrandFromAliases('build an iKawn investor presentation', aliasIndex);
    expect(r).toEqual({ brandId: 'ikawn', matchedAlias: 'iKawn' });
  });

  it('returns null for messages with no brand mention', () => {
    expect(detectBrandFromAliases('hello there', aliasIndex)).toBeNull();
  });

  it('does not match "Fed" inside "Federal" (word boundary respected)', () => {
    // "Fed" alone is not a configured alias (Fedfina is). "Fed rates" must NOT match.
    expect(detectBrandFromAliases('Fed rates are rising today', aliasIndex)).toBeNull();
  });

  it('prefers longest matching alias when both could match', () => {
    const r = detectBrandFromAliases(
      'Make a deck for Fedbank Financial Services Limited Q3',
      aliasIndex
    );
    expect(r).not.toBeNull();
    expect(r.brandId).toBe('fedfina');
    expect(r.matchedAlias.toLowerCase()).toBe('fedbank financial services limited');
  });

  it('returns null for empty string and null input', () => {
    expect(detectBrandFromAliases('', aliasIndex)).toBeNull();
    expect(detectBrandFromAliases(null, aliasIndex)).toBeNull();
    expect(detectBrandFromAliases(undefined, aliasIndex)).toBeNull();
  });

  it('returns null when message mentions two or more DISTINCT brands', () => {
    // Ambiguity rule: if matched aliases resolve to multiple brand_ids, refuse to guess.
    // "compare Fedfina vs iKawn" — both fedfina and ikawn match → null.
    const r = detectBrandFromAliases('compare Fedfina vs iKawn', aliasIndex);
    expect(r).toBeNull();
  });

  it('still resolves when multiple aliases for the SAME brand match', () => {
    // Both "Fedfina" (short_name) and "Fedbank Financial Services Limited" (name)
    // map to brand_id 'fedfina'. Single-brand-multiple-alias must still resolve.
    const r = detectBrandFromAliases(
      'Fedfina is the brand name for Fedbank Financial Services Limited',
      aliasIndex
    );
    expect(r).not.toBeNull();
    expect(r.brandId).toBe('fedfina');
    // Longest matching alias for the brand wins.
    expect(r.matchedAlias.toLowerCase()).toBe('fedbank financial services limited');
  });

  it('matches case-insensitively', () => {
    expect(detectBrandFromAliases('FEDFINA results', aliasIndex)?.brandId).toBe('fedfina');
    expect(detectBrandFromAliases('ikawn vision', aliasIndex)?.brandId).toBe('ikawn');
  });

  it('does not match substrings (ikea vs ikawn)', () => {
    expect(detectBrandFromAliases('ikea catalogue order', aliasIndex)).toBeNull();
  });
});

describe('detectBrand cache TTL', () => {
  it('refreshes alias index after TTL expires (injectable clock)', async () => {
    const { detectBrand, _resetCache } = require('../../src/utils/brand-detector');
    _resetCache();

    let callCount = 0;
    const fakePool = {
      query: async () => {
        callCount += 1;
        return {
          rows: [
            {
              brand_id: 'fedfina',
              name: 'Fedbank Financial Services Limited',
              preferences: { short_name: 'Fedfina', legal_name: null },
            },
          ],
        };
      },
    };

    let now = 1_000_000;
    const clock = () => now;

    await detectBrand('hello', fakePool, { clock, ttlMs: 5 * 60 * 1000 });
    expect(callCount).toBe(1);

    // Within TTL — cache hit, no extra DB call
    now += 60 * 1000;
    await detectBrand('hello again', fakePool, { clock, ttlMs: 5 * 60 * 1000 });
    expect(callCount).toBe(1);

    // After TTL — cache refresh
    now += 5 * 60 * 1000 + 1;
    await detectBrand('refresh now', fakePool, { clock, ttlMs: 5 * 60 * 1000 });
    expect(callCount).toBe(2);
  });

  it('returns null and does not throw on DB failure', async () => {
    const { detectBrand, _resetCache } = require('../../src/utils/brand-detector');
    _resetCache();

    const failingPool = {
      query: async () => {
        throw new Error('connection refused');
      },
    };

    const result = await detectBrand('make a Fedfina deck', failingPool, { clock: () => Date.now() });
    expect(result).toBeNull();
  });
});

describe('exposed internals', () => {
  it('exports the regex builder for inspection', () => {
    expect(_testing).toBeDefined();
    expect(typeof _testing.escapeRegex).toBe('function');
    expect(_testing.escapeRegex('foo.bar')).toBe('foo\\.bar');
  });
});
