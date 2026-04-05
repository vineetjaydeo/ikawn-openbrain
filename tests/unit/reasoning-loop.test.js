// vitest globals enabled
'use strict';

const { executeReasoningLoop, BudgetExceededError, _setCallClaude } = require('../../src/engine/reasoning-loop');
const { _setPool: setCostPool } = require('../../src/engine/cost-tracker');

// Mock LLM client via injection (same pattern as _setPool in cost-tracker)
const mockCallClaude = vi.fn();
_setCallClaude(mockCallClaude);

// Mock DB for cost-tracker
const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
setCostPool({ query: mockQuery });

function makeTextResponse(text, inputTokens = 100, outputTokens = 50) {
  return {
    response: {
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    },
    cost: { model: 'claude-sonnet-4-6', inputTokens, outputTokens, costUsd: 0.001 },
  };
}

function makeToolUseResponse(toolName, toolInput, id = 'tool_1', inputTokens = 100, outputTokens = 50) {
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

describe('reasoning-loop', () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('returns text response on first turn (no tools)', async () => {
    mockCallClaude.mockResolvedValueOnce(makeTextResponse('Hello world'));

    const messages = [{ role: 'user', content: 'Hi' }];
    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      executeToolFn: vi.fn(),
    });

    expect(result.response).toBe('Hello world');
    expect(result.turnCount).toBe(1);
    expect(result.toolCallCount).toBe(0);
    expect(mockCallClaude).toHaveBeenCalledTimes(1);
  });

  it('executes tool then returns text', async () => {
    mockCallClaude
      .mockResolvedValueOnce(makeToolUseResponse('search', { query: 'test' }))
      .mockResolvedValueOnce(makeTextResponse('Found results'));

    const executeTool = vi.fn().mockResolvedValue('search results here');
    const messages = [{ role: 'user', content: 'Search for test' }];

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      tools: [{ name: 'search', description: 'Search', input_schema: { type: 'object' } }],
      executeToolFn: executeTool,
    });

    expect(result.response).toBe('Found results');
    expect(result.turnCount).toBe(2);
    expect(result.toolCallCount).toBe(1);
    expect(executeTool).toHaveBeenCalledWith('search', { query: 'test' });
    // Messages should include assistant + tool_result + final
    expect(messages.length).toBeGreaterThan(1);
  });

  it('handles tool execution error gracefully', async () => {
    mockCallClaude
      .mockResolvedValueOnce(makeToolUseResponse('broken_tool', {}))
      .mockResolvedValueOnce(makeTextResponse('Recovered'));

    const executeTool = vi.fn().mockRejectedValue(new Error('Tool crashed'));
    const messages = [{ role: 'user', content: 'Do something' }];

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      executeToolFn: executeTool,
    });

    expect(result.response).toBe('Recovered');
    // Tool error should be in the messages
    const toolResultMsg = messages.find(m =>
      Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result')
    );
    expect(toolResultMsg).toBeTruthy();
    const toolResult = toolResultMsg.content.find(c => c.type === 'tool_result');
    expect(toolResult.content).toContain('Tool error: Tool crashed');
  });

  it('stops at max iterations', async () => {
    mockCallClaude.mockResolvedValue(makeToolUseResponse('loop_tool', {}, 'tool_loop'));

    const executeTool = vi.fn().mockResolvedValue('ok');
    const messages = [{ role: 'user', content: 'Loop forever' }];

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      executeToolFn: executeTool,
      maxIterations: 3,
    });

    expect(result.response).toBe('[Max iterations reached]');
    expect(result.turnCount).toBe(3);
    expect(mockCallClaude).toHaveBeenCalledTimes(3);
  });

  it('throws BudgetExceededError when over dollar cap', async () => {
    // Mock checkBudget via the DB — return a high total
    mockQuery.mockResolvedValue({ rows: [{ total: '10.00' }] });

    const messages = [{ role: 'user', content: 'Expensive task' }];

    await expect(executeReasoningLoop({
      sessionId: 'sess-budget',
      systemPrompt: 'You are helpful.',
      messages,
      dollarCap: 1.00,
      executeToolFn: vi.fn(),
    })).rejects.toThrow(BudgetExceededError);
  });

  it('logs costs to DB when sessionId is provided', async () => {
    // Mock budget check to be within budget
    mockQuery.mockResolvedValue({ rows: [{ total: '0' }] });
    mockCallClaude.mockResolvedValueOnce(makeTextResponse('Done'));

    const messages = [{ role: 'user', content: 'Hi' }];
    await executeReasoningLoop({
      sessionId: 'sess-cost',
      brandId: 'ikawn',
      systemPrompt: 'You are helpful.',
      messages,
      executeToolFn: vi.fn(),
    });

    // Should have called checkBudget (SELECT SUM) + logLLMCall (INSERT)
    const insertCalls = mockQuery.mock.calls.filter(c => c[0].includes('INSERT INTO cost_events'));
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('uses correct model from modelTier', async () => {
    mockCallClaude.mockResolvedValueOnce(makeTextResponse('Fast response'));

    const messages = [{ role: 'user', content: 'Quick' }];
    await executeReasoningLoop({
      modelTier: 'fast',
      systemPrompt: 'You are helpful.',
      messages,
      executeToolFn: vi.fn(),
    });

    expect(mockCallClaude).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    );
  });
});
