'use strict';

const {
  startProcessor,
  stopProcessor,
  recoverStuckTasks,
  getRunningCount,
  ensureSchema,
  pollOnce,
  claimTask,
  executeClaimedTask,
  rescheduleIfCron,
  _setPool,
  _setExecuteLoop,
  _setSessionManager,
  _resetState,
} = require('../../src/engine/task-processor');

// ── Mock pool ──
const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockPool = { query: mockQuery };

// ── Mock session manager ──
const mockSessionManager = {
  create: vi.fn().mockResolvedValue({ id: 'session-uuid-123' }),
  complete: vi.fn().mockResolvedValue({}),
  fail: vi.fn().mockResolvedValue({}),
};

// ── Mock reasoning loop ──
const mockExecuteLoop = vi.fn().mockResolvedValue({
  response: 'Task completed successfully',
  messages: [],
  totalTokensIn: 100,
  totalTokensOut: 50,
  totalCostUsd: 0.005,
  turnCount: 1,
  toolCallCount: 0,
});

// Inject all mocks
_setPool(mockPool);
_setSessionManager(mockSessionManager);
_setExecuteLoop(mockExecuteLoop);

// Mock agent-presets and tool-registry-v2 modules
vi.mock('../../src/engine/agent-presets', () => ({
  getPreset: vi.fn(() => ({
    type: 'researcher',
    toolScope: ['observe', 'analyze'],
    dollarCap: 0.50,
    modelTier: 'fast',
    systemPromptAddition: 'You are a researcher.',
  })),
}));

vi.mock('../../src/engine/tool-registry-v2', () => ({
  getToolDefinitions: vi.fn(() => [
    { name: 'search_memory', description: 'Search memory', input_schema: {} },
  ]),
}));

// Mock croner
vi.mock('croner', () => ({
  Cron: vi.fn().mockImplementation(() => ({
    nextRun: () => new Date('2026-05-01T12:00:00Z'),
  })),
}));

// ── Helpers ──
function makeTask(overrides = {}) {
  return {
    id: 1,
    uuid: 'task-uuid-1',
    brand_id: 'ikawn',
    user_id: 1,
    agent_slug: 'ruhi',
    name: 'Test Task',
    description: 'A test task',
    tier: 'balanced',
    tool: 'search_memory',
    config: { prompt: 'Do the thing' },
    schedule_type: 'once',
    cron_expression: null,
    timezone: 'UTC',
    enabled: true,
    next_run_at: null,
    last_status: null,
    last_run_at: null,
    run_count: 0,
    consecutive_failures: 0,
    requires_approval: false,
    max_cost_per_run: null,
    task_type: 'on_demand',
    parent_session: null,
    persona: null,
    agent_tools: null,
    ...overrides,
  };
}

