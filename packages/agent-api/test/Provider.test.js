'use strict';

const { MemoryProvider } = require('../src/engine/Provider.js');

describe('MemoryProvider', () => {
  it('yields scripted chunks in order then a message_stop', async () => {
    const provider = new MemoryProvider({
      script: [
        { type: 'text_delta', text: 'Hello' },
        { type: 'text_delta', text: ', world' },
        {
          type: 'message_stop',
          stopReason: 'end_turn',
          usage: { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
        },
      ],
    });
    const chunks = [];
    for await (const c of provider.invoke({ systemPrompt: 's', messages: [], tools: [] })) chunks.push(c);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: 'text_delta', text: 'Hello' });
    expect(chunks[2].stopReason).toBe('end_turn');
  });

  it('yields tool_use blocks and stops with reason tool_use', async () => {
    const provider = new MemoryProvider({
      script: [
        { type: 'tool_use', toolUseId: 'tu_1', name: 'vector_search', input: { query: 'foo', limit: 5 } },
        { type: 'message_stop', stopReason: 'tool_use', usage: { inputTokens: 20, outputTokens: 8, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
      ],
    });
    const chunks = [];
    for await (const c of provider.invoke({ systemPrompt: 's', messages: [], tools: [] })) chunks.push(c);
    expect(chunks[0]).toEqual({ type: 'tool_use', toolUseId: 'tu_1', name: 'vector_search', input: { query: 'foo', limit: 5 } });
    expect(chunks[1].stopReason).toBe('tool_use');
  });

  it('records the call args for assertions', async () => {
    const provider = new MemoryProvider({ script: [{ type: 'message_stop', stopReason: 'end_turn', usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } }] });
    const args = { systemPrompt: 'sys', messages: [{ role: 'user', content: 'hi' }], tools: [{ name: 't' }], model: 'claude-sonnet-4-6', cacheBreakpoints: [{ position: 0, kind: 'system' }] };
    for await (const _ of provider.invoke(args)) { /* drain */ }
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toEqual(args);
  });

  it('throws if the script is empty', async () => {
    const provider = new MemoryProvider({ script: [] });
    await expect((async () => {
      for await (const _ of provider.invoke({})) { /* drain */ }
    })()).rejects.toThrow(/script exhausted/i);
  });
});
