'use strict';

const { executeReasoningLoop, _setCallClaude } = require('../../src/engine/reasoning-loop');
const { _setLogToolCall } = require('../../src/engine/tool-executor');
const { _setPool: setCostPool } = require('../../src/engine/cost-tracker');

// Mock DB for cost-tracker
const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
setCostPool({ query: mockQuery });

// Stub tool-executor DB logging
beforeEach(() => {
  _setLogToolCall(async () => {});
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

function makeTextResponse(text, inputTokens = 100, outputTokens = 50) {
  return {
    response: {
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    },
    cost: { model: 'claude-sonnet-4-6', inputTokens, outputTokens, costUsd: 0.001 },
  };
}

function makeToolUseResponse(toolName, toolInput, id = 'call_1', inputTokens = 100, outputTokens = 50) {
  return {
    response: {
      content: [
        { type: 'tool_use', id, name: toolName, input: toolInput },
      ],
      stop_reason: 'tool_use',
    },
    cost: { model: 'claude-sonnet-4-6', inputTokens, outputTokens, costUsd: 0.001 },
  };
}

/**
 * Create a mock v2 tool for registry.
 */
function makeMockTool(name, opts = {}) {
  const executeFn = opts.executeFn || (async (input) => ({ data: `result for ${name}` }));
  return {
    name,
    description: `Mock tool: ${name}`,
    category: opts.category || 'observe',
    permissionTier: opts.permissionTier || 'auto',
    inputSchema: { type: 'object', properties: {} },
    timeout: 30000,
    retryPolicy: { maxRetries: 0, backoff: [], timeoutMs: 30000 },
    execute: executeFn,
  };
}

/**
 * Create a mock registry with given tools.
 */
function makeMockRegistry(tools) {
  const map = new Map(tools.map(t => [t.name, t]));
  return {
    lookupTool(name) { return map.get(name) || null; },
  };
}

describe('reasoning-loop v2 executor integration', () => {
  afterEach(() => {
    _setCallClaude(null);
  });

  it('uses tool executor path when toolRegistry is provided', async () => {
    let callCount = 0;
    _setCallClaude(() => {
      callCount++;
      if (callCount === 1) {
        return makeToolUseResponse('test_tool', { query: 'test' });
      }
      return makeTextResponse('Done with tool executor!');
    });

    const executeFn = vi.fn(async () => ({ data: 'executor result' }));
    const tool = makeMockTool('test_tool', { executeFn });
    const registry = makeMockRegistry([tool]);

    const messages = [{ role: 'user', content: 'Use the tool' }];
    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      toolRegistry: registry,
      tools: [{ name: 'test_tool', description: 'Test', input_schema: { type: 'object' } }],
    });

    expect(result.response).toBe('Done with tool executor!');
    expect(result.toolCallCount).toBe(1);
    expect(executeFn).toHaveBeenCalledWith({ query: 'test' }, expect.objectContaining({ trustLevel: 'auto' }));
  });

  it('uses legacy executeToolFn when no toolRegistry provided', async () => {
    let callCount = 0;
    _setCallClaude(() => {
      callCount++;
      if (callCount === 1) {
        return makeToolUseResponse('legacy_tool', { q: 'hi' });
      }
      return makeTextResponse('Legacy done');
    });

    const legacyFn = vi.fn().mockResolvedValue('legacy result');
    const messages = [{ role: 'user', content: 'Use legacy' }];

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      executeToolFn: legacyFn,
    });

    expect(result.response).toBe('Legacy done');
    expect(result.toolCallCount).toBe(1);
    expect(legacyFn).toHaveBeenCalledWith('legacy_tool', { q: 'hi' });
  });

  it('returns gated result when tool requires higher permission', async () => {
    _setCallClaude(() => {
      return makeToolUseResponse('restricted_tool', { action: 'deploy' });
    });

    const tool = makeMockTool('restricted_tool', {
      permissionTier: 'review',
      category: 'ship',
    });
    const registry = makeMockRegistry([tool]);

    const messages = [{ role: 'user', content: 'Deploy please' }];
    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      toolRegistry: registry,
      trustLevel: 'auto',
    });

    expect(result.gated).toBe(true);
    expect(result.gatedTool).toBe('restricted_tool');
    expect(result.approvalRequired).toBe('review');
    expect(result.response).toContain('requires review approval');
  });

  it('passes tool error to Claude so it can adapt', async () => {
    let callCount = 0;
    _setCallClaude(() => {
      callCount++;
      if (callCount === 1) {
        return makeToolUseResponse('failing_tool', { x: 1 });
      }
      return makeTextResponse('I handled the error');
    });

    const executeFn = vi.fn(async () => { throw new Error('connection refused'); });
    const tool = makeMockTool('failing_tool', { executeFn });
    const registry = makeMockRegistry([tool]);

    const messages = [{ role: 'user', content: 'Try the tool' }];
    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      toolRegistry: registry,
    });

    expect(result.response).toBe('I handled the error');
    // The tool_result message should contain the error
    const toolResultMsg = messages.find(m =>
      Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result')
    );
    expect(toolResultMsg).toBeTruthy();
    const toolResult = toolResultMsg.content.find(c => c.type === 'tool_result');
    expect(toolResult.content).toContain('Tool error');
    expect(toolResult.content).toContain('connection refused');
  });

  it('stringifies envelope data correctly in tool_result', async () => {
    let callCount = 0;
    _setCallClaude(() => {
      callCount++;
      if (callCount === 1) {
        return makeToolUseResponse('data_tool', { id: 42 });
      }
      return makeTextResponse('Got the data');
    });

    const responseData = { items: [1, 2, 3], total: 3 };
    const executeFn = vi.fn(async () => ({ data: responseData }));
    const tool = makeMockTool('data_tool', { executeFn });
    const registry = makeMockRegistry([tool]);

    const messages = [{ role: 'user', content: 'Get data' }];
    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      toolRegistry: registry,
    });

    expect(result.response).toBe('Got the data');
    expect(result.toolCallCount).toBe(1);

    // Find the tool_result in messages and verify data was stringified
    const toolResultMsg = messages.find(m =>
      Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result')
    );
    const toolResult = toolResultMsg.content.find(c => c.type === 'tool_result');
    // The envelope wraps data, so the tool_result should contain the JSON
    expect(toolResult.content).toContain('items');
    expect(toolResult.content).toContain('total');
  });
});
