'use strict';

const { searchMemory, cosineSimilarity, _setPool, _setGetEmbedding } = require('../../src/engine/memory-search');

// Mock embedding function: returns a fixed unit vector
const mockGetEmbedding = vi.fn().mockResolvedValue([1, 0, 0]);
_setGetEmbedding(mockGetEmbedding);

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
_setPool({ query: mockQuery });

describe('memory-search', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockGetEmbedding.mockReset();
    mockGetEmbedding.mockResolvedValue([1, 0, 0]);
  });

  describe('cosineSimilarity', () => {
    it('computes correctly for identical vectors', () => {
      expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    });

    it('computes correctly for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
    });

    it('computes correctly for opposite vectors', () => {
      expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1.0);
    });

    it('returns 0 for zero vectors', () => {
      expect(cosineSimilarity([0, 0, 0], [1, 0, 0])).toBe(0);
    });

    it('returns 0 for mismatched lengths', () => {
      expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    });

    it('returns 0 for null/undefined inputs', () => {
      expect(cosineSimilarity(null, [1, 0, 0])).toBe(0);
      expect(cosineSimilarity([1, 0, 0], undefined)).toBe(0);
    });

    it('computes correctly for arbitrary vectors', () => {
      // cos([3,4], [4,3]) = (12+12)/(5*5) = 24/25 = 0.96
      expect(cosineSimilarity([3, 4], [4, 3])).toBeCloseTo(0.96);
    });
  });

  describe('searchMemory', () => {
    it('returns ranked results by combined score', async () => {
      const now = new Date();
      const recentDate = new Date(now - 1000 * 60 * 60); // 1 hour ago
      const oldDate = new Date(now - 1000 * 60 * 60 * 24 * 30); // 30 days ago

      // First call: episodic query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, content: 'recent similar', content_type: 'message', author_type: 'user', author_ref: null, session_id: 'sess1', embedding: '[0.99, 0.1, 0]', created_at: recentDate, metadata: {} },
          { id: 2, content: 'old similar', content_type: 'message', author_type: 'agent', author_ref: null, session_id: 'sess1', embedding: '[0.95, 0.3, 0]', created_at: oldDate, metadata: {} },
        ],
        rowCount: 2,
      });
      // Second call: semantic query
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const results = await searchMemory({ query: 'test', brandId: 'ikawn', minSimilarity: 0 });

      expect(results.length).toBe(2);
      // Recent + similar should rank higher than old + similar
      expect(results[0].id).toBe(1);
      expect(results[0].combinedScore).toBeGreaterThan(results[1].combinedScore);
    });

    it('filters by minSimilarity threshold', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, content: 'similar', content_type: 'message', author_type: 'user', author_ref: null, session_id: 'sess1', embedding: '[1, 0, 0]', created_at: new Date(), metadata: {} },
          { id: 2, content: 'dissimilar', content_type: 'message', author_type: 'user', author_ref: null, session_id: 'sess1', embedding: '[0, 1, 0]', created_at: new Date(), metadata: {} },
        ],
        rowCount: 2,
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const results = await searchMemory({ query: 'test', brandId: 'ikawn', minSimilarity: 0.5 });

      // Only the similar one (cos=1.0) should pass, not the orthogonal one (cos=0.0)
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(1);
    });

    it('filters by contentTypes', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await searchMemory({
        query: 'test',
        brandId: 'ikawn',
        tables: 'episodic',
        contentTypes: ['decision', 'error'],
      });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('content_type = ANY');
      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain('ikawn');
      expect(params).toContainEqual(['decision', 'error']);
    });

    it('skips superseded semantic facts', async () => {
      // Episodic empty
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Semantic query — only active (superseded_by IS NULL) are queried
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 10, content: 'active fact', fact_type: 'fact', confidence: 0.8, embedding: '[1, 0, 0]', created_at: new Date(), times_referenced: 0 },
        ],
        rowCount: 1,
      });
      // times_referenced update
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const results = await searchMemory({ query: 'test', brandId: 'ikawn', tables: 'both', minSimilarity: 0 });

      // The semantic query SQL should include superseded_by IS NULL
      const semanticCall = mockQuery.mock.calls[1];
      expect(semanticCall[0]).toContain('superseded_by IS NULL');
      expect(results.length).toBe(1);
      expect(results[0].source_table).toBe('semantic_knowledge');
    });

    it('increments times_referenced for returned semantic results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // episodic
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 10, content: 'fact', fact_type: 'fact', confidence: 0.8, embedding: '[1, 0, 0]', created_at: new Date(), times_referenced: 2 },
        ],
        rowCount: 1,
      }); // semantic
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update times_referenced

      await searchMemory({ query: 'test', brandId: 'ikawn', minSimilarity: 0 });

      // Third call should be the UPDATE for times_referenced
      const updateCall = mockQuery.mock.calls[2];
      expect(updateCall[0]).toContain('times_referenced = times_referenced + 1');
      expect(updateCall[1]).toEqual([[10]]);
    });

    it('returns empty array for missing query or brandId', async () => {
      expect(await searchMemory({ query: '', brandId: 'ikawn' })).toEqual([]);
      expect(await searchMemory({ query: 'test', brandId: '' })).toEqual([]);
    });

    it('respects topK limit', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        content: `mem ${i}`,
        content_type: 'message',
        author_type: 'user',
        author_ref: null,
        session_id: 'sess1',
        embedding: `[${1 - i * 0.01}, ${i * 0.01}, 0]`,
        created_at: new Date(),
        metadata: {},
      }));
      mockQuery.mockResolvedValueOnce({ rows, rowCount: rows.length });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const results = await searchMemory({ query: 'test', brandId: 'ikawn', topK: 5, minSimilarity: 0 });
      expect(results.length).toBe(5);
    });
  });
});
