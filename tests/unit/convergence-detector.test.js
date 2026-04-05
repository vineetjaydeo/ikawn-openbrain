'use strict';

const { textSimilarity, checkConvergence } = require('../../src/engine/reasoning-loop');

describe('convergence-detector', () => {
  describe('textSimilarity', () => {
    it('returns 1 for identical strings', () => {
      expect(textSimilarity('hello world', 'hello world')).toBe(1);
    });

    it('returns 0 for completely different strings', () => {
      expect(textSimilarity('alpha beta gamma', 'delta epsilon zeta')).toBe(0);
    });

    it('returns value between 0 and 1 for partial overlap', () => {
      const sim = textSimilarity('the quick brown fox', 'the slow brown dog');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    it('handles empty strings', () => {
      expect(textSimilarity('', 'hello')).toBe(0);
      expect(textSimilarity('hello', '')).toBe(0);
      expect(textSimilarity('', '')).toBe(1);
    });

    it('handles null/undefined', () => {
      expect(textSimilarity(null, 'hello')).toBe(0);
      expect(textSimilarity('hello', undefined)).toBe(0);
    });

    it('is case-insensitive', () => {
      expect(textSimilarity('Hello World', 'hello world')).toBe(1);
    });

    it('ignores punctuation', () => {
      expect(textSimilarity('hello, world!', 'hello world')).toBe(1);
    });

    it('returns high similarity for near-identical text', () => {
      const a = 'The deployment was successful and all services are running';
      const b = 'The deployment was successful and all services are running fine';
      const sim = textSimilarity(a, b);
      expect(sim).toBeGreaterThan(0.8);
    });
  });

  describe('checkConvergence', () => {
    it('returns converged=false before turn 6', () => {
      const texts = ['a', 'b', 'c', 'd', 'e'];
      expect(checkConvergence(texts, 5).converged).toBe(false);
      expect(checkConvergence(texts, 4).converged).toBe(false);
      expect(checkConvergence(texts, 0).converged).toBe(false);
    });

    it('returns converged=false with fewer than 6 texts', () => {
      expect(checkConvergence(['a', 'b', 'c'], 7).converged).toBe(false);
    });

    it('detects convergence when last 3 turns match previous 3', () => {
      const repeating = [
        'The system is stable and running',
        'All checks passed no issues found',
        'Everything looks good nothing to report',
        'The system is stable and running',
        'All checks passed no issues found',
        'Everything looks good nothing to report',
      ];
      const result = checkConvergence(repeating, 6);
      expect(result.converged).toBe(true);
      expect(result.avgSimilarity).toBeGreaterThanOrEqual(0.85);
    });

    it('does not false-positive on diverse conversation', () => {
      const diverse = [
        'Let me analyze the deployment logs',
        'I found three errors in the authentication module',
        'The fix requires updating the session handler',
        'Now testing the credit billing system',
        'The webhook integration needs a retry mechanism',
        'Setting up monitoring alerts for production',
      ];
      const result = checkConvergence(diverse, 6);
      expect(result.converged).toBe(false);
      expect(result.avgSimilarity).toBeLessThan(0.85);
    });

    it('uses custom threshold', () => {
      const similar = [
        'checking status of the deployment now',
        'reviewing the test results carefully',
        'analyzing the performance metrics today',
        'checking status of the deployment again',
        'reviewing the test results once more',
        'analyzing the performance metrics again',
      ];
      // With a very low threshold, might converge
      const lowThresh = checkConvergence(similar, 6, 0.3);
      // With a very high threshold, should not
      const highThresh = checkConvergence(similar, 6, 0.99);
      expect(highThresh.converged).toBe(false);
      // avgSimilarity should be a valid number regardless
      expect(typeof lowThresh.avgSimilarity).toBe('number');
    });
  });
});
