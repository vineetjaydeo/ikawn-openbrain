// vitest globals enabled
'use strict';

const { captureEpisodic, classifyContentType, captureFromLoopTurn, _setPool } = require('../../src/engine/episodic-capture');

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
_setPool({ query: mockQuery });

describe('episodic-capture', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  describe('classifyContentType', () => {
    it('returns tool_result for tool_result role', () => {
      expect(classifyContentType('anything', 'tool_result')).toBe('tool_result');
    });

    it('returns decision for decision-indicator text', () => {
      expect(classifyContentType("I'll deploy the fix now", 'assistant')).toBe('decision');
      expect(classifyContentType("Let's go with option A", 'assistant')).toBe('decision');
      expect(classifyContentType('I decided to use Redis', 'assistant')).toBe('decision');
      expect(classifyContentType('We should refactor this', 'assistant')).toBe('decision');
      expect(classifyContentType("I'm going to restart", 'assistant')).toBe('decision');
    });

    it('returns error for error-indicator text', () => {
      expect(classifyContentType('An error occurred in the pipeline', 'assistant')).toBe('error');
      expect(classifyContentType('The task failed with code 1', 'assistant')).toBe('error');
      expect(classifyContentType('Unhandled exception in worker', 'assistant')).toBe('error');
      expect(classifyContentType('System crash detected', 'assistant')).toBe('error');
    });

    it('returns message for user role', () => {
      expect(classifyContentType('Deploy the app', 'user')).toBe('message');
    });

    it('returns message as default', () => {
      expect(classifyContentType('The sky is blue', 'assistant')).toBe('message');
    });

    it('prioritizes error over decision when both match', () => {
      // "I'll fix the error" has both decision and error indicators
      // error check comes first in the code
      expect(classifyContentType("I'll fix the error", 'assistant')).toBe('error');
    });

    it('handles non-string content gracefully', () => {
      expect(classifyContentType(null, 'assistant')).toBe('message');
      expect(classifyContentType(undefined, 'user')).toBe('message');
      expect(classifyContentType(42, 'assistant')).toBe('message');
    });
  });

  describe('captureEpisodic', () => {
    it('inserts a row into episodic_memories', async () => {
      await captureEpisodic({
        brandId: 'ikawn',
        userId: 'user-1',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Hello world',
        contentType: 'message',
        authorType: 'user',
        source: 'web',
      });

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO episodic_memories');
      expect(params[0]).toBe('ikawn');
      expect(params[1]).toBe('user-1');
      expect(params[2]).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(params[3]).toBe('Hello world');
      expect(params[4]).toBe('message');
      expect(params[5]).toBe('user');
      expect(params[7]).toBe('web');
    });

    it('skips insert when content is empty', async () => {
      await captureEpisodic({ brandId: 'ikawn', content: '' });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('skips insert when content is undefined', async () => {
      await captureEpisodic({ brandId: 'ikawn' });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('uses default values for optional fields', async () => {
      await captureEpisodic({ content: 'Test' });

      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe('ikawn');       // brandId default
      expect(params[1]).toBeNull();          // userId
      expect(params[2]).toBeNull();          // sessionId
      expect(params[4]).toBe('message');     // contentType default
      expect(params[5]).toBe('agent');       // authorType default
      expect(params[6]).toBeNull();          // authorRef
      expect(params[7]).toBeNull();          // source
      expect(params[8]).toBeNull();          // expiresAt
      expect(params[9]).toBe('{}');          // metadata
    });

    it('never throws even when DB fails (fire-and-forget)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      // Should not throw
      await expect(captureEpisodic({
        content: 'Test',
        brandId: 'ikawn',
      })).resolves.not.toThrow();
    });
  });

  describe('captureFromLoopTurn', () => {
    it('sets correct fields for assistant turn', async () => {
      await captureFromLoopTurn(
        { content: "I'll deploy now", role: 'assistant' },
        { brandId: 'ikawn', userId: 'u1', sessionId: 'sess-1', channel: 'reasoning' }
      );

      expect(mockQuery).toHaveBeenCalledOnce();
      const [, params] = mockQuery.mock.calls[0];
      expect(params[3]).toBe("I'll deploy now");    // content
      expect(params[4]).toBe('decision');             // auto-classified
      expect(params[5]).toBe('agent');                // authorType
      expect(params[7]).toBe('reasoning');            // source from channel
    });

    it('sets correct fields for tool_result turn', async () => {
      await captureFromLoopTurn(
        { content: 'File written successfully', role: 'tool_result', toolName: 'code_write' },
        { brandId: 'ikawn', sessionId: 'sess-1' }
      );

      expect(mockQuery).toHaveBeenCalledOnce();
      const [, params] = mockQuery.mock.calls[0];
      expect(params[4]).toBe('tool_result');          // contentType
      expect(params[5]).toBe('tool');                 // authorType
      expect(params[6]).toBe('code_write');           // authorRef = toolName
    });

    it('sets correct fields for user turn', async () => {
      await captureFromLoopTurn(
        { content: 'Fix the bug', role: 'user' },
        { brandId: 'ikawn', sessionId: 'sess-1' }
      );

      const [, params] = mockQuery.mock.calls[0];
      expect(params[4]).toBe('message');
      expect(params[5]).toBe('user');
    });

    it('skips when content is empty', async () => {
      await captureFromLoopTurn(
        { content: '', role: 'assistant' },
        { brandId: 'ikawn', sessionId: 'sess-1' }
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('uses reasoning as default source when channel is not provided', async () => {
      await captureFromLoopTurn(
        { content: 'Hello', role: 'assistant' },
        { brandId: 'ikawn', sessionId: 'sess-1' }
      );

      const [, params] = mockQuery.mock.calls[0];
      expect(params[7]).toBe('reasoning');
    });
  });
});
