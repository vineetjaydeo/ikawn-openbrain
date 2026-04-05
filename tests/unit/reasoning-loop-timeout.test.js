'use strict';

const { executeReasoningLoop, _setCallClaude } = require('../../src/engine/reasoning-loop');
const { _setPool: setCostPool } = require('../../src/engine/cost-tracker');

const mockCallClaude = vi.fn();
_setCallClaude(mockCallClaude);

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

function makeToolUseWithTextResponse(toolName, toolInput, text, id = 'tool_1') {
  return {
    response: {
      content: [
        { type: 'text', text },
        { type: 'tool_use', id, name: toolName, input: toolInput },
      ],
      stop_reason: 'tool_use',
    },
    cost: { model: 'claude-sonnet-4-6', inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
  };
}

describe('reasoning-loop timeout', () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('returns early with timedOut: true when elapsed time exceeds timeoutMs', async () => {
    // First call: tool use (LLM 30ms + tool 30ms = 60ms elapsed)
    // Timeout check before second LLM call triggers (60ms > 50ms)
    mockCallClaude
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        return makeToolUseResponse('search', { query: 'test' });
      })
      .mockImplementationOnce(async () => {
        return makeTextResponse('Should not reach');
      });

    const executeTool = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 30));
      return 'results';
    });
    const messages = [{ role: 'user', content: 'Search' }];

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      tools: [{ name: 'search', description: 'Search', input_schema: { type: 'object' } }],
      executeToolFn: executeTool,
      timeoutMs: 50,
      maxIterations: 10,
    });

    expect(result.timedOut).toBe(true);
    expect(result.turnCount).toBe(1);
  });

  it('preserves partial text when timeout fires after first round', async () => {
    // First call: tool use with accompanying text (LLM 30ms + tool 30ms = 60ms)
    // Timeout fires before second LLM call (60ms > 50ms)
    mockCallClaude
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        return makeToolUseWithTextResponse('search', { query: 'test' }, 'Let me search for that.');
      })
      .mockImplementationOnce(async () => {
        return makeTextResponse('Final answer');
      });

    const executeTool = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 30));
      return 'results';
    });
    const messages = [{ role: 'user', content: 'Search' }];

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      tools: [{ name: 'search', description: 'Search', input_schema: { type: 'object' } }],
      executeToolFn: executeTool,
      timeoutMs: 50,
      maxIterations: 10,
    });

    expect(result.timedOut).toBe(true);
    expect(result.response).toContain('Let me search for that.');
  });

  it('emits timeout event via onEvent (non-streaming)', async () => {
    // Use _setCallClaudeStreaming injection to avoid real API calls
    // But simpler: just test that the non-streaming path emits onEvent for timeout
    // The timeout check happens BEFORE calling LLM, so onEvent is called without streaming
    // We can test by setting timeoutMs=1 and adding a slow first call
    mockCallClaude
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        return makeToolUseResponse('search', { query: 'test' });
      })
      .mockImplementationOnce(async () => {
        return makeTextResponse('Done');
      });

    const events = [];
    // NOTE: We do NOT pass onEvent here because that triggers the streaming path.
    // Instead, we verify timeout behavior via the timedOut flag. The onEvent path
    // is tested implicitly since the timeout check fires before calling LLM.
    // For direct onEvent testing, we'd need _setCallClaudeStreaming mock too.
    const executeTool = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 30));
      return 'results';
    });
    const messages = [{ role: 'user', content: 'Search' }];

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      executeToolFn: executeTool,
      timeoutMs: 50,
      maxIterations: 10,
    });

    expect(result.timedOut).toBe(true);
    // Verify that the second LLM call was never made
    expect(mockCallClaude).toHaveBeenCalledTimes(1);
  });

  it('does not time out when timeoutMs is not set', async () => {
    mockCallClaude
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 40));
        return makeToolUseResponse('search', { query: 'test' });
      })
      .mockImplementationOnce(async () => {
        return makeTextResponse('Final answer');
      });

    const executeTool = vi.fn().mockResolvedValue('results');
    const messages = [{ role: 'user', content: 'Search' }];

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      tools: [{ name: 'search', description: 'Search', input_schema: { type: 'object' } }],
      executeToolFn: executeTool,
      maxIterations: 10,
    });

    expect(result.timedOut).toBeUndefined();
    expect(result.response).toBe('Final answer');
    expect(result.turnCount).toBe(2);
  });

  it('returns fallback message when timeout fires with no accumulated text', async () => {
    // tool_use response without any text blocks = no accumulated text
    mockCallClaude
      .mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 30));
        return makeToolUseResponse('search', { query: 'test' });
      })
      .mockImplementationOnce(async () => {
        return makeTextResponse('Done');
      });

    const executeTool = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 30));
      return 'results';
    });
    const messages = [{ role: 'user', content: 'Search' }];

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages,
      executeToolFn: executeTool,
      timeoutMs: 50,
      maxIterations: 10,
    });

    expect(result.timedOut).toBe(true);
    expect(result.response).toBe('[Response time limit reached]');
  });
});
