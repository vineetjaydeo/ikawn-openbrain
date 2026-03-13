// @ts-check
'use strict';

/** Memory types scoped to individual users (voice, preferences, corrections) */
const PERSONAL_MEMORY_TYPES = [
  'USER_PREFERENCE',
  'BRAND_VOICE_RULE',
  'CORRECTION',
  'WORKFLOW_PATTERN',
];

/** Memory types shared across all users on a brand (insights, patterns, strategy) */
const SHARED_MEMORY_TYPES = [
  'BUSINESS_INSIGHT',
  'CREATIVE_PATTERN',
  'CONTENT_STRATEGY',
  'AUDIENCE_INSIGHT',
  'PERFORMANCE_INSIGHT',
  'STRATEGIC_RECOMMENDATION',
  'EXTERNAL_INSIGHT',
  'CROSS_BRAND_INSIGHT',
  'PRODUCT_SUGGESTION',
  'COST_EFFICIENCY',
];

/**
 * @param {string} memoryType
 * @returns {boolean}
 */
function isPersonalMemory(memoryType) {
  return PERSONAL_MEMORY_TYPES.includes(memoryType);
}

module.exports = { PERSONAL_MEMORY_TYPES, SHARED_MEMORY_TYPES, isPersonalMemory };
