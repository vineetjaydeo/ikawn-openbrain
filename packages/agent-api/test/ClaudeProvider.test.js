'use strict';

const { ClaudeProvider } = require('../src/engine/ClaudeProvider.js');

function makeFakeClient(scriptedEvents) {
  const calls = [];
  return {
    calls,
    messages: {
      stream: (params) => {
        calls.push(params);
        return {
          [Symbol.asyncIterator]: async function* () {
            for (const ev of scriptedEvents) yield ev;
          },
        };
      },
    },
  };
}

describe('ClaudeProvider request shaping', () => {
  it('selects sonnet for tier=pro by default', async () => {
    const client = makeFakeClient([{ type: 'message_stop', message: { stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } } }]);
    const provider = new ClaudeProvider({ client, defaultModel: 'claude-sonnet-4-6' });
    for await (const _ of provider.invoke({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'hi' }], tools: [], cacheBreakpoints: [] })) { /* drain */ }
    expect(client.calls[0].model).toBe('claude-sonnet-4-6');
  });

  it('selects opus when model override = claude-opus-4-7', async () => {
    const client = makeFakeClient([{ type: 'message_stop', message: { stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } } }]);
    const provider = new ClaudeProvider({ client });
    for await (const _ of provider.invoke({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], cacheBreakpoints: [], model: 'claude-opus-4-7' })) { /* drain */ }
    expect(client.calls[0].model).toBe('claude-opus-4-7');
  });

  it('places cache_control: ephemeral on system block when kind=system breakpoint present', async () => {
    const client = makeFakeClient([{ type: 'message_stop', message: { stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } } }]);
    const provider = new ClaudeProvider({ client });
    for await (const _ of provider.invoke({
      systemPrompt: 'rules',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      cacheBreakpoints: [{ position: 0, kind: 'system' }],
    })) { /* drain */ }
    const call = client.calls[0];
    expect(Array.isArray(call.system)).toBe(true);
    const last = call.system[call.system.length - 1];
    expect(last.cache_control).toEqual({ type: 'ephemeral' });
    expect(last.text).toBe('rules');
  });

  it('places cache_control on the message content block for kind=brand|lessons|history', async () => {
    const client = makeFakeClient([{ type: 'message_stop', message: { stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } } }]);
    const provider = new ClaudeProvider({ client });
    const messages = [
      { role: 'system', content: 'Brand context: acme' },          // position 1
      { role: 'system', content: 'Relevant lessons: ...' },         // position 2
      { role: 'user', content: 'previous turn' },                   // position 3
      { role: 'assistant', content: 'previous reply' },             // position 4
      { role: 'user', content: 'new turn' },                        // position 5 (uncached)
    ];
    await drain(provider.invoke({
      systemPrompt: 'rules',
      messages,
      tools: [],
      cacheBreakpoints: [
        { position: 1, kind: 'brand' },
        { position: 2, kind: 'lessons' },
        { position: 4, kind: 'history' },
      ],
    }));
    const call = client.calls[0];
    expect(getCacheControl(call.messages[0])).toEqual({ type: 'ephemeral' });
    expect(getCacheControl(call.messages[1])).toEqual({ type: 'ephemeral' });
    expect(getCacheControl(call.messages[3])).toEqual({ type: 'ephemeral' });
    expect(getCacheControl(call.messages[4])).toBeUndefined(); // new turn uncached
  });

  it('passes tools through unchanged', async () => {
    const client = makeFakeClient([{ type: 'message_stop', message: { stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } } }]);
    const provider = new ClaudeProvider({ client });
    const tools = [{ name: 'vector_search', description: 'd', input_schema: { type: 'object' } }];
    await drain(provider.invoke({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }], tools, cacheBreakpoints: [] }));
    expect(client.calls[0].tools).toEqual(tools);
  });

  it('uses default maxTokens 4096 when not provided', async () => {
    const client = makeFakeClient([{ type: 'message_stop', message: { stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } } }]);
    const provider = new ClaudeProvider({ client });
    await drain(provider.invoke({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], cacheBreakpoints: [] }));
    expect(client.calls[0].max_tokens).toBe(4096);
  });
});

async function drain(iter) { for await (const _ of iter) { /* drain */ } }
function getCacheControl(message) {
  if (typeof message.content === 'string') return undefined;
  if (!Array.isArray(message.content)) return undefined;
  return message.content[message.content.length - 1].cache_control;
}

describe('ClaudeProvider streaming', () => {
  it('maps content_block_delta text_delta to text_delta chunks', async () => {
    const events = [
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_stop', message: { stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 2 } } },
    ];
    const provider = new ClaudeProvider({ client: makeFakeClient(events) });
    const chunks = [];
    for await (const c of provider.invoke({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], cacheBreakpoints: [] })) chunks.push(c);
    expect(chunks.filter((c) => c.type === 'text_delta')).toEqual([
      { type: 'text_delta', text: 'Hel' },
      { type: 'text_delta', text: 'lo' },
    ]);
  });

  it('buffers tool_use input_json_delta and emits tool_use on content_block_stop', async () => {
    const events = [
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_1', name: 'vector_search', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"foo"' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: ',"limit":5}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_stop', message: { stop_reason: 'tool_use', usage: { input_tokens: 8, output_tokens: 3 } } },
    ];
    const provider = new ClaudeProvider({ client: makeFakeClient(events) });
    const chunks = [];
    for await (const c of provider.invoke({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], cacheBreakpoints: [] })) chunks.push(c);
    const toolUse = chunks.find((c) => c.type === 'tool_use');
    expect(toolUse).toEqual({ type: 'tool_use', toolUseId: 'tu_1', name: 'vector_search', input: { query: 'foo', limit: 5 } });
  });

  it('emits tool_use even when input_schema is empty (no input_json_delta events)', async () => {
    const events = [
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_2', name: 'brand_context_read', input: {} } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_stop', message: { stop_reason: 'tool_use', usage: { input_tokens: 4, output_tokens: 1 } } },
    ];
    const provider = new ClaudeProvider({ client: makeFakeClient(events) });
    const chunks = [];
    for await (const c of provider.invoke({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], cacheBreakpoints: [] })) chunks.push(c);
    const toolUse = chunks.find((c) => c.type === 'tool_use');
    expect(toolUse).toEqual({ type: 'tool_use', toolUseId: 'tu_2', name: 'brand_context_read', input: {} });
  });

  it('throws on malformed tool_use JSON', async () => {
    const events = [
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_3', name: 'x', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"oops":' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_stop', message: { stop_reason: 'tool_use', usage: { input_tokens: 0, output_tokens: 0 } } },
    ];
    const provider = new ClaudeProvider({ client: makeFakeClient(events) });
    await expect((async () => {
      for await (const _ of provider.invoke({ systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], cacheBreakpoints: [] })) { /* drain */ }
    })()).rejects.toThrow(/JSON/i);
  });
});
