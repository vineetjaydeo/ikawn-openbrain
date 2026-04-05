// vitest globals enabled
'use strict';

const spawner = require('../../src/engine/agent-spawner');

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
spawner._setPool({ query: mockQuery });

const PARENT_SESSION = '550e8400-e29b-41d4-a716-446655440000';

function mockCountResult(cnt) {
  return { rows: [{ cnt }], rowCount: 1 };
}

function mockInsertResult(id = 42, uuid = 'aabb-ccdd-eeff') {
  return { rows: [{ id, uuid }], rowCount: 1 };
}

describe('agent-spawner', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('spawnAgent', () => {
    it('spawns a researcher with correct scheduled_tasks INSERT', async () => {
      // First call: count query returns 0 active children
      mockQuery.mockResolvedValueOnce(mockCountResult(0));
      // Second call: INSERT returns new row
      mockQuery.mockResolvedValueOnce(mockInsertResult(1, 'uuid-123'));

      const result = await spawner.spawnAgent({
        type: 'researcher',
        prompt: 'Find all usage of OpenAI API',
        parentSession: PARENT_SESSION,
        brandId: 'ikawn',
      });

      expect(result.error).toBeUndefined();
      expect(result.taskId).toBe(1);
      expect(result.taskUuid).toBe('uuid-123');
      expect(result.type).toBe('researcher');
      expect(result.toolScope).toEqual(['observe', 'analyze']);

      // Verify INSERT query
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO scheduled_tasks');
      expect(insertCall[0]).toContain('task_type');
      expect(insertCall[0]).toContain('parent_session');

      const params = insertCall[1];
      expect(params[0]).toBe('ikawn');         // brand_id
      expect(params[1]).toBe('researcher');    // agent_slug
      expect(params[2]).toBe('Sub-agent: researcher'); // name
      expect(params[4]).toBe('agent');         // tier
      expect(params[7]).toBe('once');          // schedule_type
      expect(params[8]).toBe('sub_agent');     // task_type
      expect(params[9]).toBe(PARENT_SESSION);  // parent_session

      // Verify config JSONB
      const config = JSON.parse(params[6]);
      expect(config.prompt).toBe('Find all usage of OpenAI API');
      expect(config.parentSession).toBe(PARENT_SESSION);
      expect(config.toolScope).toEqual(['observe', 'analyze']);
      expect(config.modelTier).toBe('fast');
      expect(config.tokenBudget).toBe(60000);
      expect(config.dollarCap).toBe(0.50);
    });

    it('locks toolScope to preset — caller cannot override', async () => {
      mockQuery.mockResolvedValueOnce(mockCountResult(0));
      mockQuery.mockResolvedValueOnce(mockInsertResult());

      const result = await spawner.spawnAgent({
        type: 'builder',
        prompt: 'Build a widget',
        parentSession: PARENT_SESSION,
        toolScope: ['observe', 'execute', 'ship', 'create'], // caller tries to override
      });

      expect(result.error).toBeUndefined();
      expect(result.toolScope).toEqual(['analyze', 'create']); // preset's scope, not caller's

      const config = JSON.parse(mockQuery.mock.calls[1][1][6]);
      expect(config.toolScope).toEqual(['analyze', 'create']);
    });

    it('uses budget override instead of preset default', async () => {
      mockQuery.mockResolvedValueOnce(mockCountResult(0));
      mockQuery.mockResolvedValueOnce(mockInsertResult());

      const result = await spawner.spawnAgent({
        type: 'analyst',
        prompt: 'Analyze data',
        parentSession: PARENT_SESSION,
        budget: 100000,
        dollarCap: 2.50,
      });

      expect(result.error).toBeUndefined();
      const config = JSON.parse(mockQuery.mock.calls[1][1][6]);
      expect(config.tokenBudget).toBe(100000);
      expect(config.dollarCap).toBe(2.50);
    });

    it('returns error when max 3 children reached', async () => {
      mockQuery.mockResolvedValueOnce(mockCountResult(3));

      const result = await spawner.spawnAgent({
        type: 'researcher',
        prompt: 'Research something',
        parentSession: PARENT_SESSION,
      });

      expect(result.error).toBe('Max 3 active sub-agents per coordinator');
      // Should NOT have called INSERT
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('rejects coordinator type', async () => {
      const result = await spawner.spawnAgent({
        type: 'coordinator',
        prompt: 'Coordinate things',
        parentSession: PARENT_SESSION,
      });

      expect(result.error).toBe('Coordinators cannot spawn other coordinators');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects invalid type', async () => {
      const result = await spawner.spawnAgent({
        type: 'hacker',
        prompt: 'Do stuff',
        parentSession: PARENT_SESSION,
      });

      expect(result.error).toContain('Invalid sub-agent type');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rejects missing prompt', async () => {
      const result = await spawner.spawnAgent({
        type: 'researcher',
        parentSession: PARENT_SESSION,
      });

      expect(result.error).toContain('Prompt is required');
    });

    it('rejects missing parentSession', async () => {
      const result = await spawner.spawnAgent({
        type: 'researcher',
        prompt: 'Do something',
      });

      expect(result.error).toContain('parentSession UUID is required');
    });

    it('truncates long descriptions to 500 chars', async () => {
      mockQuery.mockResolvedValueOnce(mockCountResult(0));
      mockQuery.mockResolvedValueOnce(mockInsertResult());

      const longPrompt = 'x'.repeat(1000);
      await spawner.spawnAgent({
        type: 'researcher',
        prompt: longPrompt,
        parentSession: PARENT_SESSION,
      });

      const description = mockQuery.mock.calls[1][1][3];
      expect(description.length).toBe(500);
    });
  });

  describe('getChildStatus', () => {
    it('returns children with run data', async () => {
      const mockChildren = [
        { id: 1, uuid: 'u1', agent_slug: 'researcher', last_status: 'completed', config: '{}', run_status: 'completed', result: '{"findings":"ok"}', error: null, cost_usd: '0.12' },
        { id: 2, uuid: 'u2', agent_slug: 'builder', last_status: 'running', config: '{}', run_status: 'running', result: null, error: null, cost_usd: '0.00' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockChildren, rowCount: 2 });

      const children = await spawner.getChildStatus(PARENT_SESSION);
      expect(children).toHaveLength(2);
      expect(children[0].agent_slug).toBe('researcher');
      expect(children[1].agent_slug).toBe('builder');

      // Verify query uses correct WHERE
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('parent_session = $1');
      expect(sql).toContain("task_type = 'sub_agent'");
      expect(sql).toContain('LEFT JOIN task_runs');
      expect(mockQuery.mock.calls[0][1]).toEqual([PARENT_SESSION]);
    });

    it('returns empty array when no children', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const children = await spawner.getChildStatus(PARENT_SESSION);
      expect(children).toEqual([]);
    });
  });

  describe('getChildCount', () => {
    it('returns count of active children', async () => {
      mockQuery.mockResolvedValueOnce(mockCountResult(2));
      const count = await spawner.getChildCount(PARENT_SESSION);
      expect(count).toBe(2);

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('parent_session = $1');
      expect(sql).toContain("task_type = 'sub_agent'");
      expect(sql).toContain("last_status NOT IN ('completed', 'failed')");
    });

    it('returns 0 when no active children', async () => {
      mockQuery.mockResolvedValueOnce(mockCountResult(0));
      const count = await spawner.getChildCount(PARENT_SESSION);
      expect(count).toBe(0);
    });
  });
});
