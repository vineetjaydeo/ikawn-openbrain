'use strict';

const {
  serializeResult,
  extractKeyFindings,
  extractFilePaths,
} = require('../../src/engine/result-serializer');

describe('result-serializer', () => {
  const baseLoopResult = {
    response: 'Analysis complete.\nFound 3 issues.\nAll resolved.',
    messages: [],
    totalTokensIn: 500,
    totalTokensOut: 200,
    totalCostUsd: 0.01,
    turnCount: 3,
    toolCallCount: 2,
    timedOut: false,
    gated: false,
  };

  const baseSession = {
    id: 'session-uuid-123',
    status: 'active',
    working_memory: {},
  };

  const baseTaskRun = {
    id: 1,
    agent_slug: 'researcher',
    tier: 'balanced',
    started_at: new Date(Date.now() - 5000), // 5 seconds ago
  };

  describe('serializeResult', () => {
    it('successful loop produces ok=true with response', () => {
      const result = serializeResult(baseLoopResult, baseSession, baseTaskRun);

      expect(result.ok).toBe(true);
      expect(result.data.response).toBe(baseLoopResult.response);
      expect(result.error).toBeNull();
      expect(result.data.findings.length).toBeGreaterThan(0);
    });

    it('failed loop (no response) produces ok=false with error', () => {
      const failedLoop = { ...baseLoopResult, response: null };
      const result = serializeResult(failedLoop, baseSession, baseTaskRun);

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('metadata includes all expected fields', () => {
      const result = serializeResult(baseLoopResult, baseSession, baseTaskRun);
      const { metadata } = result;

      expect(metadata.agentType).toBe('researcher');
      expect(metadata.totalTokens).toBe(700); // 500 + 200
      expect(metadata.totalCostUsd).toBe(0.01);
      expect(metadata.toolCallsMade).toBe(2);
      expect(metadata.turnCount).toBe(3);
      expect(metadata.durationMs).toBeGreaterThanOrEqual(4000);
      expect(metadata.truncated).toBe(false);
      expect(metadata.budgetExceeded).toBe(false);
      expect(metadata.timedOut).toBe(false);
    });

    it('truncated flag set when max iterations hit', () => {
      const truncatedLoop = {
        ...baseLoopResult,
        response: 'Partial result [Max iterations reached]',
      };
      const result = serializeResult(truncatedLoop, baseSession, baseTaskRun);

      expect(result.ok).toBe(true);
      expect(result.metadata.truncated).toBe(true);
    });

    it('timedOut flag propagated from loop result', () => {
      const timedOutLoop = {
        ...baseLoopResult,
        response: 'Partial answer',
        timedOut: true,
      };
      const result = serializeResult(timedOutLoop, baseSession, baseTaskRun);

      expect(result.ok).toBe(true);
      expect(result.metadata.timedOut).toBe(true);
    });

    it('budgetExceeded flag set when gated', () => {
      const gatedLoop = { ...baseLoopResult, gated: true };
      const result = serializeResult(gatedLoop, baseSession, baseTaskRun);

      expect(result.metadata.budgetExceeded).toBe(true);
    });

    it('handles missing taskRun gracefully', () => {
      const result = serializeResult(baseLoopResult, baseSession, null);

      expect(result.ok).toBe(true);
      expect(result.metadata.agentType).toBe('unknown');
      expect(result.metadata.durationMs).toBe(0);
    });
  });

  describe('extractKeyFindings', () => {
    it('splits text and returns non-empty lines', () => {
      const text = 'Line one\n\nLine two\n  \nLine three';
      const findings = extractKeyFindings(text);

      expect(findings).toEqual(['Line one', 'Line two', 'Line three']);
    });

    it('returns at most 10 findings', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Finding ${i + 1}`);
      const findings = extractKeyFindings(lines.join('\n'));

      expect(findings).toHaveLength(10);
      expect(findings[0]).toBe('Finding 1');
      expect(findings[9]).toBe('Finding 10');
    });

    it('returns empty array for null/undefined input', () => {
      expect(extractKeyFindings(null)).toEqual([]);
      expect(extractKeyFindings(undefined)).toEqual([]);
      expect(extractKeyFindings('')).toEqual([]);
    });
  });

  describe('extractFilePaths', () => {
    it('finds absolute paths in text', () => {
      const text = 'Modified /src/engine/task-processor.js and /src/db.js for the fix.';
      const paths = extractFilePaths(text);

      expect(paths).toContain('/src/engine/task-processor.js');
      expect(paths).toContain('/src/db.js');
    });

    it('deduplicates paths', () => {
      const text = 'Check /src/db.js and also /src/db.js again.';
      const paths = extractFilePaths(text);

      expect(paths).toEqual(['/src/db.js']);
    });

    it('returns empty array for text with no paths', () => {
      const paths = extractFilePaths('No file paths here.');
      expect(paths).toEqual([]);
    });

    it('returns empty array for null input', () => {
      expect(extractFilePaths(null)).toEqual([]);
    });
  });
});
