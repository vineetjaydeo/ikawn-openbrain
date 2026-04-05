'use strict';

const {
  extractSemanticKnowledge,
  _setPool,
  _setCallClaude,
  _setGetEmbedding,
} = require('../../src/workers/semantic-extractor');

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockPool = { query: mockQuery };
_setPool(mockPool);

const mockCallClaude = vi.fn();
_setCallClaude(mockCallClaude);

const mockGetEmbedding = vi.fn().mockResolvedValue([1, 0, 0]);
_setGetEmbedding(mockGetEmbedding);

function makeEpisodicRows(count, sessionId = 'sess-1') {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    session_id: sessionId,
    content: `User message ${i + 1}`,
    content_type: 'message',
    author_type: 'user',
    created_at: new Date(),
  }));
}

function makeLLMResponse(facts) {
  return {
    response: {
      content: [{ type: 'text', text: JSON.stringify(facts) }],
    },
    cost: { costUsd: 0.001 },
  };
}

describe('semantic-extractor', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockCallClaude.mockReset();
    mockGetEmbedding.mockReset();
    mockGetEmbedding.mockResolvedValue([1, 0, 0]);
  });

  it('extracts facts from episodic memories via Haiku', async () => {
    const memories = makeEpisodicRows(3);

    // 1st call: SELECT unprocessed episodic memories
    mockQuery.mockResolvedValueOnce({ rows: memories, rowCount: 3 });

    // LLM returns facts
    mockCallClaude.mockResolvedValueOnce(makeLLMResponse([
      { fact: 'The user prefers dark mode', confidence: 0.8, reasoning: 'stated preference' },
    ]));

    // Embed the fact
    mockGetEmbedding.mockResolvedValueOnce([0.9, 0.1, 0]);

    // Search existing semantic_knowledge (empty)
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    // INSERT new fact
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 100 }], rowCount: 1 });

    // Mark processed
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });

    // cost_events insert
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const stats = await extractSemanticKnowledge('ikawn');

    expect(stats.extracted).toBe(1);
    expect(stats.cost).toBeGreaterThan(0);

    // Verify Haiku model was used
    expect(mockCallClaude).toHaveBeenCalledTimes(1);
    const callArgs = mockCallClaude.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-haiku-4-5-20251001');
  });

  it('marks memories as processed', async () => {
    const memories = makeEpisodicRows(2);
    mockQuery.mockResolvedValueOnce({ rows: memories, rowCount: 2 });

    // LLM returns no facts
    mockCallClaude.mockResolvedValueOnce(makeLLMResponse([]));

    // Mark processed
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 });

    await extractSemanticKnowledge('ikawn');

    // The last query should be the UPDATE for processed_for_extraction
    const processedCall = mockQuery.mock.calls.find(c =>
      c[0].includes('processed_for_extraction = true')
    );
    expect(processedCall).toBeTruthy();
    expect(processedCall[1]).toEqual([[1, 2]]);
  });

  it('deduplicates: similar existing fact is skipped', async () => {
    const memories = makeEpisodicRows(1);
    mockQuery.mockResolvedValueOnce({ rows: memories, rowCount: 1 });

    mockCallClaude.mockResolvedValueOnce(makeLLMResponse([
      { fact: 'User likes dark mode', confidence: 0.9 },
    ]));

    // Embed fact → same as existing
    mockGetEmbedding.mockResolvedValueOnce([1, 0, 0]);

    // Search existing: has a near-identical fact (embedding very similar)
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 50, content: 'User prefers dark mode', embedding: '[1, 0, 0]' }],
      rowCount: 1,
    });

    // Mark processed
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const stats = await extractSemanticKnowledge('ikawn');

    expect(stats.skipped).toBe(1);
    expect(stats.extracted).toBe(0);
  });

  it('supersedes: contradicting fact creates new entry, old superseded', async () => {
    const memories = makeEpisodicRows(1);
    mockQuery.mockResolvedValueOnce({ rows: memories, rowCount: 1 });

    mockCallClaude.mockResolvedValueOnce(makeLLMResponse([
      { fact: 'User now prefers light mode', confidence: 0.85 },
    ]));

    // Embed fact — partially similar (sim ~0.8 with existing)
    // cos([1,0,0], [0.8,0.6,0]) = 0.8/1.0 = 0.8 — in the 0.7-0.9 contradiction range
    mockGetEmbedding.mockResolvedValueOnce([1, 0, 0]);

    // Search existing: has a related but different fact
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 50, content: 'User prefers dark mode', embedding: '[0.8, 0.6, 0]' }],
      rowCount: 1,
    });

    // INSERT new fact
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 101 }], rowCount: 1 });

    // UPDATE old fact's superseded_by
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    // Mark processed
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    // cost_events
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const stats = await extractSemanticKnowledge('ikawn');

    expect(stats.superseded).toBe(1);
    expect(stats.extracted).toBe(1);

    // Verify the superseded_by UPDATE (not the SELECT which also mentions superseded_by)
    const supersedeCall = mockQuery.mock.calls.find(c =>
      c[0].includes('SET superseded_by')
    );
    expect(supersedeCall).toBeTruthy();
    expect(supersedeCall[1]).toEqual([101, 50]);
  });

  it('empty batch is a no-op', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const stats = await extractSemanticKnowledge('ikawn');

    expect(stats.extracted).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(stats.superseded).toBe(0);
    expect(stats.cost).toBe(0);
    expect(mockCallClaude).not.toHaveBeenCalled();
  });
});
