'use strict';

const {
  SCHEMA_VERSION,
  createRunState,
  appendItem,
  serializeRunState,
  deserializeRunState,
  RUN_ITEM_TYPES,
} = require('../src/engine/runState.js');

describe('createRunState', () => {
  it('produces a state with required fields and defaults', () => {
    const state = createRunState({
      conversationId: 'c1',
      userId: 'u1',
      brand: 'ikawn',
      brandRevision: 1,
      agent: 'ruhi',
    });
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.conversationId).toBe('c1');
    expect(state.brand).toBe('ikawn');
    expect(state.items).toEqual([]);
    expect(state.currentStep).toBe('idle');
    expect(state.pendingApprovals).toEqual([]);
    expect(state.pendingJobs).toEqual([]);
    expect(state.usage).toEqual({
      inputTokens: 0, outputTokens: 0, cacheReads: 0, cacheWrites: 0,
    });
  });

  it('throws if brand is missing', () => {
    expect(() => createRunState({
      conversationId: 'c1', userId: 'u1', brandRevision: 1, agent: 'ruhi',
    })).toThrow(/brand is required/);
  });
});

describe('appendItem', () => {
  it('returns a new state with item appended (immutable)', () => {
    const state = createRunState({
      conversationId: 'c1', userId: 'u1', brand: 'ikawn', brandRevision: 1, agent: 'ruhi',
    });
    const item = { type: 'user_message', content: [{ type: 'text', text: 'hi' }], ts: 1000 };
    const next = appendItem(state, item);
    expect(next.items).toHaveLength(1);
    expect(state.items).toHaveLength(0); // original unchanged
    expect(next.items[0]).toBe(item);
  });

  it('rejects unknown item type', () => {
    const state = createRunState({
      conversationId: 'c1', userId: 'u1', brand: 'ikawn', brandRevision: 1, agent: 'ruhi',
    });
    expect(() => appendItem(state, { type: 'bogus', ts: 1 })).toThrow(/unknown RunItem type/);
  });
});

describe('serialize / deserialize', () => {
  it('round-trips a state with items', () => {
    const state = createRunState({
      conversationId: 'c1', userId: 'u1', brand: 'ikawn', brandRevision: 1, agent: 'ruhi',
    });
    const withItem = appendItem(state, {
      type: 'user_message', content: [{ type: 'text', text: 'hi' }], ts: 1000,
    });
    const json = serializeRunState(withItem);
    const restored = deserializeRunState(json);
    expect(restored).toEqual(withItem);
  });

  it('rejects a payload with unknown schemaVersion', () => {
    const json = JSON.stringify({ schemaVersion: '0.9' });
    expect(() => deserializeRunState(json)).toThrow(/unsupported schemaVersion/);
  });
});

describe('RUN_ITEM_TYPES', () => {
  it('includes all v2.1 item types', () => {
    [
      'user_message', 'assistant_message',
      'tool_call', 'tool_result', 'tool_async_pending',
      'denial', 'approval_pending', 'compaction_boundary',
      'reasoning', 'edit_delta', 'learn_signal',
    ].forEach((t) => {
      expect(RUN_ITEM_TYPES.has(t)).toBe(true);
    });
  });
});
