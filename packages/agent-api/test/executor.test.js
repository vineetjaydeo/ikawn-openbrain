'use strict';

const { z } = require('zod');
const { StreamingToolExecutor } = require('../src/tools/StreamingToolExecutor.js');
const { ToolRegistry } = require('../src/tools/ToolRegistry.js');
const { defineTool } = require('../src/tools/defineTool.js');

function makeExecutor({ tools, canUseTool = () => true }) {
  const registry = new ToolRegistry();
  registry.register(...tools);
  return new StreamingToolExecutor({ registry, canUseTool });
}

const baseCtx = {
  brandContext: { brand: 'ikawn', isolationToken: 't', userId: 'u1', agent: 'ruhi' },
  turnId: 't1',
  deps: {},
};
const baseState = { brand: 'ikawn' };

describe('StreamingToolExecutor', () => {
  it('returns tool_result on happy path', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'echo',
      parameters: z.object({ msg: z.string() }),
      output: z.object({ msg: z.string() }),
      async execute(input) { return { msg: input.msg }; },
    });
    const exec = makeExecutor({ tools: [echo] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'echo', input: { msg: 'hi' } },
      baseCtx, baseState,
    );
    expect(item.type).toBe('tool_result');
    expect(item.toolUseId).toBe('u1');
    expect(item.output).toEqual({ msg: 'hi' });
  });

  it('returns ToolError envelope when tool missing', async () => {
    const exec = makeExecutor({ tools: [] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'missing', input: {} },
      baseCtx, baseState,
    );
    expect(item.type).toBe('tool_result');
    expect(item.output.ok).toBe(false);
    expect(item.output.kind).toBe('not_found');
  });

  it('returns ToolError envelope on input validation failure', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'echo',
      parameters: z.object({ msg: z.string() }),
      output: z.object({ msg: z.string() }),
      async execute(input) { return { msg: input.msg }; },
    });
    const exec = makeExecutor({ tools: [echo] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'echo', input: { msg: 42 } },
      baseCtx, baseState,
    );
    expect(item.output.kind).toBe('validation');
  });

  it('returns denial RunItem when permission denied', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'echo',
      parameters: z.object({}),
      output: z.object({}),
      async execute() { return {}; },
    });
    const exec = makeExecutor({
      tools: [echo],
      canUseTool: () => false,
    });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'echo', input: {} },
      baseCtx, baseState,
    );
    expect(item.type).toBe('denial');
    expect(item.toolName).toBe('echo');
  });

  it('returns isolation_violation when ctx brand != state brand', async () => {
    const echo = defineTool({
      name: 'echo',
      description: 'echo',
      parameters: z.object({}),
      output: z.object({}),
      async execute() { return {}; },
    });
    const exec = makeExecutor({ tools: [echo] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'echo', input: {} },
      { ...baseCtx, brandContext: { ...baseCtx.brandContext, brand: 'maxfashion' } },
      baseState,
    );
    expect(item.output.kind).toBe('isolation_violation');
  });

  it('returns output_invalid when execute returns wrong shape', async () => {
    const bad = defineTool({
      name: 'bad',
      description: 'bad',
      parameters: z.object({}),
      output: z.object({ msg: z.string() }),
      async execute() { return { msg: 42 }; },
    });
    const exec = makeExecutor({ tools: [bad] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'bad', input: {} },
      baseCtx, baseState,
    );
    expect(item.output.kind).toBe('output_invalid');
  });

  it('returns NOT_IMPLEMENTED for async tools (Plan 04)', async () => {
    const slow = defineTool({
      name: 'slow',
      description: 'slow',
      parameters: z.object({}),
      output: z.object({}),
      mode: 'async',
      async execute() { return {}; },
    });
    const exec = makeExecutor({ tools: [slow] });
    const item = await exec.dispatchToolUse(
      { id: 'u1', name: 'slow', input: {} },
      baseCtx, baseState,
    );
    expect(item.output.kind).toBe('runtime');
    expect(item.output.message).toMatch(/async tools not implemented in Plan 01/);
  });

  it('runs safe-concurrency tools in parallel via dispatchBatch', async () => {
    const calls = [];
    function makeTool(name, delayMs) {
      return defineTool({
        name,
        description: name,
        parameters: z.object({}),
        output: z.object({ name: z.string() }),
        concurrency: 'safe',
        async execute() {
          calls.push(`start ${name}`);
          await new Promise((r) => setTimeout(r, delayMs));
          calls.push(`end ${name}`);
          return { name };
        },
      });
    }
    const exec = makeExecutor({ tools: [makeTool('a', 30), makeTool('b', 5)] });
    const items = await exec.dispatchBatch(
      [
        { id: 'u1', name: 'a', input: {} },
        { id: 'u2', name: 'b', input: {} },
      ],
      baseCtx, baseState,
    );
    expect(items).toHaveLength(2);
    // b should finish before a because they run in parallel and b is shorter
    expect(calls.indexOf('end b')).toBeLessThan(calls.indexOf('end a'));
  });

  it('runs exclusive tools after safe batch drains', async () => {
    const order = [];
    const safeTool = defineTool({
      name: 'safe1',
      description: 's',
      parameters: z.object({}),
      output: z.object({}),
      concurrency: 'safe',
      async execute() { order.push('safe1'); return {}; },
    });
    const excTool = defineTool({
      name: 'exc1',
      description: 'e',
      parameters: z.object({}),
      output: z.object({}),
      concurrency: 'exclusive',
      async execute() { order.push('exc1'); return {}; },
    });
    const exec = makeExecutor({ tools: [safeTool, excTool] });
    await exec.dispatchBatch(
      [
        { id: 'u1', name: 'exc1', input: {} },
        { id: 'u2', name: 'safe1', input: {} },
      ],
      baseCtx, baseState,
    );
    expect(order).toEqual(['safe1', 'exc1']);
  });
});
