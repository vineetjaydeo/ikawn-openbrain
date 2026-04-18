'use strict';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { feature, getAllFeatures, _resetCache } = require('../../src/utils/features');

// Track which env vars we set so we can clean them up
const envKeysSet = [];

function setEnv(key, value) {
  process.env[key] = value;
  envKeysSet.push(key);
}

describe('features', () => {
  beforeEach(() => {
    _resetCache();
    // Clean up any env vars we set in previous tests
    for (const key of envKeysSet) {
      delete process.env[key];
    }
    envKeysSet.length = 0;
  });

  it('returns true for a known feature with default true', () => {
    expect(feature('CODE_TOOLS')).toBe(true);
  });

  it('returns false for a known feature with default false', () => {
    expect(feature('DEPLOY_TOOLS')).toBe(false);
  });

  it('env override "true" overrides default false to true', () => {
    setEnv('ENABLE_DEPLOY_TOOLS', 'true');
    expect(feature('DEPLOY_TOOLS')).toBe(true);
  });

  it('env override "false" overrides default true to false', () => {
    setEnv('ENABLE_CODE_TOOLS', 'false');
    expect(feature('CODE_TOOLS')).toBe(false);
  });

  it('env override "1" works as true', () => {
    setEnv('ENABLE_BRAND_API', '1');
    expect(feature('BRAND_API')).toBe(true);
  });

  it('returns false and logs warning for unknown feature', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(feature('DOES_NOT_EXIST')).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith('[Features] Unknown feature flag: DOES_NOT_EXIST');
    warnSpy.mockRestore();
  });

  it('getAllFeatures returns array with all flags', () => {
    const all = getAllFeatures();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBe(11);
    // Each entry has the expected shape
    for (const entry of all) {
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('enabled');
      expect(entry).toHaveProperty('env');
      expect(entry).toHaveProperty('description');
      expect(typeof entry.enabled).toBe('boolean');
    }
    // Spot-check a few
    const codeTool = all.find(f => f.name === 'CODE_TOOLS');
    expect(codeTool.enabled).toBe(true);
    expect(codeTool.env).toBe('ENABLE_CODE_TOOLS');
  });

  it('caches resolved value (second call does not re-read env)', () => {
    // First call resolves with default
    expect(feature('DEPLOY_TOOLS')).toBe(false);
    // Now set env — but cache should prevent re-reading
    setEnv('ENABLE_DEPLOY_TOOLS', 'true');
    expect(feature('DEPLOY_TOOLS')).toBe(false);
  });

  it('_resetCache clears the cache so env is re-read', () => {
    // Resolve with default
    expect(feature('DEPLOY_TOOLS')).toBe(false);
    // Set env and reset cache
    setEnv('ENABLE_DEPLOY_TOOLS', 'true');
    _resetCache();
    // Now it should pick up the new env value
    expect(feature('DEPLOY_TOOLS')).toBe(true);
  });
});
