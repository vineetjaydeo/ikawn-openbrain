'use strict';

// ── Inline mock pool factory ──
function createMockPool() {
  const queryResults = [];
  const pool = {
    query: vi.fn(async (text, params) => {
      return queryResults.shift() || { rows: [], rowCount: 0 };
    }),
    _pushResult(result) {
      queryResults.push(result);
    },
    _pushResults(...results) {
      results.forEach(r => queryResults.push(r));
    },
  };
  return pool;
}

// ── Mock session manager ──
function createMockSessionManager() {
  return {
    suspend: vi.fn(async (sessionId, workingMemory, checkpoint) => ({
      id: sessionId,
      status: 'suspended',
      resume_token: 'mock-resume-token-uuid',
      working_memory: { ...workingMemory, _checkpoint: checkpoint },
    })),
    resume: vi.fn(async (resumeToken) => ({
      id: 'session-123',
      status: 'active',
      resume_token: null,
      brand_id: 'ikawn',
      working_memory: {},
    })),
  };
}

// ── Helper: create a mock tool ──
function makeTool(overrides = {}) {
  return {
    name: overrides.name || 'test_tool',
    description: 'A test tool',
    permissionTier: overrides.permissionTier || 'auto',
    category: overrides.category || 'observe',
    inputSchema: { type: 'object', properties: {} },
    timeout: 5000,
    retryPolicy: { maxRetries: 0, backoff: [], timeoutMs: 5000 },
    execute: overrides.execute || vi.fn(async () => ({ data: 'ok' })),
  };
}

// ── Helper: create a mock registry ──
function makeRegistry(tool) {
  return { lookupTool: vi.fn(() => tool) };
}

