'use strict';

/**
 * Deterministic model routing — maps task tier to Claude model + pricing.
 * Pricing is per 1M tokens (input/output). Update when Anthropic changes pricing.
 */
const MODELS = {
  fast: {
    modelId: 'claude-haiku-4-5-20251001',
    inputPricePerMToken: 0.80,
    outputPricePerMToken: 4.00,
  },
  balanced: {
    modelId: 'claude-sonnet-4-6',
    inputPricePerMToken: 3.00,
    outputPricePerMToken: 15.00,
  },
  deep: {
    modelId: 'claude-opus-4-6',
    inputPricePerMToken: 15.00,
    outputPricePerMToken: 75.00,
  },
};

function resolveModel(tier) {
  const model = MODELS[tier];
  if (!model) {
    throw new Error(`Unknown model tier: "${tier}". Valid tiers: ${Object.keys(MODELS).join(', ')}`);
  }
  return { ...model };
}

module.exports = { resolveModel, MODELS };
