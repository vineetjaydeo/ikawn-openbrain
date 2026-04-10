'use strict';

const { retrieveRelevantMemories, buildMemoryContext, _setSearchMemory } = require('../../src/engine/memory-augmenter');

const mockSearchMemory = vi.fn();
_setSearchMemory(mockSearchMemory);

describe('memory-augmenter', () => {
  beforeEach(() => {
    mockSearchMemory.mockReset();
  });

  describe('retrieveRelevantMemories', () => {
    it('returns formatted context with episodic and semantic results', async () => {
      mockSearchMemory.mockResolvedValue([
        {
          content: 'User discussed deploy strategy for MaxFashion',
          source_table: 'episodic_memories',
          created_at: '2026-03-15T10:00:00Z',
          similarity: 0.85,
        },
        {
          content: 'MaxFashion uses Shopify Plus, integrated since Feb 2026',
          source_table: 'semantic_knowledge',
          confidence: 0.8,
          similarity: 0.75,
        },
      ]);

      const result = await retrieveRelevantMemories('MaxFashion deploy', { brandId: 'ikawn', userId: 'u1', sessionId: 's1' });

      expect(result).toContain('Relevant context from your memory:');
      expect(result).toContain('[episodic, 2026-03-15]');
      expect(result).toContain('deploy strategy for MaxFashion');
      expect(result).toContain('[semantic, confidence: 0.8]');
      expect(result).toContain('Shopify Plus');

      // Verify searchMemory was called with correct params
      expect(mockSearchMemory).toHaveBeenCalledWith({
        query: 'MaxFashion deploy',
        brandId: 'ikawn',
        userId: 'u1',
        topK: 5,
        minSimilarity: 0.7,
        tables: 'both',
      });
    });

    it('returns null when no results above threshold', async () => {
      mockSearchMemory.mockResolvedValue([]);

      const result = await retrieveRelevantMemories('random query', { brandId: 'ikawn', userId: 'u1' });
      expect(result).toBeNull();
    });

    it('returns null when query is empty', async () => {
      const result = await retrieveRelevantMemories('', { brandId: 'ikawn' });
      expect(result).toBeNull();
      expect(mockSearchMemory).not.toHaveBeenCalled();
    });

    it('returns null when brandId is missing', async () => {
      const result = await retrieveRelevantMemories('test', {});
      expect(result).toBeNull();
      expect(mockSearchMemory).not.toHaveBeenCalled();
    });

    it('truncates to 5000 chars', async () => {
      // Each entry produces ~240 chars in output. We need enough entries
      // to exceed the 5000-char limit and trigger truncation.
      const longContent = 'A'.repeat(300);
      const entries = Array.from({ length: 13 }, (_, i) => ({
        content: longContent,
        source_table: 'semantic_knowledge',
        confidence: 0.9,
        created_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        similarity: 0.9,
      }));
      // Add 12 more episodic entries to push well over 5000 chars
      // 25 entries × ~240 chars each = ~6000 chars + header
      for (let i = 0; i < 12; i++) {
        entries.push({
          content: longContent,
          source_table: 'episodic_memories',
          created_at: `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
          similarity: 0.9,
        });
      }
      mockSearchMemory.mockResolvedValue(entries);

      const result = await retrieveRelevantMemories('test', { brandId: 'ikawn', userId: 'u1' });
      expect(result.length).toBeLessThanOrEqual(5000);
      // With 25 entries of ~240 chars each = ~6000+header, truncation should trigger
      expect(result).toMatch(/\.\.\.$/);
    });
  });

  describe('buildMemoryContext', () => {
    it('extracts query from last user message (string content)', async () => {
      mockSearchMemory.mockResolvedValue([
        { content: 'Some memory', source_table: 'episodic_memories', created_at: '2026-03-01T00:00:00Z', similarity: 0.8 },
      ]);

      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'Tell me about MaxFashion' },
      ];

      const result = await buildMemoryContext(messages, { brandId: 'ikawn', userId: 'u1', sessionId: 's1' });

      expect(result).not.toBeNull();
      expect(mockSearchMemory).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'Tell me about MaxFashion' })
      );
    });

    it('extracts query from content blocks array', async () => {
      mockSearchMemory.mockResolvedValue([
        { content: 'Memory hit', source_table: 'semantic_knowledge', confidence: 0.9, similarity: 0.8 },
      ]);

      const messages = [
        { role: 'user', content: [{ type: 'text', text: 'What about the deploy?' }] },
      ];

      const result = await buildMemoryContext(messages, { brandId: 'ikawn', userId: 'u1' });

      expect(result).not.toBeNull();
      expect(mockSearchMemory).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'What about the deploy?' })
      );
    });

    it('handles empty messages array', async () => {
      const result = await buildMemoryContext([], { brandId: 'ikawn', userId: 'u1' });
      expect(result).toBeNull();
      expect(mockSearchMemory).not.toHaveBeenCalled();
    });

    it('handles null/undefined messages', async () => {
      expect(await buildMemoryContext(null, { brandId: 'ikawn' })).toBeNull();
      expect(await buildMemoryContext(undefined, { brandId: 'ikawn' })).toBeNull();
    });

    it('returns null when no user messages exist', async () => {
      const messages = [
        { role: 'assistant', content: 'Hello' },
        { role: 'assistant', content: 'How can I help?' },
      ];

      const result = await buildMemoryContext(messages, { brandId: 'ikawn', userId: 'u1' });
      expect(result).toBeNull();
      expect(mockSearchMemory).not.toHaveBeenCalled();
    });
  });
});
