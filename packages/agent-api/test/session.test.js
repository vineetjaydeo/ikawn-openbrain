'use strict';

const { MemorySession } = require('../src/engine/session.js');
const { createRunState, appendItem } = require('../src/engine/runState.js');

function fixtureState(conversationId = 'c1') {
  return createRunState({
    conversationId, userId: 'u1', brand: 'ikawn', brandRevision: 1, agent: 'ruhi',
  });
}

describe('MemorySession', () => {
  it('returns null on load for missing conversation', async () => {
    const s = new MemorySession();
    expect(await s.load('missing')).toBeNull();
  });

  it('round-trips save and load', async () => {
    const s = new MemorySession();
    const state = fixtureState();
    await s.save(state);
    const loaded = await s.load('c1');
    expect(loaded).toEqual(state);
  });

  it('isolates by conversationId', async () => {
    const s = new MemorySession();
    await s.save(fixtureState('c1'));
    await s.save(fixtureState('c2'));
    expect((await s.load('c1')).conversationId).toBe('c1');
    expect((await s.load('c2')).conversationId).toBe('c2');
  });

  it('appendItem mutates the stored state', async () => {
    const s = new MemorySession();
    await s.save(fixtureState());
    const item = { type: 'user_message', content: [{ type: 'text', text: 'hi' }], ts: 1 };
    await s.appendItem('c1', item);
    const loaded = await s.load('c1');
    expect(loaded.items).toHaveLength(1);
    expect(loaded.items[0]).toEqual(item);
  });

  it('appendItem on missing conversation throws', async () => {
    const s = new MemorySession();
    const item = { type: 'user_message', content: [], ts: 1 };
    await expect(s.appendItem('missing', item)).rejects.toThrow(/no such conversation/);
  });

  it('appendItem accepts lateSignal opt without breaking', async () => {
    const s = new MemorySession();
    await s.save(fixtureState());
    await s.appendItem('c1', {
      type: 'edit_delta', original: [], edited: [], dimensions: ['tone'], ts: 1,
    }, { lateSignal: true });
    const loaded = await s.load('c1');
    expect(loaded.items).toHaveLength(1);
  });
});
