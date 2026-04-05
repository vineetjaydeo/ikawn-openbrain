// vitest globals enabled

// Modules under test
const agentSpawner = require('../../src/engine/agent-spawner');
const { getPreset } = require('../../src/engine/agent-presets');
const { serializeResult } = require('../../src/engine/result-serializer');
const {
  handleToolFailure,
  handleTokenBudgetExceeded,
  handleDollarCapExceeded,
  handleCoordinatorCapExceeded,
} = require('../../src/engine/failure-handler');
const costTracker = require('../../src/engine/cost-tracker');
const resultNotifier = require('../../src/engine/result-notifier');

/**
 * Inline mock pool factory — avoids importing mock-db.js which uses
 * require('vitest') (fails in CJS under vitest 4). Uses the global vi instead.
 */
function createMockPool() {
  const queries = [];
  const mockResults = new Map();
  const defaultResult = { rows: [], rowCount: 0 };

  const pool = {
    query: vi.fn(async (text, params) => {
      queries.push({ text, params });
      for (const [pattern, result] of mockResults) {
        if (typeof pattern === 'string' && text.includes(pattern)) {
          return typeof result === 'function' ? result(text, params) : result;
        }
        if (pattern instanceof RegExp && pattern.test(text)) {
          return typeof result === 'function' ? result(text, params) : result;
        }
      }
      return defaultResult;
    }),
    connect: vi.fn(async () => ({
      query: pool.query,
      release: vi.fn(),
    })),
    end: vi.fn(),
  };

  return {
    pool,
    getQueries: () => queries,
    clearQueries: () => { queries.length = 0; },
    mockQuery: (pattern, result) => mockResults.set(pattern, result),
    clearMocks: () => mockResults.clear(),
  };
}

