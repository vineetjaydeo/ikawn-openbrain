'use strict';

const { captureEpisodic, hashContent, _setPool } = require('../../src/engine/episodic-capture');

describe('episodic-dedup', () => {
  describe('hashContent', () => {
    it('returns a hex string for non-empty input', () => {
      const hash = hashContent('hello world');
      expect(typeof hash).toBe('string');
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it('returns consistent hash for same input', () => {
      const a = hashContent('test content');
      const b = hashContent('test content');
      expect(a).toBe(b);
    });

    it('returns different hashes for different content', () => {
      const a = hashContent('content A');
      const b = hashContent('content B');
      expect(a).not.toBe(b);
    });

    it('handles empty string', () => {
      expect(hashContent('')).toBe('0');
    });

    it('handles null/undefined', () => {
      expect(hashContent(null)).toBe('0');
      expect(hashContent(undefined)).toBe('0');
    });

    it('handles long strings without error', () => {
      const longStr = 'x'.repeat(100000);
      const hash = hashContent(longStr);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe('dedup detection in captureEpisodic', () => {
    let mockQuery;

    beforeEach(() => {
      mockQuery = vi.fn();
      _setPool({ query: mockQuery });
    });

    it('skips capture when duplicate found in recent episodes', async () => {
      const content = 'The deployment was successful';
      const hash = hashContent(content);

      // First query: fetch recent episodes (dedup check)
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 42, content: 'The deployment was successful' }, // exact match
          { id: 41, content: 'Something else' },
        ],
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await captureEpisodic({
        brandId: 'ikawn',
        sessionId: 'sess-1',
        content,
        contentType: 'message',
      });

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping duplicate (matches episode 42)')
      );
      // Should NOT have called INSERT
      expect(mockQuery).toHaveBeenCalledTimes(1); // only the SELECT
      consoleSpy.mockRestore();
    });

    it('proceeds with capture when no duplicate found', async () => {
      const content = 'A unique message';

      // First query: fetch recent episodes (no match)
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 10, content: 'Different content' },
          { id: 9, content: 'Also different' },
        ],
      });
      // Second query: INSERT
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await captureEpisodic({
        brandId: 'ikawn',
        sessionId: 'sess-1',
        content,
        contentType: 'message',
      });

      expect(mockQuery).toHaveBeenCalledTimes(2); // SELECT + INSERT
    });

    it('skips dedup when no sessionId provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await captureEpisodic({
        brandId: 'ikawn',
        content: 'No session content',
        contentType: 'message',
      });

      // Should go straight to INSERT (no dedup SELECT)
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT');
    });

    it('proceeds with capture if dedup query fails', async () => {
      // First query: dedup check fails
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
      // Second query: INSERT succeeds
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await captureEpisodic({
        brandId: 'ikawn',
        sessionId: 'sess-1',
        content: 'Some content',
        contentType: 'message',
      });

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('does not capture when content is empty', async () => {
      await captureEpisodic({
        brandId: 'ikawn',
        sessionId: 'sess-1',
        content: '',
      });

      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});
