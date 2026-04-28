const crypto = require('crypto');
const { BrandIsolationError } = require('../errors.js');

const LEGACY_DEFAULT_BRAND = 'ikawn';

async function buildBrandContext({
  authPrincipal,
  requestedBrand,
  agent,
  deps,
  brandRevision = 0,
}) {
  if (!authPrincipal || !authPrincipal.userId) {
    throw new BrandIsolationError('missing auth principal', { brand: null, reason: 'no userId' });
  }
  const user = await deps.getUser(authPrincipal.userId);
  if (!user) {
    throw new BrandIsolationError('unknown user', {
      brand: requestedBrand, reason: `user ${authPrincipal.userId} not found`,
    });
  }

  const hasNewClaims = Array.isArray(authPrincipal.brandAllowlist);
  let brand;
  let transitionDefault = false;

  if (!hasNewClaims) {
    brand = LEGACY_DEFAULT_BRAND;
    transitionDefault = true;
  } else {
    brand = requestedBrand || authPrincipal.brandAllowlist[0];
    if (!authPrincipal.brandAllowlist.includes(brand)) {
      throw new BrandIsolationError('brand not in principal allowlist', {
        brand, reason: 'principal brand allowlist',
      });
    }
    const member = await deps.isBrandMember(authPrincipal.userId, brand);
    if (!member) {
      throw new BrandIsolationError('user is not a member of brand', {
        brand, reason: 'membership check',
      });
    }
  }

  const allowed = await deps.isAgentAllowed(authPrincipal.userId, brand, agent);
  if (!allowed) {
    throw new BrandIsolationError('agent not allowed for user/brand', {
      brand, reason: `agent ${agent}`,
    });
  }

  const permissions = await deps.resolvePermissions(authPrincipal.userId, brand, agent);
  const agentAllowlist = authPrincipal.agentAllowlist || null;
  const intersected = agentAllowlist
    ? new Set([...permissions].filter(() => agentAllowlist.includes(agent)))
    : permissions;

  const isolationToken = crypto
    .createHash('sha256')
    .update(`${brand}|${brandRevision}`)
    .digest('hex');

  return {
    brand,
    brandRevision,
    userId: authPrincipal.userId,
    agent,
    authScope: hasNewClaims ? 'agent' : 'user',
    permissions: intersected,
    isolationToken,
    transitionDefault,
  };
}

module.exports = { buildBrandContext, LEGACY_DEFAULT_BRAND };
