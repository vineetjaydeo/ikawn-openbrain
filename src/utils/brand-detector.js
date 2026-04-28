// Brand detector — natural-language brand mention detection from chat content.
//
// Joins brands + brand_context to assemble an alias map (brand_id, name,
// preferences.short_name, preferences.legal_name), then word-boundary matches
// aliases in the user message. If aliases for two or more DISTINCT brand_ids
// match, returns null (ambiguous — refuse to guess). Otherwise returns the
// longest matching alias for the single matched brand: { brandId, matchedAlias }.
//
// Cache: in-memory alias index, refreshed every 5 minutes (TTL). Single-process —
// when Lucy or Ruhi Brain run multiple instances behind a load balancer, each
// instance keeps its own cache. Acceptable for now (alias map is small, churn
// is low). Revisit if/when we move to a shared cache layer.

const DEFAULT_TTL_MS = 5 * 60 * 1000;

let cache = {
  index: null,
  loadedAt: 0,
};

function _resetCache() {
  cache = { index: null, loadedAt: 0 };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a flat, longest-first alias index from joined brand rows.
// Each row: { brand_id, name, preferences: { short_name, legal_name } }
// Returns: [{ brandId, alias }] sorted by alias length desc.
function buildAliasIndex(rows) {
  // Map of (brandId|aliasLower) -> entry. Prefer mixed-case display forms over
  // all-lowercase forms when both refer to the same alias (e.g. 'Fedfina'
  // beats 'fedfina' from brand_id slug).
  const byKey = new Map();
  for (const row of rows || []) {
    const brandId = row.brand_id;
    if (!brandId) continue;
    const prefs = row.preferences || {};
    const candidates = [
      brandId,
      row.name,
      prefs.short_name,
      prefs.legal_name,
    ];
    for (const raw of candidates) {
      if (!raw) continue;
      const alias = String(raw).trim();
      if (!alias) continue;
      const key = brandId + '|' + alias.toLowerCase();
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { brandId, alias });
        continue;
      }
      // Prefer the version that isn't all lowercase (better display form).
      const existingIsAllLower = existing.alias === existing.alias.toLowerCase();
      const incomingIsAllLower = alias === alias.toLowerCase();
      if (existingIsAllLower && !incomingIsAllLower) {
        byKey.set(key, { brandId, alias });
      }
    }
  }
  const out = [...byKey.values()];
  out.sort((a, b) => b.alias.length - a.alias.length);
  return out;
}

// Pure matcher — given message and a prebuilt index, find matching aliases.
// Word-boundary regex match; case-insensitive.
// Rule: if matched aliases resolve to two or more DISTINCT brand_ids, return null
// (ambiguous — refuse to guess). Otherwise return the longest matching alias for
// the single matched brand. Returns { brandId, matchedAlias } | null.
function detectBrandFromAliases(message, aliasIndex) {
  if (!message || typeof message !== 'string') return null;
  if (!Array.isArray(aliasIndex) || aliasIndex.length === 0) return null;
  const lc = message.toLowerCase();
  let firstMatch = null;
  const matchedBrandIds = new Set();
  for (const entry of aliasIndex) {
    const aliasLc = entry.alias.toLowerCase();
    const re = new RegExp('\\b' + escapeRegex(aliasLc) + '\\b', 'i');
    if (re.test(lc)) {
      matchedBrandIds.add(entry.brandId);
      if (matchedBrandIds.size > 1) return null;
      if (!firstMatch) {
        // aliasIndex is sorted longest-first, so the first match for a given
        // brand is the longest alias for that brand.
        firstMatch = { brandId: entry.brandId, matchedAlias: entry.alias };
      }
    }
  }
  return firstMatch;
}

async function loadAliasIndex(pool) {
  const sql = `
    SELECT b.brand_id,
           b.name,
           bc.preferences
    FROM brands b
    LEFT JOIN brand_context bc ON bc.brand_id = b.brand_id
    WHERE b.status = 'active' OR b.status IS NULL
  `;
  const result = await pool.query(sql);
  return buildAliasIndex(result.rows);
}

// Public: detectBrand(message, pool, opts?)
// opts.clock — function returning ms; opts.ttlMs — cache lifetime ms.
// Returns { brandId, matchedAlias } | null. Never throws.
async function detectBrand(message, pool, opts = {}) {
  const clock = typeof opts.clock === 'function' ? opts.clock : Date.now;
  const ttlMs = typeof opts.ttlMs === 'number' ? opts.ttlMs : DEFAULT_TTL_MS;

  try {
    const now = clock();
    const stale = !cache.index || (now - cache.loadedAt) > ttlMs;
    if (stale) {
      // Simple TTL refresh. If two requests hit a stale cache simultaneously,
      // both fire the SELECT — fine for Lucy's traffic profile, simpler code.
      const idx = await loadAliasIndex(pool);
      cache.index = idx;
      cache.loadedAt = clock();
    }
    return detectBrandFromAliases(message, cache.index);
  } catch (err) {
    console.error('[BrandDetector] alias load or match failed:', err.message);
    return null;
  }
}

module.exports = {
  detectBrand,
  detectBrandFromAliases,
  buildAliasIndex,
  _resetCache,
  _testing: { escapeRegex },
};