describe('HOTL Cycle Integration', () => {
  let executeTool, hotl, approvalTelegram, trustLedger, trustScorer;
  let mockPool, mockSM;

  beforeEach(() => {
    vi.resetModules();

    mockPool = createMockPool();
    mockSM = createMockSessionManager();

    // Load modules fresh
    executeTool = require('../../src/engine/tool-executor');
    hotl = require('../../src/engine/hotl');
    approvalTelegram = require('../../src/engine/approval-telegram');
    trustLedger = require('../../src/engine/trust-ledger');
    trustScorer = require('../../src/engine/trust-scorer');

    // Inject mocks
    executeTool._setLogToolCall(vi.fn(async () => {}));
    executeTool._setGetTrustLevel(vi.fn(async () => 'confirm'));
    hotl._setPool(mockPool);
    hotl._setSessionManager(mockSM);
    approvalTelegram._setSendMessage(vi.fn(async () => ({ message_id: 999 })));
    approvalTelegram._setPool(mockPool);
    trustLedger._setPool(mockPool);
    trustScorer._setPool(mockPool);
    trustScorer._setSendAlert(vi.fn(async () => {}));
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 1: Full approve flow
  // ────────────────────────────────────────────────────────────────────
  describe('Approve flow', () => {
    it('gates tool → creates approval → suspends session → approve → hotl_resume task', async () => {
      // Step 1: executeTool returns gated envelope for a review-tier tool
      const tool = makeTool({ name: 'deploy_production', permissionTier: 'review', category: 'ship' });
      const registry = makeRegistry(tool);
      const context = { sessionId: 'sess-1', brandId: 'ikawn', trustLevel: 'confirm' };

      // Trust lookup returns 'confirm' (default mock) — tool requires 'review' → gated
      const envelope = await executeTool.executeTool('deploy_production', {}, context, registry);

      expect(envelope.ok).toBe(false);
      expect(envelope.gated).toBe(true);
      expect(envelope.approvalRequired).toBe('review');

      // Step 2: requestApproval — creates approval record, suspends session
      // Mock: INSERT into approval_requests
      mockPool._pushResult({
        rows: [{ id: 1, uuid: 'approval-uuid-001', resume_token: 'mock-resume-token-uuid' }],
      });

      const session = { id: 'sess-1', brand_id: 'ikawn', working_memory: { step: 3 } };
      const taskRun = { id: 42 };
      const approval = await hotl.requestApproval(
        session, taskRun, 'deploy_production',
        { description: 'Deploy v3 to prod', reason: 'Feature complete' },
        { permissionTier: 'review' }
      );

      expect(mockSM.suspend).toHaveBeenCalledOnce();
      expect(approval.approvalUuid).toBe('approval-uuid-001');
      expect(approval.resumeToken).toBe('mock-resume-token-uuid');

      // Step 3: sendApprovalRequest — sends Telegram message
      // Mock: UPDATE approval_requests SET telegram_message_id
      mockPool._pushResult({ rows: [{ id: 1 }], rowCount: 1 });

      const approvalRow = {
        uuid: 'approval-uuid-001',
        permission_tier: 'review',
        timeout_hours: 8,
        action_type: 'deploy_production',
        action_description: 'Deploy v3 to prod',
        context: JSON.stringify({ reason: 'Feature complete' }),
      };
      const msgResult = await approvalTelegram.sendApprovalRequest(approvalRow);
      expect(msgResult.messageId).toBe(999);

      // Step 4: processApproval — approve
      // Mock: UPDATE approval_requests RETURNING *
      mockPool._pushResult({
        rows: [{
          id: 1,
          uuid: 'approval-uuid-001',
          resume_token: 'mock-resume-token-uuid',
          brand_id: 'ikawn',
          action_type: 'deploy_production',
          action_description: 'Deploy v3 to prod',
        }],
      });
      // Mock: INSERT into scheduled_tasks RETURNING uuid
      mockPool._pushResult({
        rows: [{ uuid: 'task-uuid-resume-001' }],
      });

      const taskUuid = await hotl.processApproval('approval-uuid-001', true, 'vineet', null);
      expect(taskUuid).toBe('task-uuid-resume-001');

      // Verify: UPDATE set status='approved'
      // Find the UPDATE that sets status (has 4 params: status, responded_by, note, uuid)
      const updateCall = mockPool.query.mock.calls.find(
        ([sql, params]) => typeof sql === 'string'
          && sql.includes('UPDATE approval_requests')
          && sql.includes('status = $1')
          && params && params.length === 4
      );
      expect(updateCall).toBeTruthy();
      const [, updateParams] = updateCall;
      expect(updateParams[0]).toBe('approved');
      expect(updateParams[1]).toBe('vineet');

      // Verify: INSERT scheduled_tasks with task_type='hotl_resume'
      const insertCall = mockPool.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO scheduled_tasks')
      );
      expect(insertCall).toBeTruthy();
      const [insertSql, insertParams] = insertCall;
      expect(insertSql).toContain('hotl_resume');
      const config = JSON.parse(insertParams[3]);
      expect(config.approved).toBe(true);
      expect(config.resumeToken).toBe('mock-resume-token-uuid');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 2: Full reject flow
  // ────────────────────────────────────────────────────────────────────
  describe('Reject flow', () => {
    it('reject stores rejection reason in hotl_resume config', async () => {
      // Mock: UPDATE approval_requests
      mockPool._pushResult({
        rows: [{
          id: 2,
          uuid: 'approval-uuid-002',
          resume_token: 'resume-token-xyz',
          brand_id: 'ikawn',
          action_type: 'send_email',
          action_description: 'Send campaign to 5k users',
        }],
      });
      // Mock: INSERT scheduled_tasks
      mockPool._pushResult({
        rows: [{ uuid: 'task-uuid-reject-002' }],
      });

      const taskUuid = await hotl.processApproval(
        'approval-uuid-002', false, 'vineet', 'Too risky'
      );

      expect(taskUuid).toBe('task-uuid-reject-002');

      // Verify rejection
      const [updateSql, updateParams] = mockPool.query.mock.calls[0];
      expect(updateParams[0]).toBe('rejected');
      expect(updateParams[2]).toBe('Too risky');

      // Verify config
      const [insertSql, insertParams] = mockPool.query.mock.calls[1];
      const config = JSON.parse(insertParams[3]);
      expect(config.approved).toBe(false);
      expect(config.rejectionReason).toBe('Too risky');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 3: Trust promotion skips gate
  // ────────────────────────────────────────────────────────────────────
  describe('Trust promotion skips gate', () => {
    it('auto trust for staging_deploys skips confirm gate', async () => {
      // Override getTrustLevel to return 'auto' for staging_deploys
      executeTool._setGetTrustLevel(vi.fn(async (brandId, domain) => {
        if (domain === 'staging_deploys') return 'auto';
        return 'confirm';
      }));

      // deploy_staging maps to 'staging_deploys' domain
      const tool = makeTool({
        name: 'deploy_staging',
        permissionTier: 'confirm',
        category: 'ship',
        execute: vi.fn(async () => ({ data: 'deployed' })),
      });
      const registry = makeRegistry(tool);
      const context = { sessionId: 'sess-2', brandId: 'ikawn', trustLevel: 'auto' };

      // Mock trust ledger INSERT (for the success log)
      mockPool._pushResult({
        rows: [{ id: 1, brand_id: 'ikawn', domain: 'staging_deploys', outcome: 'success' }],
      });

      const envelope = await executeTool.executeTool('deploy_staging', {}, context, registry);

      // Tool should execute without gating
      expect(envelope.ok).toBe(true);
      expect(envelope.gated).toBeUndefined();
      expect(envelope.data).toBe('deployed');
      expect(envelope.metadata.effectiveTier).toBe('auto');

      // Tool execute was called
      expect(tool.execute).toHaveBeenCalledOnce();

      // Trust ledger was logged
      const trustLogCall = mockPool.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO trust_ledger')
      );
      expect(trustLogCall).toBeTruthy();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 4: Demotion on failure
  // ────────────────────────────────────────────────────────────────────
  describe('Demotion on failure', () => {
    it('logs failure to trust ledger and calls checkImmediateDemotion', async () => {
      // Trust level is 'auto' so the tool can execute
      executeTool._setGetTrustLevel(vi.fn(async () => 'auto'));

      const tool = makeTool({
        name: 'deploy_staging',
        permissionTier: 'auto',
        category: 'ship',
        execute: vi.fn(async () => { throw new Error('Deploy failed: bad config'); }),
      });
      const registry = makeRegistry(tool);
      const context = { sessionId: 'sess-3', brandId: 'ikawn', trustLevel: 'auto' };

      // Mock trust ledger INSERT (for failure log)
      mockPool._pushResult({
        rows: [{ id: 2, brand_id: 'ikawn', domain: 'staging_deploys', outcome: 'failure' }],
      });

      // Mock checkImmediateDemotion: SELECT current_tier → 'auto'
      mockPool._pushResult({
        rows: [{ current_tier: 'auto' }],
      });
      // Mock checkImmediateDemotion: UPDATE trust_scores
      mockPool._pushResult({ rows: [{ id: 1 }], rowCount: 1 });

      const envelope = await executeTool.executeTool('deploy_staging', {}, context, registry);

      expect(envelope.ok).toBe(false);
      expect(envelope.error).toContain('Deploy failed');
      expect(envelope.metadata.effectiveTier).toBe('auto');

      // Verify trust ledger was logged with failure
      const trustLogCall = mockPool.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO trust_ledger')
      );
      expect(trustLogCall).toBeTruthy();
      const [, trustParams] = trustLogCall;
      expect(trustParams[3]).toBe('failure'); // outcome

      // Verify checkImmediateDemotion was called (SELECT on trust_scores)
      const demotionCheck = mockPool.query.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('SELECT current_tier FROM trust_scores')
      );
      expect(demotionCheck).toBeTruthy();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 5: client_facing always requires review
  // ────────────────────────────────────────────────────────────────────
  describe('client_facing hard rule', () => {
    it('client_facing tools always require review regardless of trust score', async () => {
      // Even if trust score says 'auto', client_facing must stay 'review'
      executeTool._setGetTrustLevel(vi.fn(async () => 'auto'));

      // 'notify' maps to client_facing domain
      const tool = makeTool({
        name: 'notify',
        permissionTier: 'confirm',
        category: 'communicate',
      });
      const registry = makeRegistry(tool);
      const context = { sessionId: 'sess-4', brandId: 'ikawn', trustLevel: 'confirm' };

      const envelope = await executeTool.executeTool('notify', {}, context, registry);

      // Should be gated — review required, but context only has confirm
      expect(envelope.ok).toBe(false);
      expect(envelope.gated).toBe(true);
      expect(envelope.approvalRequired).toBe('review');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 6: effectiveTier included in metadata
  // ────────────────────────────────────────────────────────────────────
  describe('effectiveTier in metadata', () => {
    it('includes effectiveTier in success envelope metadata', async () => {
      executeTool._setGetTrustLevel(vi.fn(async () => 'confirm'));

      const tool = makeTool({
        name: 'fly_status',
        permissionTier: 'auto',
        category: 'observe',
        execute: vi.fn(async () => ({ data: 'healthy' })),
      });
      const registry = makeRegistry(tool);
      const context = { sessionId: 'sess-5', brandId: 'ikawn', trustLevel: 'auto' };

      // Mock trust ledger INSERT
      mockPool._pushResult({
        rows: [{ id: 1 }],
      });

      const envelope = await executeTool.executeTool('fly_status', {}, context, registry);

      expect(envelope.ok).toBe(true);
      expect(envelope.metadata.effectiveTier).toBe('auto');
    });
  });
});
