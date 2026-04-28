'use strict';

const {
  ToolError,
  BrandIsolationError,
  BudgetExceededError,
  TOOL_ERROR_KINDS,
} = require('../src/errors.js');

describe('ToolError', () => {
  it('builds a non-throwable envelope', () => {
    const err = ToolError({ kind: 'validation', message: 'bad input' });
    expect(err).toEqual({
      ok: false,
      kind: 'validation',
      message: 'bad input',
      detail: undefined,
    });
  });

  it('preserves detail field', () => {
    const err = ToolError({ kind: 'runtime', message: 'boom', detail: { stack: 'x' } });
    expect(err.detail).toEqual({ stack: 'x' });
  });

  it('rejects unknown kind', () => {
    expect(() => ToolError({ kind: 'oops', message: 'x' })).toThrow(/unknown ToolError kind/);
  });

  it('exposes the full kind set', () => {
    expect(TOOL_ERROR_KINDS.has('isolation_violation')).toBe(true);
    expect(TOOL_ERROR_KINDS.has('async_timeout')).toBe(true);
    expect(TOOL_ERROR_KINDS.has('output_invalid')).toBe(true);
  });
});

describe('BrandIsolationError', () => {
  it('is throwable with brand and reason', () => {
    const err = new BrandIsolationError('access denied', {
      brand: 'maxfashion',
      reason: 'not in allowlist',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BrandIsolationError');
    expect(err.brand).toBe('maxfashion');
    expect(err.reason).toBe('not in allowlist');
  });
});

describe('BudgetExceededError', () => {
  it('carries budget and estimate', () => {
    const err = new BudgetExceededError('over budget', { budget: 100000, estimated: 120000 });
    expect(err.budget).toBe(100000);
    expect(err.estimated).toBe(120000);
  });
});