describe('Orchestration Flow', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockPool();
    agentSpawner._setPool(mockDb.pool);
    costTracker._setPool(mockDb.pool);
    resultNotifier._setPool(mockDb.pool);
    mockDb.clearQueries();
    mockDb.clearMocks();
  });

  // ── 1. Full coordinator -> sub-agent spawn flow ──

  it('full coordinator -> sub-agent flow: spawn creates correct task entry', async () => {
    // Mock: no active children yet
    mockDb.mockQuery('SELECT COUNT', { rows: [{ cnt: 0 }] });

    // Mock: INSERT returning a task row
    mockDb.mockQuery('INSERT INTO scheduled_tasks', {
      rows: [{ id: 42, uuid: 'task-uuid-abc' }],
    });

    const result = await agentSpawner.spawnAgent({
      type: 'researcher',
      prompt: 'What Node.js version does OpenBrain use?',
      parentSession: 'parent-uuid-123',
      brandId: 'ikawn',
    });

    expect(result.type).toBe('researcher');
    expect(result.toolScope).toEqual(['observe', 'analyze']);
    expect(result.taskId).toBe(42);
    expect(result.taskUuid).toBe('task-uuid-abc');

    // Verify the INSERT query was called with correct params
    const insertQuery = mockDb.getQueries().find(q => q.text.includes('INSERT INTO scheduled_tasks'));
    expect(insertQuery).toBeTruthy();
    expect(insertQuery.params).toContain('ikawn');       // brandId
    expect(insertQuery.params).toContain('researcher');  // agent_slug
    expect(insertQuery.params).toContain('parent-uuid-123'); // parent_session
  });

  // ── 2. Tool scope locked to preset ──

  it('agent presets enforce tool scope', () => {
    const researcher = getPreset('researcher');
    expect(researcher.toolScope).toEqual(['observe', 'analyze']);
    expect(researcher.toolScope).not.toContain('create');
    expect(researcher.toolScope).not.toContain('ship');

    const builder = getPreset('builder');
    expect(builder.toolScope).toEqual(['analyze', 'create']);
    expect(builder.toolScope).not.toContain('ship');

    const deployer = getPreset('deployer');
    expect(deployer.toolScope).toEqual(['execute', 'ship']);
    expect(deployer.toolScope).not.toContain('create');
  });

  // ── 3. Max 3 sub-agents enforced ──

  it('max 3 sub-agents enforced', async () => {
    // Mock: 3 active children already exist
    mockDb.mockQuery('SELECT COUNT', { rows: [{ cnt: 3 }] });

    const result = await agentSpawner.spawnAgent({
      type: 'researcher',
      prompt: 'Another task',
      parentSession: 'parent-uuid-123',
      brandId: 'ikawn',
    });

    expect(result.error).toBe('Max 3 active sub-agents per coordinator');
    expect(result.taskId).toBeUndefined();
  });

  // ── 4. Result serialization produces structured envelope ──

  it('result serialization produces structured envelope', () => {
    const mockLoopResult = {
      response: 'OpenBrain uses Node.js 20.\nFound in package.json engines field.\nFile: /Users/vineet/ikawn-openbrain/package.json',
      messages: [],
      totalTokensIn: 500,
      totalTokensOut: 100,
      totalCostUsd: 0.001,
      turnCount: 2,
      toolCallCount: 1,
    };

    const mockSession = { id: 'session-uuid-1', agent_slug: 'researcher' };
    const mockTaskRun = {
      agent_slug: 'researcher',
      started_at: new Date(Date.now() - 5000),
    };

    const serialized = serializeResult(mockLoopResult, mockSession, mockTaskRun);

    expect(serialized.ok).toBe(true);
    expect(serialized.data.response).toContain('Node.js 20');
    expect(serialized.data.filesModified).toContain('/Users/vineet/ikawn-openbrain/package.json');
    expect(serialized.data.findings.length).toBeGreaterThan(0);
    expect(serialized.metadata.agentType).toBe('researcher');
    expect(serialized.metadata.totalCostUsd).toBe(0.001);
    expect(serialized.metadata.toolCallsMade).toBe(1);
    expect(serialized.metadata.turnCount).toBe(2);
    expect(serialized.metadata.durationMs).toBeGreaterThan(0);
    expect(serialized.error).toBeNull();
  });

  // ── 5. Failure handler returns correct decisions per category ──

  it('failure handler: execute category -> suspend', () => {
    const decision = handleToolFailure(
      { ok: false, error: 'timeout', suspend: true },
      { category: 'execute' },
      {}
    );
    expect(decision.action).toBe('suspend');
    expect(decision.suspend).toBe(true);
  });

  it('failure handler: ship category -> hotl_required', () => {
    const decision = handleToolFailure(
      { ok: false, error: 'deploy failed', hotl: true },
      { category: 'ship' },
      {}
    );
    expect(decision.action).toBe('hotl_required');
    expect(decision.hotl).toBe(true);
  });

  it('failure handler: observe category -> continue', () => {
    const decision = handleToolFailure(
      { ok: false, error: 'file not found' },
      { category: 'observe' },
      {}
    );
    expect(decision.action).toBe('continue');
  });

  it('failure handler: token budget exceeded -> partial_result', () => {
    const decision = handleTokenBudgetExceeded(
      { response: 'partial answer so far...' },
      { id: 'session-1' }
    );
    expect(decision.action).toBe('partial_result');
    expect(decision.truncated).toBe(true);
    expect(decision.data.partialResults).toBe(true);
  });

  it('failure handler: dollar cap exceeded -> stop', () => {
    const decision = handleDollarCapExceeded({ id: 'session-1' }, 2.50, 2.00);
    expect(decision.action).toBe('stop');
    expect(decision.budgetExceeded).toBe(true);
    expect(decision.data.spent).toBe(2.50);
    expect(decision.data.cap).toBe(2.00);
  });

  it('failure handler: coordinator cap exceeded -> cascade_kill', () => {
    const children = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const decision = handleCoordinatorCapExceeded({ id: 'session-1' }, children);
    expect(decision.action).toBe('cascade_kill');
    expect(decision.childrenToKill).toEqual([1, 2, 3]);
    expect(decision.alert).toBe(true);
  });

  // ── 6. Cost rollup sums parent and children ──

  it('cost rollup sums parent and children', async () => {
    // Mock the recursive CTE query to return a total
    mockDb.mockQuery('WITH RECURSIVE', { rows: [{ total: '0.0035' }] });

    const total = await costTracker.getSessionTotalWithChildren('parent-session-uuid');
    expect(total).toBeCloseTo(0.0035, 4);
  });

  // ── 7. Result notifier detects completed children ──

  it('result notifier detects completed children', async () => {
    // Mock: children are already in terminal state on first poll
    mockDb.mockQuery('SELECT st.id', {
      rows: [
        { id: 1, last_status: 'completed', run_status: 'completed', result: '{"response":"done"}', error: null },
        { id: 2, last_status: 'completed', run_status: 'completed', result: '{"response":"also done"}', error: null },
      ],
    });

    const notifier = resultNotifier.createNotifier('parent-session-uuid', {
      pollIntervalMs: 10,
      maxWaitMs: 2000,
    });

    const outcome = await notifier.waitForChildren();

    expect(outcome.timedOut).toBe(false);
    expect(outcome.stopped).toBe(false);
    expect(outcome.results).toHaveLength(2);
    expect(outcome.results[0].status).toBe('completed');
    expect(outcome.results[1].status).toBe('completed');
  });

  // ── 8. Spawning invalid type returns error ──

  it('rejects coordinator type spawn (no coordinator nesting)', async () => {
    const result = await agentSpawner.spawnAgent({
      type: 'coordinator',
      prompt: 'test',
      parentSession: 'parent-uuid-123',
    });
    expect(result.error).toBe('Coordinators cannot spawn other coordinators');
  });
});
