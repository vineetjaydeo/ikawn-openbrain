'use strict';

import { describe, it, expect, vi } from 'vitest';

// Set env before import
process.env.ANTHROPIC_API_KEY = 'test-key';

const { compressContext, estimateTokens, estimateMessagesTokens } = require('../../src/utils/context-compressor');

/**
 * Create a mock Anthropic client with a controllable messages.create method.
 */
function mockClient(createFn) {
  return { messages: { create: createFn } };
}

describe('context-compressor', () => {
  describe('estimateTokens', () => {
    it('estimates ~4 chars per token', () => {
      expect(estimateTokens('abcd')).toBe(1);
      expect(estimateTokens('abcdefgh')).toBe(2);
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens(null)).toBe(0);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('sums tokens across messages', () => {
      const msgs = [
        { role: 'user', content: 'Hello world!!' }, // 14 chars = 4 tokens
        { role: 'assistant', content: 'Hi there' },  // 8 chars = 2 tokens
      ];
      expect(estimateMessagesTokens(msgs)).toBe(6);
    });

    it('handles array content parts', () => {
      const msgs = [
        { role: 'user', content: [{ type: 'text', text: 'Hello world!!' }, { type: 'image', source: {} }] },
      ];
      expect(estimateMessagesTokens(msgs)).toBe(4);
    });
  });

  describe('compressContext', () => {
    it('returns messages unchanged when below threshold', async () => {
      const messages = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const createFn = vi.fn();
      const result = await compressContext(messages, { threshold: 100000, _client: mockClient(createFn) });

      expect(result.compressed).toBe(false);
      expect(result.messages).toBe(messages);
      expect(result.tokensSaved).toBe(0);
      expect(createFn).not.toHaveBeenCalled();
    });

    it('returns unchanged when empty messages', async () => {
      const result = await compressContext([], { threshold: 10 });
      expect(result.compressed).toBe(false);
      expect(result.tokensSaved).toBe(0);
    });

    it('compresses messages above threshold', async () => {
      const longContent = 'A'.repeat(400);
      const messages = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: 'Recent question' },
        { role: 'assistant', content: 'Recent answer' },
      ];

      const createFn = vi.fn().mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Summary of earlier conversation about repeated A characters.' }],
      });

      const result = await compressContext(messages, {
        threshold: 50,
        keepRecent: 2,
        _client: mockClient(createFn),
      });

      expect(result.compressed).toBe(true);
      expect(result.tokensSaved).toBeGreaterThan(0);
      expect(createFn).toHaveBeenCalledTimes(1);

      // system + summary + 2 recent = 4
      expect(result.messages.length).toBe(4);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[1].content).toContain('[Context Summary');
      expect(result.messages[2].content).toBe('Recent question');
      expect(result.messages[3].content).toBe('Recent answer');
    });

    it('preserves recent messages verbatim', async () => {
      const longContent = 'B'.repeat(400);
      const messages = [
        { role: 'system', content: 'System' },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: 'Keep this one' },
        { role: 'assistant', content: 'And this one too' },
      ];

      const createFn = vi.fn().mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Compressed summary.' }],
      });

      const result = await compressContext(messages, {
        threshold: 50,
        keepRecent: 2,
        _client: mockClient(createFn),
      });

      expect(result.compressed).toBe(true);
      const recentMsgs = result.messages.filter(m =>
        m.role !== 'system' && !(typeof m.content === 'string' && m.content.includes('[Context Summary'))
      );
      expect(recentMsgs[0].content).toBe('Keep this one');
      expect(recentMsgs[1].content).toBe('And this one too');
    });

    it('returns original messages when Anthropic call fails', async () => {
      const longContent = 'C'.repeat(400);
      const messages = [
        { role: 'system', content: 'System' },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: 'recent' },
        { role: 'assistant', content: 'recent' },
      ];

      const createFn = vi.fn().mockRejectedValueOnce(new Error('API rate limited'));

      const result = await compressContext(messages, {
        threshold: 50,
        keepRecent: 2,
        _client: mockClient(createFn),
      });

      expect(result.compressed).toBe(false);
      expect(result.messages).toBe(messages);
      expect(result.tokensSaved).toBe(0);
    });

    it('does not compress when fewer messages than keepRecent', async () => {
      const messages = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'A'.repeat(400) },
        { role: 'assistant', content: 'B'.repeat(400) },
      ];

      const createFn = vi.fn();
      // Only 2 chat messages, default keepRecent=8, so nothing to compress
      const result = await compressContext(messages, { threshold: 10, _client: mockClient(createFn) });

      expect(result.compressed).toBe(false);
      expect(createFn).not.toHaveBeenCalled();
    });

    it('uses CONTEXT_COMPRESS_THRESHOLD env var', async () => {
      const original = process.env.CONTEXT_COMPRESS_THRESHOLD;
      process.env.CONTEXT_COMPRESS_THRESHOLD = '999999';

      const messages = [
        { role: 'user', content: 'short' },
      ];

      const result = await compressContext(messages);
      expect(result.compressed).toBe(false);

      if (original) {
        process.env.CONTEXT_COMPRESS_THRESHOLD = original;
      } else {
        delete process.env.CONTEXT_COMPRESS_THRESHOLD;
      }
    });
  });
});
