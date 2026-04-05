'use strict';

const {
  executeReasoningLoop,
  _setCallClaude,
  _setCallClaudeStreaming,
} = require('../../src/engine/reasoning-loop');
const { _setPool: setCostPool } = require('../../src/engine/cost-tracker');

// Mock DB for cost-tracker
const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
setCostPool({ query: mockQuery });

// Mock non-streaming callClaude (needed for non-streaming path test)
const mockCallClaude = vi.fn();
_setCallClaude(mockCallClaude);

// Mock streaming callClaudeStreaming
const mockCallClaudeStreaming = vi.fn();
_setCallClaudeStreaming(mockCallClaudeStreaming);

/**
 * Helper: create a mock streaming response that yields events then
 * returns a buildResult matching callClaudeStreaming's contract.
 *
 * @param {Array} contentBlocks - Array of { type, text?, name?, id?, input? }
 * @param {Object} cost - { inputTokens, outputTokens, costUsd }
 * @param {string} [stopReason='end_turn']
 */
function makeMockStream(contentBlocks, cost, stopReason = 'end_turn') {
  async function* eventGenerator() {
    for (const block of contentBlocks) {
      if (block.type === 'text') {
        // Emit text as a series of deltas (split into chunks for realism)
        const chunks = block.text.match(/.{1,10}/g) || [];
        for (const chunk of chunks) {
          yield { type: 'text_delta', text: chunk };
        }
      } else if (block.type === 'tool_use') {
        yield { type: 'tool_use_start', id: block.id, name: block.name };
        // tool_use_delta events would come here in real stream but
        // reasoning-loop doesn't forward them, so skip
      } else if (block.type === 'server_tool_use') {
        yield { type: 'server_tool_start', id: block.id, name: block.name, input: block.input };
      } else if (block.type === 'server_tool_done') {
        yield { type: 'server_tool_done', name: block.name };
      }
    }
  }

  // Build the response content array matching what buildResult() returns
  const responseContent = contentBlocks
    .filter(b => b.type === 'text' || b.type === 'tool_use')
    .map(b => {
      if (b.type === 'text') return { type: 'text', text: b.text };
      if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input || {} };
      return b;
    });

  return {
    events: eventGenerator(),
    buildResult: () => ({
      response: { content: responseContent, stop_reason: stopReason },
      cost: {
        model: 'claude-sonnet-4-6',
        inputTokens: cost.inputTokens || 100,
        outputTokens: cost.outputTokens || 50,
        costUsd: cost.costUsd || 0.001,
      },
    }),
  };
}

function makeTextResponse(text, inputTokens = 100, outputTokens = 50) {
  return {
    response: {
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    },
    cost: { model: 'claude-sonnet-4-6', inputTokens, outputTokens, costUsd: 0.001 },
  };
}

