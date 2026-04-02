import { describe, it, expect, vi, beforeEach } from 'vitest';

const { extractMemories, _setClient, _setCaptureFn } = await import('../../src/utils/memory-extractor.js');

// Mock Anthropic client
const mockCreate = vi.fn();
const mockClient = { messages: { create: mockCreate } };

// Mock captureMessage
const mockCapture = vi.fn().mockResolvedValue(1);

const CTX = { userId: 42, brandId: 'ikawn', conversationId: 'conv-abc-123' };

describe('extractMemories', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCapture.mockReset().mockResolvedValue(1);
    _setClient(mockClient);
    _setCaptureFn(mockCapture);
  });

  it('skips trivial greetings and returns []', async () => {
    const result = await extractMemories('hello!', 'Hi there! How can I help?', CTX);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('skips short trivial messages', async () => {
    const result = await extractMemories('thanks', 'You are welcome!', CTX);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('extracts items and calls captureMessage for each', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        text: JSON.stringify([
          { type: 'fact', content: 'User prefers dark mode for dashboards', confidence: 0.9 },
          { type: 'decision', content: 'Will use PostgreSQL for the new service', confidence: 0.85 },
        ]),
      }],
    });

    const result = await extractMemories(
      'I prefer dark mode for all my dashboards and decided to use PostgreSQL',
      'Great choice! PostgreSQL is excellent for this use case.',
      CTX
    );

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('fact');
    expect(result[1].type).toBe('decision');
    expect(mockCapture).toHaveBeenCalledTimes(2);

    // Verify captureMessage call shape
    const firstCall = mockCapture.mock.calls[0][0];
    expect(firstCall.brand_id).toBe('ikawn');
    expect(firstCall.user_id).toBe(42);
    expect(firstCall.channel).toBe('extraction');
    expect(firstCall.direction).toBe('internal');
    expect(firstCall.memory_type).toBe('fact');
    expect(firstCall.source_ref).toMatch(/^extract_conv-abc-123_/);
    expect(firstCall.metadata.extracted_from).toBe('conversation');
    expect(firstCall.metadata.confidence).toBe(0.9);
  });

  it('filters out items with confidence <= 0.7', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        text: JSON.stringify([
          { type: 'fact', content: 'User might like blue', confidence: 0.5 },
          { type: 'preference', content: 'User strongly prefers minimalist UI', confidence: 0.95 },
          { type: 'fact', content: 'Unsure about timeline', confidence: 0.7 },
        ]),
      }],
    });

    const result = await extractMemories(
      'I think I might prefer minimalist designs, maybe blue, timeline is unclear',
      'Understood, minimalist design is a great direction.',
      CTX
    );

    // Only the 0.95 item should pass (0.5 and 0.7 are filtered)
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.95);
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('returns [] gracefully when Anthropic call fails', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limit'));

    const result = await extractMemories(
      'This is a meaningful conversation about project architecture',
      'Let me help with that architecture decision.',
      CTX
    );

    expect(result).toEqual([]);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('returns [] when JSON parsing fails', async () => {
    mockCreate.mockResolvedValue({
      content: [{ text: 'This is not valid JSON at all' }],
    });

    const result = await extractMemories(
      'Tell me about the project deployment strategy we should use',
      'We should use a blue-green deployment approach.',
      CTX
    );

    expect(result).toEqual([]);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('truncates long messages to 2000 chars before sending to Haiku', async () => {
    const longMessage = 'A'.repeat(5000);

    mockCreate.mockResolvedValue({
      content: [{ text: '[]' }],
    });

    await extractMemories(longMessage, 'Short reply.', CTX);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    const promptContent = callArgs.messages[0].content;

    // The user message portion should be truncated — full prompt should not contain 5000 A's
    expect(promptContent).not.toContain('A'.repeat(5000));
    expect(promptContent).toContain('A'.repeat(2000));
  });

  it('handles empty extraction array', async () => {
    mockCreate.mockResolvedValue({
      content: [{ text: '[]' }],
    });

    const result = await extractMemories(
      'What is the weather like in Tokyo right now?',
      'I do not have real-time weather data.',
      CTX
    );

    expect(result).toEqual([]);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('handles JSON wrapped in markdown code blocks', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        text: '```json\n[{ "type": "commitment", "content": "Will deliver the report by Friday", "confidence": 0.92 }]\n```',
      }],
    });

    const result = await extractMemories(
      'I will deliver the report by Friday without fail',
      'Got it, I have noted the Friday deadline for the report.',
      CTX
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('commitment');
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('defaults unknown type to fact', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        text: JSON.stringify([
          { type: 'random_type', content: 'Something important', confidence: 0.8 },
        ]),
      }],
    });

    const result = await extractMemories(
      'Something important about the infrastructure we discussed',
      'Indeed, that is an important consideration.',
      CTX
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('fact');
  });
});
