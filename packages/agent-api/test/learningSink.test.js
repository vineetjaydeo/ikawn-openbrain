'use strict';

const { MemoryLearningSink } = require('../src/engine/learningSink.js');

describe('MemoryLearningSink', () => {
  it('records and reads back signals by brand', async () => {
    const s = new MemoryLearningSink();
    await s.recordEditDelta('ikawn', 't1', {
      original: [{ type: 'text', text: 'hi' }],
      edited: [{ type: 'text', text: 'hello' }],
      dimensions: ['tone'],
    });
    const signals = await s.readSignals('ikawn');
    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe('edit_delta');
  });

  it('isolates signals by brand', async () => {
    const s = new MemoryLearningSink();
    await s.recordToolOutcome('ikawn', 't1', { toolUseId: 'u1', positive: true });
    await s.recordToolOutcome('maxfashion', 't2', { toolUseId: 'u2', positive: false });
    expect(await s.readSignals('ikawn')).toHaveLength(1);
    expect(await s.readSignals('maxfashion')).toHaveLength(1);
  });

  it('writes and reads lessons by brand+agent', async () => {
    const s = new MemoryLearningSink();
    await s.writeLesson({ brand: 'ikawn' }, {
      id: 'l1', agent: 'ruhi', topic: 'tone', text: 'be concise',
      embedding: [0.1, 0.2], quality_score: 0.8, created_at: 1,
    });
    const lessons = await s.readLessons({ brand: 'ikawn', agent: 'ruhi' }, 10);
    expect(lessons).toHaveLength(1);
    expect(lessons[0].id).toBe('l1');
  });

  it('readLessons filters by agent', async () => {
    const s = new MemoryLearningSink();
    await s.writeLesson({ brand: 'ikawn' }, {
      id: 'l1', agent: 'ruhi', topic: 't', text: 'x',
      embedding: [], quality_score: 0.5, created_at: 1,
    });
    await s.writeLesson({ brand: 'ikawn' }, {
      id: 'l2', agent: 'lucy', topic: 't', text: 'y',
      embedding: [], quality_score: 0.5, created_at: 2,
    });
    const ruhiLessons = await s.readLessons({ brand: 'ikawn', agent: 'ruhi' }, 10);
    expect(ruhiLessons.map((l) => l.id)).toEqual(['l1']);
  });

  it('records approval and denial signals', async () => {
    const s = new MemoryLearningSink();
    await s.recordApproval('ikawn', 't1', { toolUseId: 'u1', decision: 'approve' });
    await s.recordApproval('ikawn', 't1', { toolUseId: 'u2', decision: 'reject' });
    const signals = await s.readSignals('ikawn');
    expect(signals.map((s) => s.detail.decision)).toEqual(['approve', 'reject']);
  });

  it('writes cross-brand lessons separately', async () => {
    const s = new MemoryLearningSink();
    await s.writeLesson({ crossBrand: true }, {
      id: 'cb1', agent: 'ruhi', topic: 'patterns', text: 'distilled',
      embedding: [], quality_score: 0.7, created_at: 1,
    });
    const cb = await s.readCrossBrandLessons({ agent: 'ruhi' }, 10);
    expect(cb).toHaveLength(1);
    expect(cb[0].id).toBe('cb1');
    // Brand-scoped read should NOT return cross-brand
    const bs = await s.readLessons({ brand: 'ikawn', agent: 'ruhi' }, 10);
    expect(bs).toHaveLength(0);
  });
});