describe('reasoning-loop-streaming', () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
    mockCallClaudeStreaming.mockReset();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('emits text_delta events during streaming', async () => {
    mockCallClaudeStreaming.mockReturnValueOnce(
      makeMockStream(
        [{ type: 'text', text: 'Hello world' }],
        { inputTokens: 100, outputTokens: 50, costUsd: 0.001 }
      )
    );

    const events = [];
    const onEvent = (e) => events.push(e);

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Hi' }],
      executeToolFn: vi.fn(),
      onEvent,
    });

    expect(result.response).toBe('Hello world');
    expect(result.turnCount).toBe(1);

    // Should have thinking, text_delta(s), and done
    const types = events.map(e => e.type);
    expect(types[0]).toBe('thinking');
    expect(types).toContain('text_delta');
    expect(types[types.length - 1]).toBe('done');

    // All text_delta events should reconstruct the full text
    const streamedText = events
      .filter(e => e.type === 'text_delta')
      .map(e => e.text)
      .join('');
    expect(streamedText).toBe('Hello world');
  });

  it('emits tool_start and tool_result events for tool use', async () => {
    // First call: tool use
    mockCallClaudeStreaming.mockReturnValueOnce(
      makeMockStream(
        [{ type: 'tool_use', id: 'tool_1', name: 'search', input: { query: 'test' } }],
        { costUsd: 0.001 },
        'tool_use'
      )
    );
    // Second call: text response after tool
    mockCallClaudeStreaming.mockReturnValueOnce(
      makeMockStream(
        [{ type: 'text', text: 'Found results' }],
        { costUsd: 0.001 }
      )
    );

    const executeTool = vi.fn().mockResolvedValue('search results');
    const events = [];
    const onEvent = (e) => events.push(e);

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Search' }],
      tools: [{ name: 'search', description: 'Search', input_schema: { type: 'object' } }],
      executeToolFn: executeTool,
      onEvent,
    });

    expect(result.response).toBe('Found results');
    expect(result.turnCount).toBe(2);
    expect(result.toolCallCount).toBe(1);

    const types = events.map(e => e.type);
    expect(types).toContain('tool_start');
    expect(types).toContain('tool_result');

    const toolStart = events.find(e => e.type === 'tool_start');
    expect(toolStart.name).toBe('search');

    const toolResult = events.find(e => e.type === 'tool_result');
    expect(toolResult.name).toBe('search');
    expect(toolResult.success).toBe(true);
  });

  it('emits done event with cost summary', async () => {
    mockCallClaudeStreaming.mockReturnValueOnce(
      makeMockStream(
        [{ type: 'text', text: 'Done' }],
        { inputTokens: 200, outputTokens: 100, costUsd: 0.005 }
      )
    );

    const events = [];
    const onEvent = (e) => events.push(e);

    await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Hi' }],
      executeToolFn: vi.fn(),
      onEvent,
    });

    const done = events.find(e => e.type === 'done');
    expect(done).toBeTruthy();
    expect(done.totalCostUsd).toBe(0.005);
    expect(done.turnCount).toBe(1);
    expect(done.toolCallCount).toBe(0);
  });

  it('non-streaming path is unchanged when no onEvent', async () => {
    mockCallClaude.mockResolvedValueOnce(makeTextResponse('Hello'));

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Hi' }],
      executeToolFn: vi.fn(),
    });

    expect(result.response).toBe('Hello');
    expect(mockCallClaude).toHaveBeenCalledTimes(1);
    // Streaming should NOT have been called
    expect(mockCallClaudeStreaming).not.toHaveBeenCalled();
  });

  it('events emitted in correct order: thinking -> text_delta(s) -> done', async () => {
    mockCallClaudeStreaming.mockReturnValueOnce(
      makeMockStream(
        [{ type: 'text', text: 'Response text' }],
        { costUsd: 0.001 }
      )
    );

    const events = [];
    const onEvent = (e) => events.push(e);

    await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Hi' }],
      executeToolFn: vi.fn(),
      onEvent,
    });

    const types = events.map(e => e.type);
    // First event must be thinking
    expect(types[0]).toBe('thinking');
    // Last event must be done
    expect(types[types.length - 1]).toBe('done');
    // All text_deltas must be between thinking and done
    const thinkingIdx = 0;
    const doneIdx = types.length - 1;
    events.forEach((e, i) => {
      if (e.type === 'text_delta') {
        expect(i).toBeGreaterThan(thinkingIdx);
        expect(i).toBeLessThan(doneIdx);
      }
    });
  });

  it('with tool use: thinking -> tool_start -> tool_result -> thinking -> text_delta(s) -> done', async () => {
    // Turn 1: tool use
    mockCallClaudeStreaming.mockReturnValueOnce(
      makeMockStream(
        [{ type: 'tool_use', id: 'tool_1', name: 'lookup', input: { id: 42 } }],
        { costUsd: 0.001 },
        'tool_use'
      )
    );
    // Turn 2: final text
    mockCallClaudeStreaming.mockReturnValueOnce(
      makeMockStream(
        [{ type: 'text', text: 'Answer' }],
        { costUsd: 0.001 }
      )
    );

    const executeTool = vi.fn().mockResolvedValue('data');
    const events = [];
    const onEvent = (e) => events.push(e);

    await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Look up 42' }],
      tools: [{ name: 'lookup', description: 'Lookup', input_schema: { type: 'object' } }],
      executeToolFn: executeTool,
      onEvent,
    });

    const types = events.map(e => e.type);

    // Expected order: thinking, tool_start, tool_result, thinking, text_delta(s), done
    expect(types[0]).toBe('thinking');
    expect(types[1]).toBe('tool_start');
    expect(types[2]).toBe('tool_result');
    expect(types[3]).toBe('thinking');
    // Then text_deltas
    const textDeltaStart = types.indexOf('text_delta');
    expect(textDeltaStart).toBeGreaterThan(3);
    // Last is done
    expect(types[types.length - 1]).toBe('done');
  });

  it('emits tool_result with success=false on tool error', async () => {
    // Turn 1: tool use
    mockCallClaudeStreaming.mockReturnValueOnce(
      makeMockStream(
        [{ type: 'tool_use', id: 'tool_1', name: 'broken', input: {} }],
        { costUsd: 0.001 },
        'tool_use'
      )
    );
    // Turn 2: recovery text
    mockCallClaudeStreaming.mockReturnValueOnce(
      makeMockStream(
        [{ type: 'text', text: 'Recovered' }],
        { costUsd: 0.001 }
      )
    );

    const executeTool = vi.fn().mockRejectedValue(new Error('boom'));
    const events = [];
    const onEvent = (e) => events.push(e);

    const result = await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Do it' }],
      executeToolFn: executeTool,
      onEvent,
    });

    expect(result.response).toBe('Recovered');

    const toolResult = events.find(e => e.type === 'tool_result');
    expect(toolResult).toBeTruthy();
    expect(toolResult.name).toBe('broken');
    expect(toolResult.success).toBe(false);
  });

  it('emits server tool events (web search)', async () => {
    mockCallClaudeStreaming.mockReturnValueOnce(
      makeMockStream(
        [
          { type: 'server_tool_use', id: 'st_1', name: 'web_search', input: { query: 'latest news' } },
          { type: 'server_tool_done', name: 'web_search' },
          { type: 'text', text: 'Here are the results' },
        ],
        { costUsd: 0.002 }
      )
    );

    const events = [];
    const onEvent = (e) => events.push(e);

    await executeReasoningLoop({
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Search the web' }],
      executeToolFn: vi.fn(),
      onEvent,
    });

    const serverStart = events.find(e => e.type === 'tool_start' && e.name === 'web_search');
    expect(serverStart).toBeTruthy();
    expect(serverStart.detail).toBe('latest news');

    const serverDone = events.find(e => e.type === 'tool_done' && e.name === 'web_search');
    expect(serverDone).toBeTruthy();
    expect(serverDone.success).toBe(true);
  });
});
