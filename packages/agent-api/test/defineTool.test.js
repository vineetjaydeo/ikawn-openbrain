'use strict';

const { z } = require('zod');
const { defineTool } = require('../src/tools/defineTool.js');

function baseSpec(overrides = {}) {
  return {
    name: 'echo',
    description: 'Echoes input',
    parameters: z.object({ msg: z.string() }),
    output: z.object({ msg: z.string() }),
    mode: 'sync',
    concurrency: 'safe',
    needsApproval: false,
    timeoutMs: 1000,
    retry: { maxAttempts: 0 },
    async execute(input) {
      return { msg: input.msg };
    },
    ...overrides,
  };
}

describe('defineTool', () => {
  it('returns a tool with derived JSON schema', () => {
    const tool = defineTool(baseSpec());
    expect(tool.name).toBe('echo');
    expect(tool.jsonSchema).toBeDefined();
    expect(tool.jsonSchema.type).toBe('object');
    expect(tool.jsonSchema.properties.msg).toBeDefined();
  });

  it('validates input via Zod', () => {
    const tool = defineTool(baseSpec());
    const ok = tool.validateInput({ msg: 'hi' });
    expect(ok.success).toBe(true);
    const fail = tool.validateInput({ msg: 42 });
    expect(fail.success).toBe(false);
    expect(fail.error.issues[0].path).toEqual(['msg']);
  });

  it('validates output via Zod', () => {
    const tool = defineTool(baseSpec());
    const ok = tool.validateOutput({ msg: 'hi' });
    expect(ok.success).toBe(true);
    const fail = tool.validateOutput({ msg: 42 });
    expect(fail.success).toBe(false);
  });

  it('rejects spec without required fields', () => {
    expect(() => defineTool({ ...baseSpec(), name: undefined })).toThrow(/name is required/);
    expect(() => defineTool({ ...baseSpec(), parameters: undefined })).toThrow(/parameters is required/);
    expect(() => defineTool({ ...baseSpec(), output: undefined })).toThrow(/output is required/);
    expect(() => defineTool({ ...baseSpec(), execute: undefined })).toThrow(/execute is required/);
  });

  it('rejects unknown mode and concurrency', () => {
    expect(() => defineTool({ ...baseSpec(), mode: 'bogus' })).toThrow(/invalid mode/);
    expect(() => defineTool({ ...baseSpec(), concurrency: 'bogus' })).toThrow(/invalid concurrency/);
  });

  it('requires idempotencyKey when retry > 0 AND tool has side-effect-style name flag', () => {
    expect(() => defineTool({
      ...baseSpec(),
      retry: { maxAttempts: 1 },
      sideEffect: true,
    })).toThrow(/idempotencyKey is required/);
  });

  it('accepts idempotencyKey when retry > 0 with side effects', () => {
    const tool = defineTool({
      ...baseSpec(),
      retry: { maxAttempts: 1 },
      sideEffect: true,
      idempotencyKey: (input, ctx) => `${ctx.turnId}:${input.msg}`,
    });
    expect(typeof tool.idempotencyKey).toBe('function');
  });

  it('preserves async mode', () => {
    const tool = defineTool({ ...baseSpec(), mode: 'async' });
    expect(tool.mode).toBe('async');
  });
});
