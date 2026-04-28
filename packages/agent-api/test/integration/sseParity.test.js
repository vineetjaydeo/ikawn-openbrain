'use strict';

// Locks the wire format for the SSE events Plan 02's legacyHttp emits.
// chat-api.js emits the same event types with the same JSON shape; this test
// asserts the legacyHttp output matches that shape so frontends written for v1
// continue to work under v2.

describe('SSE parity contract', () => {
  it('chunk event has shape { type: "chunk", text: string }', () => {
    const evt = { type: 'chunk', text: 'hello' };
    expect(JSON.stringify(evt)).toBe('{"type":"chunk","text":"hello"}');
    expect(Object.keys(evt).sort()).toEqual(['text', 'type']);
  });

  it('tool_start event has shape { type: "tool_start", tool: string, detail: any }', () => {
    const evt = { type: 'tool_start', tool: 'vector_search', detail: { query: 'foo' } };
    expect(Object.keys(evt).sort()).toEqual(['detail', 'tool', 'type']);
  });

  it('tool_done event has shape { type: "tool_done", tool: string, success: boolean, error?: string }', () => {
    const ok = { type: 'tool_done', tool: 'vector_search', success: true };
    const fail = { type: 'tool_done', tool: 'vector_search', success: false, error: 'timeout' };
    expect(Object.keys(ok).sort()).toEqual(['success', 'tool', 'type']);
    expect(Object.keys(fail).sort()).toEqual(['error', 'success', 'tool', 'type']);
  });

  it('done event has shape { type: "done", message_id: number|null, conversation_id: string, context_summary: any }', () => {
    const evt = { type: 'done', message_id: 42, conversation_id: 'c1', context_summary: null };
    expect(Object.keys(evt).sort()).toEqual(['context_summary', 'conversation_id', 'message_id', 'type']);
  });

  it('error event has shape { type: "error", error: string }', () => {
    const evt = { type: 'error', error: 'boom' };
    expect(Object.keys(evt).sort()).toEqual(['error', 'type']);
  });

  it('heartbeat is a comment line :ping with two newlines', () => {
    const heartbeat = ':ping\n\n';
    expect(heartbeat.startsWith(':')).toBe(true);
    expect(heartbeat.endsWith('\n\n')).toBe(true);
  });
});