describe('task-processor', () => {
  beforeEach(() => {
    _resetState();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockSessionManager.create.mockReset();
    mockSessionManager.create.mockResolvedValue({ id: 'session-uuid-123' });
    mockSessionManager.complete.mockReset();
    mockSessionManager.complete.mockResolvedValue({});
    mockSessionManager.fail.mockReset();
    mockSessionManager.fail.mockResolvedValue({});
    mockExecuteLoop.mockReset();
    mockExecuteLoop.mockResolvedValue({
      response: 'Task completed successfully',
      messages: [],
      totalTokensIn: 100,
      totalTokensOut: 50,
      totalCostUsd: 0.005,
      turnCount: 1,
      toolCallCount: 0,
    });
  });

  describe('ensureSchema', () => {
    it('runs ALTER TABLE migrations', async () => {
      await ensureSchema();
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery.mock.calls[0][0]).toContain('ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS task_type');
      expect(mockQuery.mock.calls[1][0]).toContain('ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS parent_session');
      expect(mockQuery.mock.calls[2][0]).toContain('ALTER TABLE task_runs ADD COLUMN IF NOT EXISTS session_id');
    });
  });

  describe('claimTask', () => {
    it('claims a pending task from DB', async () => {
      const task = makeTask();
      mockQuery.mockResolvedValueOnce({ rows: [task] });

      const result = await claimTask();
      expect(result).toEqual(task);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
      expect(sql).toContain("task_type IN ('sub_agent', 'on_demand', 'hotl_resume')");
    });

    it('returns null when no task is available', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await claimTask();
      expect(result).toBeNull();
    });
  });

  describe('executeClaimedTask', () => {
    it('sets task to running and creates task_run entry', async () => {
      const task = makeTask();

      // Mock responses in order:
      // 1. UPDATE scheduled_tasks SET last_status='running'
      // 2. INSERT INTO task_runs ... RETURNING id
      // 3. UPDATE task_runs SET session_id
      // 4. UPDATE task_runs SET status='completed'
      // 5. UPDATE scheduled_tasks SET last_status='completed'
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })                    // SET running
        .mockResolvedValueOnce({ rows: [{ id: 42 }] })                      // INSERT task_run
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })                    // SET session_id
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })                    // UPDATE task_run completed
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });                   // UPDATE scheduled_task completed

      await executeClaimedTask(task);

      // Check SET running
      expect(mockQuery.mock.calls[0][0]).toContain("last_status = 'running'");

      // Check INSERT task_run
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO task_runs');
    });

    it('creates a session via session manager', async () => {
      const task = makeTask();

      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 42 }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await executeClaimedTask(task);

      expect(mockSessionManager.create).toHaveBeenCalledTimes(1);
      expect(mockSessionManager.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'ikawn',
          agentSlug: 'ruhi',
          channel: 'task',
        })
      );
    });

    it('executes reasoning loop with correct params', async () => {
      const task = makeTask();

      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 42 }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await executeClaimedTask(task);

      expect(mockExecuteLoop).toHaveBeenCalledTimes(1);
      expect(mockExecuteLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-uuid-123',
          brandId: 'ikawn',
          modelTier: 'balanced',
          maxIterations: 25,
        })
      );
    });

    it('updates task_run on success', async () => {
      const task = makeTask();

      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 42 }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await executeClaimedTask(task);

      // The 4th call (index 3) updates task_run as completed
      const updateRunCall = mockQuery.mock.calls[3];
      expect(updateRunCall[0]).toContain("status = 'completed'");
      expect(updateRunCall[0]).toContain('result');

      // The result should be a JSON string with the response
      const resultJson = updateRunCall[1][0];
      const parsed = JSON.parse(resultJson);
      expect(parsed.response).toBe('Task completed successfully');
    });

    it('updates task_run on failure', async () => {
      const task = makeTask();
      mockExecuteLoop.mockRejectedValueOnce(new Error('LLM timeout'));

      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })     // SET running
        .mockResolvedValueOnce({ rows: [{ id: 42 }] })        // INSERT task_run
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })      // SET session_id
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })      // UPDATE task_run failed
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });     // UPDATE scheduled_task failed

      await executeClaimedTask(task);

      // Find the call that updates task_run to failed
      const failCall = mockQuery.mock.calls.find(
        c => c[0].includes("status = 'failed'") && c[0].includes('task_runs')
      );
      expect(failCall).toBeTruthy();
      expect(failCall[1][0]).toBe('LLM timeout');

      // Session should be failed
      expect(mockSessionManager.fail).toHaveBeenCalledWith('session-uuid-123', 'LLM timeout');
    });

    it('completes the session on success', async () => {
      const task = makeTask();

      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 42 }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await executeClaimedTask(task);

      expect(mockSessionManager.complete).toHaveBeenCalledWith(
        'session-uuid-123',
        expect.any(String)
      );
    });
  });

  describe('concurrency', () => {
    it('does not claim a 4th task when 3 are running', async () => {
      // Simulate 3 running tasks by creating slow executeClaimedTask calls
      const slowTasks = [];
      const resolvers = [];

      // Make executeLoop slow
      for (let i = 0; i < 3; i++) {
        const p = new Promise(resolve => resolvers.push(resolve));
        slowTasks.push(p);
      }

      let callCount = 0;
      mockExecuteLoop.mockImplementation(() => {
        const idx = callCount++;
        return slowTasks[idx] || Promise.resolve({
          response: 'done', messages: [], totalTokensIn: 0,
          totalTokensOut: 0, totalCostUsd: 0, turnCount: 1, toolCallCount: 0,
        });
      });

      const task = makeTask();

      // Set up query mocks that return a task on claim
      mockQuery.mockImplementation((sql) => {
        if (sql.includes('FOR UPDATE SKIP LOCKED')) {
          return Promise.resolve({ rows: [makeTask({ id: callCount + 1 })] });
        }
        if (sql.includes('INSERT INTO task_runs')) {
          return Promise.resolve({ rows: [{ id: callCount + 100 }] });
        }
        return Promise.resolve({ rows: [], rowCount: 1 });
      });

      // Start 3 polls — each should claim and start executing
      await pollOnce();
      await pollOnce();
      await pollOnce();

      expect(getRunningCount()).toBe(3);

      // 4th poll should not claim because concurrency limit reached
      const claimCallsBefore = mockQuery.mock.calls.filter(
        c => c[0].includes('FOR UPDATE SKIP LOCKED')
      ).length;

      await pollOnce();

      const claimCallsAfter = mockQuery.mock.calls.filter(
        c => c[0].includes('FOR UPDATE SKIP LOCKED')
      ).length;

      // Should NOT have made another claim query
      expect(claimCallsAfter).toBe(claimCallsBefore);

      // Cleanup: resolve all
      resolvers.forEach(r => r({
        response: 'done', messages: [], totalTokensIn: 0,
        totalTokensOut: 0, totalCostUsd: 0, turnCount: 1, toolCallCount: 0,
      }));

      // Wait for tasks to finish
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });

  describe('recoverStuckTasks', () => {
    it('marks stuck running tasks as failed', async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 2 })    // UPDATE task_runs
        .mockResolvedValueOnce({ rowCount: 1 });    // UPDATE scheduled_tasks

      const count = await recoverStuckTasks();
      expect(count).toBe(2);
      expect(mockQuery.mock.calls[0][0]).toContain("status = 'failed'");
      expect(mockQuery.mock.calls[0][0]).toContain("server_restart");
    });
  });

  describe('rescheduleIfCron', () => {
    it('calculates next_run_at for cron tasks', async () => {
      const task = makeTask({
        schedule_type: 'cron',
        cron_expression: '0 9 * * *',
        timezone: 'UTC',
      });

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await rescheduleIfCron(task);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE scheduled_tasks SET next_run_at');
      // The date is calculated by croner at runtime; just verify it's a valid ISO string
      expect(typeof mockQuery.mock.calls[0][1][0]).toBe('string');
      expect(new Date(mockQuery.mock.calls[0][1][0]).toString()).not.toBe('Invalid Date');
    });

    it('does nothing for non-cron tasks', async () => {
      const task = makeTask({ schedule_type: 'once' });
      await rescheduleIfCron(task);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});
