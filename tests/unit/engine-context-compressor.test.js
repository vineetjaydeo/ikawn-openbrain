// vitest globals enabled
'use strict';

const { compressMessages, estimateTokens, _setCallSummarize } = require('../../src/engine/context-compressor');

// Mock summarizer — returns a short summary and fake token counts
const mockSummarize = vi.fn().mockResolvedValue({
  summary: 'The user discussed project setup and deployment steps.',
  inputTokens: 500,
  outputTokens: 50,
});
_setCallSummarize(mockSummarize);

/**
 * Helper: create a message with approximately `charCount` characters of content.
 */
function makeMsg(role, charCount) {
  const content = 'x'.repeat(charCount);
  return { role, content };
}

/**
 * Helper: create a tool_result message.
 */
function makeToolResult(charCount) {
  return {
    role: 'user',
    content: [
      { type: 'tool_result', tool_use_id: 'tu_' + Math.random().toString(36).slice(2, 8), content: 'x'.repeat(charCount) },
    ],
  };
}

describe('engine/context-compressor', () => {
  beforeEach(() => {
    mockSummarize.mockReset();
    mockSummarize.mockResolvedValue({
      summary: 'The user discussed project setup and deployment steps.',
      inputTokens: 500,
      outputTokens: 50,
    });
  });

  describe('estimateTokens', () => {
    it('estimates 4 chars per token for string content', () => {
      const msgs = [{ role: 'user', content: 'abcdefgh' }]; // 8 chars = 2 tokens
      expect(estimateTokens(msgs)).toBe(2);
    });

    it('estimates tokens for array content blocks', () => {
      const msgs = [{
        role: 'assistant',
        content: [{ type: 'text', text: 'abcdefghijklmnop' }], // 16 chars = 4 tokens
      }];
      expect(estimateTokens(msgs)).toBe(4);
    });

    it('returns 0 for empty array', () => {
      expect(estimateTokens([])).toBe(0);
    });
  });

  describe('compressMessages', () => {
    it('returns unchanged when below threshold', async () => {
      // tokenLimit=1000, threshold=700 tokens = 2800 chars. Send ~400 chars = 100 tokens.
      const messages = [
        makeMsg('user', 200),
        makeMsg('assistant', 200),
      ];
      const result = await compressMessages(messages, { tokenLimit: 1000 });

      expect(result.compressed).toBe(false);
      expect(result.messages).toBe(messages); // same reference
      expect(result.summary).toBeNull();
      expect(result.tokensSaved).toBe(0);
      expect(result.compressionCostUsd).toBe(0);
      expect(mockSummarize).not.toHaveBeenCalled();
    });

    it('compresses when above 70% of token limit', async () => {
      // tokenLimit=100 tokens, threshold=70 tokens = 280 chars.
      // Build 20 messages of 80 chars each = 400 tokens total (well above 70).
      const messages = [];
      for (let i = 0; i < 20; i++) {
        messages.push(makeMsg(i % 2 === 0 ? 'user' : 'assistant', 80));
      }

      const result = await compressMessages(messages, { tokenLimit: 100, keepRecentMessages: 4 });

      expect(result.compressed).toBe(true);
      expect(result.summary).toBe('The user discussed project setup and deployment steps.');
      expect(result.tokensSaved).toBeGreaterThan(0);
      expect(result.compressionCostUsd).toBeGreaterThan(0);
      expect(mockSummarize).toHaveBeenCalledTimes(1);
    });

    it('preserves system prompt and last N messages', async () => {
      const systemMsg = { role: 'system', content: 'You are a helpful assistant.' };
      const messages = [systemMsg];
      // Add 15 chat messages of 100 chars each = ~375 tokens total
      for (let i = 0; i < 15; i++) {
        messages.push(makeMsg(i % 2 === 0 ? 'user' : 'assistant', 100));
      }

      const result = await compressMessages(messages, { tokenLimit: 200, keepRecentMessages: 5 });

      expect(result.compressed).toBe(true);
      // First message should be system
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toBe('You are a helpful assistant.');
      // Second should be the summary
      expect(result.messages[1].content).toContain('[Context Summary');
      // Last 5 chat messages preserved (indices 11-15 of the original chat messages)
      // Total: 1 system + 1 summary + 5 kept = 7
      expect(result.messages.length).toBe(7);
    });

    it('preserves last N tool results even in older section', async () => {
      const messages = [];
      // 20 regular messages
      for (let i = 0; i < 20; i++) {
        messages.push(makeMsg(i % 2 === 0 ? 'user' : 'assistant', 80));
      }
      // Insert a tool_result at position 5 (in the "older" section)
      messages[5] = makeToolResult(80);

      const result = await compressMessages(messages, {
        tokenLimit: 100,
        keepRecentMessages: 4,
        keepRecentToolResults: 5,
      });

      expect(result.compressed).toBe(true);
      // The tool_result at index 5 should be preserved in the output
      const hasToolResult = result.messages.some(m =>
        m.role === 'user' && Array.isArray(m.content) &&
        m.content.some(p => p.type === 'tool_result')
      );
      expect(hasToolResult).toBe(true);
    });

    it('summary message is inserted correctly after system messages', async () => {
      const systemMsg = { role: 'system', content: 'System prompt' };
      const messages = [systemMsg];
      for (let i = 0; i < 20; i++) {
        messages.push(makeMsg(i % 2 === 0 ? 'user' : 'assistant', 80));
      }

      const result = await compressMessages(messages, { tokenLimit: 100, keepRecentMessages: 4 });

      expect(result.compressed).toBe(true);
      expect(result.messages[0]).toBe(systemMsg);
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[1].content).toContain('[Context Summary');
      expect(result.messages[1].content).toContain('project setup and deployment');
    });

    it('working memory is preserved in summary message', async () => {
      const messages = [];
      for (let i = 0; i < 20; i++) {
        messages.push(makeMsg(i % 2 === 0 ? 'user' : 'assistant', 80));
      }

      const workingMemory = JSON.stringify({ goal: 'Deploy v3', step: 4 });
      const result = await compressMessages(messages, {
        tokenLimit: 100,
        keepRecentMessages: 4,
        workingMemory,
      });

      expect(result.compressed).toBe(true);
      const summaryMsg = result.messages.find(m =>
        typeof m.content === 'string' && m.content.includes('[Working Memory')
      );
      expect(summaryMsg).toBeDefined();
      expect(summaryMsg.content).toContain('Deploy v3');
      expect(summaryMsg.content).toContain('"step":4');
    });

    it('handles summarization failure gracefully', async () => {
      mockSummarize.mockRejectedValueOnce(new Error('API timeout'));

      const messages = [];
      for (let i = 0; i < 20; i++) {
        messages.push(makeMsg(i % 2 === 0 ? 'user' : 'assistant', 80));
      }

      const result = await compressMessages(messages, { tokenLimit: 100, keepRecentMessages: 4 });

      expect(result.compressed).toBe(false);
      expect(result.messages).toBe(messages); // same reference, unchanged
      expect(result.summary).toBeNull();
      expect(result.tokensSaved).toBe(0);
      expect(result.compressionCostUsd).toBe(0);
    });

    it('caps summary input at 80K chars', async () => {
      // Each message is 10K chars, 20 messages = 200K chars total
      const messages = [];
      for (let i = 0; i < 20; i++) {
        messages.push(makeMsg(i % 2 === 0 ? 'user' : 'assistant', 10000));
      }

      await compressMessages(messages, { tokenLimit: 10000, keepRecentMessages: 2 });

      expect(mockSummarize).toHaveBeenCalledTimes(1);
      const inputText = mockSummarize.mock.calls[0][0];
      // The input text passed to summarize should be capped at 80K
      expect(inputText.length).toBeLessThanOrEqual(80000);
    });

    it('returns unchanged for empty messages', async () => {
      const result = await compressMessages([], { tokenLimit: 100 });
      expect(result.compressed).toBe(false);
      expect(result.messages).toEqual([]);
    });

    it('returns unchanged when empty summary returned', async () => {
      mockSummarize.mockResolvedValueOnce({ summary: '', inputTokens: 0, outputTokens: 0 });

      const messages = [];
      for (let i = 0; i < 20; i++) {
        messages.push(makeMsg(i % 2 === 0 ? 'user' : 'assistant', 80));
      }

      const result = await compressMessages(messages, { tokenLimit: 100, keepRecentMessages: 4 });
      expect(result.compressed).toBe(false);
    });
  });
});
