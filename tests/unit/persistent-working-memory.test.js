// vitest globals enabled
'use strict';

const wm = require('../../src/engine/working-memory');

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
wm._setPool({ query: mockQuery });

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('persistent-working-memory (structured fields)', () => {
  beforeEach(() => {
    wm._clearCache();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('addDecision', () => {
    it('appends to decisions_made array', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });

      await wm.addDecision(SESSION_ID, 'Use Claude for LLM');
      await wm.addDecision(SESSION_ID, 'Deploy to Fly');

      const all = await wm.getAllMemory(SESSION_ID);
      expect(all.decisions_made).toEqual(['Use Claude for LLM', 'Deploy to Fly']);
    });

    it('preserves existing decisions when loading from DB', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ working_memory: { decisions_made: ['Existing decision'] } }],
      });

      await wm.addDecision(SESSION_ID, 'New decision');

      const all = await wm.getAllMemory(SESSION_ID);
      expect(all.decisions_made).toEqual(['Existing decision', 'New decision']);
    });
  });

  describe('addFileModified', () => {
    it('appends file paths and deduplicates', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });

      await wm.addFileModified(SESSION_ID, '/src/db.js');
      await wm.addFileModified(SESSION_ID, '/src/index.js');
      await wm.addFileModified(SESSION_ID, '/src/db.js'); // duplicate

      const all = await wm.getAllMemory(SESSION_ID);
      expect(all.files_modified).toEqual(['/src/db.js', '/src/index.js']);
    });
  });

  describe('addFinding', () => {
    it('appends to key_findings array', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });

      await wm.addFinding(SESSION_ID, 'Memory leak in worker');

      const all = await wm.getAllMemory(SESSION_ID);
      expect(all.key_findings).toEqual(['Memory leak in worker']);
    });
  });

  describe('setPlan', () => {
    it('sets the current plan (overwrites)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });

      await wm.setPlan(SESSION_ID, 'Step 1: Read code\nStep 2: Fix bug');
      let all = await wm.getAllMemory(SESSION_ID);
      expect(all.current_plan).toBe('Step 1: Read code\nStep 2: Fix bug');

      await wm.setPlan(SESSION_ID, 'New plan');
      all = await wm.getAllMemory(SESSION_ID);
      expect(all.current_plan).toBe('New plan');
    });
  });

  describe('addPendingAction + removePendingAction', () => {
    it('adds and removes pending actions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });

      await wm.addPendingAction(SESSION_ID, 'Deploy to staging');
      await wm.addPendingAction(SESSION_ID, 'Run tests');

      let all = await wm.getAllMemory(SESSION_ID);
      expect(all.pending_actions).toEqual(['Deploy to staging', 'Run tests']);

      await wm.removePendingAction(SESSION_ID, 'Deploy to staging');
      all = await wm.getAllMemory(SESSION_ID);
      expect(all.pending_actions).toEqual(['Run tests']);
    });

    it('removePendingAction is a no-op for non-existent action', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });

      await wm.addPendingAction(SESSION_ID, 'Task A');
      await wm.removePendingAction(SESSION_ID, 'Task B'); // not in list

      const all = await wm.getAllMemory(SESSION_ID);
      expect(all.pending_actions).toEqual(['Task A']);
    });
  });

  describe('getStructuredSummary', () => {
    it('formats all structured fields into markdown', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });

      await wm.setPlan(SESSION_ID, 'Fix the bug');
      await wm.addDecision(SESSION_ID, 'Use Haiku for tasks');
      await wm.addFileModified(SESSION_ID, '/src/worker.js');
      await wm.addFinding(SESSION_ID, 'Worker runs every 5s');
      await wm.addPendingAction(SESSION_ID, 'Deploy');

      const summary = await wm.getStructuredSummary(SESSION_ID);

      expect(summary).toContain('## Current Plan');
      expect(summary).toContain('Fix the bug');
      expect(summary).toContain('## Decisions Made');
      expect(summary).toContain('1. Use Haiku for tasks');
      expect(summary).toContain('## Files Modified');
      expect(summary).toContain('- /src/worker.js');
      expect(summary).toContain('## Key Findings');
      expect(summary).toContain('1. Worker runs every 5s');
      expect(summary).toContain('## Pending Actions');
      expect(summary).toContain('- Deploy');
    });

    it('returns empty string when no structured data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });
      const summary = await wm.getStructuredSummary(SESSION_ID);
      expect(summary).toBe('');
    });

    it('omits empty sections', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: {} }] });

      await wm.addDecision(SESSION_ID, 'Only decisions');
      const summary = await wm.getStructuredSummary(SESSION_ID);

      expect(summary).toContain('## Decisions Made');
      expect(summary).not.toContain('## Current Plan');
      expect(summary).not.toContain('## Files Modified');
      expect(summary).not.toContain('## Key Findings');
      expect(summary).not.toContain('## Pending Actions');
    });
  });

  describe('backward compatibility', () => {
    it('structured helpers coexist with freeform setMemory/getMemory', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ working_memory: { existingKey: 'value' } }] });

      await wm.addDecision(SESSION_ID, 'A decision');
      await wm.setMemory(SESSION_ID, 'customField', 123);

      const all = await wm.getAllMemory(SESSION_ID);
      expect(all.existingKey).toBe('value');
      expect(all.customField).toBe(123);
      expect(all.decisions_made).toEqual(['A decision']);
    });
  });
});
