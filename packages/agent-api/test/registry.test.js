'use strict';

const { z } = require('zod');
const { ToolRegistry } = require('../src/tools/ToolRegistry.js');
const { defineTool } = require('../src/tools/defineTool.js');

function fakeTool(name) {
  return defineTool({
    name,
    description: name,
    parameters: z.object({}),
    output: z.object({}),
    async execute() { return {}; },
  });
}

describe('ToolRegistry', () => {
  it('registers and looks up tools by name', () => {
    const r = new ToolRegistry();
    r.register(fakeTool('a'), fakeTool('b'));
    expect(r.get('a').name).toBe('a');
    expect(r.get('b').name).toBe('b');
  });

  it('returns undefined for unknown name', () => {
    const r = new ToolRegistry();
    expect(r.get('missing')).toBeUndefined();
  });

  it('rejects duplicate registration', () => {
    const r = new ToolRegistry();
    r.register(fakeTool('a'));
    expect(() => r.register(fakeTool('a'))).toThrow(/already registered/);
  });

  it('lists all tools', () => {
    const r = new ToolRegistry();
    r.register(fakeTool('a'), fakeTool('b'), fakeTool('c'));
    expect(r.list().map((t) => t.name)).toEqual(['a', 'b', 'c']);
  });

  it('filters via allowlist', () => {
    const r = new ToolRegistry();
    r.register(fakeTool('a'), fakeTool('b'), fakeTool('c'));
    const filtered = r.allowlist(['a', 'c']);
    expect(filtered.map((t) => t.name)).toEqual(['a', 'c']);
  });

  it('allowlist silently drops unknown names', () => {
    const r = new ToolRegistry();
    r.register(fakeTool('a'));
    expect(r.allowlist(['a', 'missing']).map((t) => t.name)).toEqual(['a']);
  });
});
