// vitest globals enabled — describe, it, expect available globally
'use strict';

const { resolveModel, MODELS } = require('../../src/engine/model-router');

describe('model-router', () => {
  it('resolves fast tier to Haiku', () => {
    const model = resolveModel('fast');
    expect(model.modelId).toBe('claude-haiku-4-5-20251001');
    expect(model.inputPricePerMToken).toBe(0.80);
    expect(model.outputPricePerMToken).toBe(4.00);
  });

  it('resolves balanced tier to Sonnet', () => {
    const model = resolveModel('balanced');
    expect(model.modelId).toBe('claude-sonnet-4-6');
    expect(model.inputPricePerMToken).toBe(3.00);
    expect(model.outputPricePerMToken).toBe(15.00);
  });

  it('resolves deep tier to Opus', () => {
    const model = resolveModel('deep');
    expect(model.modelId).toBe('claude-opus-4-6');
    expect(model.inputPricePerMToken).toBe(15.00);
    expect(model.outputPricePerMToken).toBe(75.00);
  });

  it('throws on unknown tier', () => {
    expect(() => resolveModel('turbo')).toThrow('Unknown model tier: "turbo"');
  });

  it('throws on undefined tier', () => {
    expect(() => resolveModel(undefined)).toThrow('Unknown model tier');
  });

  it('has exactly 3 tiers', () => {
    expect(Object.keys(MODELS)).toHaveLength(3);
    expect(Object.keys(MODELS)).toEqual(['fast', 'balanced', 'deep']);
  });

  it('returns copies to prevent mutation', () => {
    const a = resolveModel('fast');
    const b = resolveModel('fast');
    a.modelId = 'mutated';
    expect(b.modelId).toBe('claude-haiku-4-5-20251001');
  });
});
