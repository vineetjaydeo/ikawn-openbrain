'use strict';

const {
  handleTokenBudgetExceeded,
  handleDollarCapExceeded,
  handleToolFailure,
  handleTaskTimeout,
  handleCoordinatorCapExceeded,
  handleMajorityChildFailure,
  buildAlertMessage,
} = require('../../src/engine/failure-handler');

describe('failure-handler', () => {
  // ── 1. Token budget → partial_result ──
  it('handleTokenBudgetExceeded returns partial_result with truncated flag', () => {
    const loopResult = { response: 'Partial analysis of the data...' };
    const session = { id: 'sess-1', agent_slug: 'researcher' };

    const decision = handleTokenBudgetExceeded(loopResult, session);

    expect(decision.action).toBe('partial_result');
    expect(decision.truncated).toBe(true);
    expect(decision.data.response).toBe('Partial analysis of the data...');
    expect(decision.data.partialResults).toBe(true);
  });

  // ── 2. Dollar cap → stop ──
  it('handleDollarCapExceeded returns stop with budget details', () => {
    const session = { id: 'sess-2', dollar_cap: 0.50 };
    const spent = 0.52;
    const cap = 0.50;

    const decision = handleDollarCapExceeded(session, spent, cap);

    expect(decision.action).toBe('stop');
    expect(decision.budgetExceeded).toBe(true);
    expect(decision.data.spent).toBe(0.52);
    expect(decision.data.cap).toBe(0.50);
    expect(decision.data.breakdown).toBe('see cost_events');
  });

  // ── 3. Tool failure (observe) → continue ──
  it('handleToolFailure for observe category returns continue', () => {
    const envelope = { ok: false, error: 'API timeout' };
    const tool = { category: 'observe' };
    const session = { id: 'sess-3' };

    const decision = handleToolFailure(envelope, tool, session);

    expect(decision.action).toBe('continue');
    expect(decision.error).toBe('API timeout');
    expect(decision.suspend).toBeUndefined();
  });

  // ── 4. Tool failure (create) → suspend ──
  it('handleToolFailure for create category returns suspend', () => {
    const envelope = { ok: false, error: 'File write failed', suspend: true };
    const tool = { category: 'create' };
    const session = { id: 'sess-4' };

    const decision = handleToolFailure(envelope, tool, session);

    expect(decision.action).toBe('suspend');
    expect(decision.suspend).toBe(true);
    expect(decision.error).toBe('File write failed');
  });

  // ── 5. Tool failure (ship) → hotl_required ──
  it('handleToolFailure for ship category returns hotl_required', () => {
    const envelope = { ok: false, error: 'Deploy failed', hotl: true };
    const tool = { category: 'ship' };
    const session = { id: 'sess-5' };

    const decision = handleToolFailure(envelope, tool, session);

    expect(decision.action).toBe('hotl_required');
    expect(decision.hotl).toBe(true);
    expect(decision.error).toBe('Deploy failed');
  });

  // ── 6. Tool failure (communicate) → continue ──
  it('handleToolFailure for communicate category returns continue', () => {
    const envelope = { ok: false, error: 'Slack webhook down' };
    const tool = { category: 'communicate' };
    const session = { id: 'sess-6' };

    const decision = handleToolFailure(envelope, tool, session);

    expect(decision.action).toBe('continue');
    expect(decision.error).toBe('Slack webhook down');
    expect(decision.suspend).toBeUndefined();
    expect(decision.hotl).toBeUndefined();
  });

  // ── 7. Task timeout → kill with checkpoint ──
  it('handleTaskTimeout returns kill with last checkpoint', () => {
    const taskRun = { id: 'run-1', started_at: new Date(Date.now() - 15 * 60 * 1000) };
    const session = { id: 'sess-7', working_memory: { step: 3, partial: 'data' } };

    const decision = handleTaskTimeout(taskRun, session);

    expect(decision.action).toBe('kill');
    expect(decision.error).toContain('10+ minutes');
    expect(decision.lastCheckpoint).toEqual({ step: 3, partial: 'data' });
  });

  // ── 8. Coordinator cap → cascade_kill with alert ──
  it('handleCoordinatorCapExceeded returns cascade_kill with child IDs', () => {
    const session = { id: 'sess-8', agent_slug: 'coordinator' };
    const children = [
      { id: 'child-1', agent_slug: 'researcher' },
      { id: 'child-2', agent_slug: 'builder' },
    ];

    const decision = handleCoordinatorCapExceeded(session, children);

    expect(decision.action).toBe('cascade_kill');
    expect(decision.error).toBe('Coordinator budget exceeded');
    expect(decision.childrenToKill).toEqual(['child-1', 'child-2']);
    expect(decision.alert).toBe(true);
  });

  // ── 9. Majority failure (3/4 failed) → hotl_escalate ──
  it('handleMajorityChildFailure with 3/4 failed returns hotl_escalate', () => {
    const childStatuses = [
      { id: 1, agent_slug: 'researcher', last_status: 'failed' },
      { id: 2, agent_slug: 'builder', last_status: 'failed' },
      { id: 3, agent_slug: 'reviewer', last_status: 'failed' },
      { id: 4, agent_slug: 'deployer', last_status: 'completed' },
    ];

    const decision = handleMajorityChildFailure('parent-sess', childStatuses);

    expect(decision.action).toBe('hotl_escalate');
    expect(decision.failedCount).toBe(3);
    expect(decision.totalCount).toBe(4);
    expect(decision.failedAgents).toEqual(['researcher', 'builder', 'reviewer']);
    expect(decision.error).toBe('Majority of sub-agents failed');
  });

  // ── 10. Minority failure (1/4 failed) → continue ──
  it('handleMajorityChildFailure with 1/4 failed returns continue', () => {
    const childStatuses = [
      { id: 1, agent_slug: 'researcher', last_status: 'failed' },
      { id: 2, agent_slug: 'builder', last_status: 'completed' },
      { id: 3, agent_slug: 'reviewer', last_status: 'completed' },
      { id: 4, agent_slug: 'deployer', last_status: 'completed' },
    ];

    const decision = handleMajorityChildFailure('parent-sess', childStatuses);

    expect(decision.action).toBe('continue');
  });

  // ── 11. buildAlertMessage includes session ID and cost ──
  it('buildAlertMessage includes session ID and cost breakdown', () => {
    const session = { id: 'sess-alert-1', agent_slug: 'coordinator' };
    const details = {
      spent: 1.2345,
      cap: 1.00,
      failedAgents: ['researcher', 'builder'],
      failedCount: 2,
      totalCount: 3,
      error: 'Coordinator budget exceeded',
    };

    const msg = buildAlertMessage('coordinator_cap', session, details);

    expect(msg).toContain('sess-alert-1');
    expect(msg).toContain('COORDINATOR CAP');
    expect(msg).toContain('$1.2345');
    expect(msg).toContain('$1.0000');
    expect(msg).toContain('researcher');
    expect(msg).toContain('builder');
    expect(msg).toContain('2/3');
    expect(msg).toContain('<b>');
  });

  // ── Edge cases ──
  it('handleTokenBudgetExceeded handles null loopResult gracefully', () => {
    const decision = handleTokenBudgetExceeded(null, { id: 'x' });
    expect(decision.action).toBe('partial_result');
    expect(decision.data.response).toBe('');
  });

  it('handleTaskTimeout returns null checkpoint when session has no working_memory', () => {
    const decision = handleTaskTimeout({ id: 'run-x' }, { id: 'sess-x' });
    expect(decision.lastCheckpoint).toBeNull();
  });

  it('handleMajorityChildFailure with empty array returns continue', () => {
    const decision = handleMajorityChildFailure('parent', []);
    expect(decision.action).toBe('continue');
  });

  it('handleToolFailure for execute category returns suspend', () => {
    const envelope = { ok: false, error: 'Command failed' };
    const tool = { category: 'execute' };
    const decision = handleToolFailure(envelope, tool, { id: 's' });
    expect(decision.action).toBe('suspend');
    expect(decision.suspend).toBe(true);
  });

  it('handleToolFailure for analyze category returns continue', () => {
    const envelope = { ok: false, error: 'Parse error' };
    const tool = { category: 'analyze' };
    const decision = handleToolFailure(envelope, tool, { id: 's' });
    expect(decision.action).toBe('continue');
  });
});
