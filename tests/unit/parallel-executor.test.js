// Tests for parallel tool execution in the agent executor
'use strict';

function makeToolBlock(id, name, input = {}) {
  return { id, name, type: 'tool_use', input };
}

function makeContext(toolMap) {
  return {
    brandId: 'test',
    userId: '1',
    pool: {},
    resolveTool: (name) => toolMap[name] || null,
  };
}

// We need to mock the top-level requires that executor.js loads at import time,
// but we only test the exported executeToolsParallel which uses context.resolveTool.
vi.mock('../../src/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../src/agent/llm-client', () => ({ callWithFallback: vi.fn() }));
vi.mock('../../src/tools/registry', () => ({ getTool: () => null, getToolSchemas: () => [] }));
vi.mock('../../src/utils/recall', () => ({ recall: vi.fn() }));
vi.mock('../../src/utils/capture', () => ({ captureMessage: vi.fn() }));
vi.mock('../../src/utils/telegram', () => ({ sendTelegramMessage: vi.fn() }));

const { executeToolsParallel } = require('../../src/agent/executor');

describe('Parallel Tool Execution', () => {

  describe('executeToolsParallel', () => {
    it('runs multiple tools concurrently (wall-clock < sum of delays)', async () => {
      const DELAY = 100;
      const TOOL_COUNT = 3;

      const delayedTool = {
        execute: vi.fn(() => new Promise(resolve =>
          setTimeout(() => resolve({ success: true, data: 'ok', summary: 'done' }), DELAY)
        )),
      };

      const ctx = makeContext({
        'tool_a': delayedTool,
        'tool_b': delayedTool,
        'tool_c': delayedTool,
      });

      const blocks = [
        makeToolBlock('id_1', 'tool_a'),
        makeToolBlock('id_2', 'tool_b'),
        makeToolBlock('id_3', 'tool_c'),
      ];

      const start = Date.now();
      const results = await executeToolsParallel(blocks, ctx);
      const elapsed = Date.now() - start;

      // If sequential, elapsed >= DELAY * TOOL_COUNT (300ms). Parallel should be ~DELAY.
      expect(elapsed).toBeLessThan(DELAY * TOOL_COUNT - 50);
      expect(results).toHaveLength(TOOL_COUNT);

      for (const r of results) {
        const parsed = JSON.parse(r.content);
        expect(parsed.success).toBe(true);
      }
    });

    it('preserves tool_use_id order matching toolBlocks input order', async () => {
      const makeTool = (delay) => ({
        execute: () => new Promise(resolve =>
          setTimeout(() => resolve({ success: true, data: null, summary: 'ok' }), delay)
        ),
      });

      const ctx = makeContext({
        'slow_tool': makeTool(80),
        'fast_tool': makeTool(10),
        'mid_tool': makeTool(40),
      });

      const blocks = [
        makeToolBlock('slow_id', 'slow_tool'),
        makeToolBlock('fast_id', 'fast_tool'),
        makeToolBlock('mid_id', 'mid_tool'),
      ];

      const results = await executeToolsParallel(blocks, ctx);

      expect(results[0].tool_use_id).toBe('slow_id');
      expect(results[1].tool_use_id).toBe('fast_id');
      expect(results[2].tool_use_id).toBe('mid_id');
    });

    it('one failing tool does not block others', async () => {
      const successTool = {
        execute: () => Promise.resolve({ success: true, data: 'ok', summary: 'worked' }),
      };
      const failingTool = {
        execute: () => Promise.reject(new Error('kaboom')),
      };

      const ctx = makeContext({
        'good_tool': successTool,
        'bad_tool': failingTool,
      });

      const blocks = [
        makeToolBlock('id_good_1', 'good_tool'),
        makeToolBlock('id_bad', 'bad_tool'),
        makeToolBlock('id_good_2', 'good_tool'),
      ];

      const results = await executeToolsParallel(blocks, ctx);

      expect(results).toHaveLength(3);

      const parsed0 = JSON.parse(results[0].content);
      expect(parsed0.success).toBe(true);

      const parsed1 = JSON.parse(results[1].content);
      expect(parsed1.success).toBe(false);
      expect(parsed1.summary).toContain('Tool error');

      const parsed2 = JSON.parse(results[2].content);
      expect(parsed2.success).toBe(true);
    });

    it('handles unknown tools gracefully', async () => {
      const ctx = makeContext({});

      const blocks = [
        makeToolBlock('id_1', 'nonexistent_tool'),
        makeToolBlock('id_2', 'also_missing'),
      ];

      const results = await executeToolsParallel(blocks, ctx);

      expect(results).toHaveLength(2);
      const parsed0 = JSON.parse(results[0].content);
      expect(parsed0.success).toBe(false);
      expect(parsed0.summary).toContain('Unknown tool');
    });
  });

  describe('single-tool optimization', () => {
    it('executes directly without Promise.allSettled for a single tool', async () => {
      const tool = {
        execute: vi.fn(() => Promise.resolve({ success: true, data: 'single', summary: 'ran alone' })),
      };

      const ctx = makeContext({ 'solo_tool': tool });

      const allSettledSpy = vi.spyOn(Promise, 'allSettled');

      const blocks = [makeToolBlock('solo_id', 'solo_tool')];
      const results = await executeToolsParallel(blocks, ctx);

      expect(results).toHaveLength(1);
      expect(results[0].tool_use_id).toBe('solo_id');

      const parsed = JSON.parse(results[0].content);
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toBe('ran alone');

      expect(allSettledSpy).not.toHaveBeenCalled();
      allSettledSpy.mockRestore();
    });
  });
});
