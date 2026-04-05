// ── Mock pool factory ──
function createMockPool() {
  const queryResults = [];
  const pool = {
    query: vi.fn(async () => {
      return queryResults.shift() || { rows: [], rowCount: 0 };
    }),
    _pushResult(result) {
      queryResults.push(result);
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
      model_tier: 'balanced',
      working_memory: {},
    })),
  };
}

describe('HOTL — hotl.js', () => {
  let hotl, mockPool, mockSM;

  beforeEach(() => {
    mockPool = createMockPool();
    mockSM = createMockSessionManager();

    // Fresh require to reset lazy dependencies
    delete require.cache[require.resolve('../../src/engine/hotl')];
    hotl = require('../../src/engine/hotl');
    hotl._setPool(mockPool);
    hotl._setSessionManager(mockSM);
  });

  describe('requestApproval', () => {
    it('creates approval record and suspends session', async () => {
      const session = { id: 'session-abc', brand_id: 'ikawn', working_memory: {} };
      const taskRun = { id: 42 };

      // Mock INSERT returning the new approval
      mockPool._pushResult({
        rows: [{ id: 1, uuid: 'approval-uuid-123', resume_token: 'mock-resume-token-uuid' }],
      });

      const result = await hotl.requestApproval(session, taskRun, 'deploy_code', {
        description: 'Deploy v2.1 to production',
        reason: 'Feature is ready',
      }, { permissionTier: 'confirm' });

      // Session should be suspended
      expect(mockSM.suspend).toHaveBeenCalledOnce();
      expect(mockSM.suspend).toHaveBeenCalledWith(
        'session-abc',
        {},
        { hotl: true, actionType: 'deploy_code', taskRunId: 42 }
      );

      // Approval record should be inserted
      expect(mockPool.query).toHaveBeenCalledOnce();
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO approval_requests');
      expect(params[0]).toBe('session-abc'); // session_id
      expect(params[1]).toBe(42); // task_run_id
      expect(params[3]).toBe('confirm'); // permission_tier
      expect(params[4]).toBe('deploy_code'); // action_type
      expect(params[7]).toBe(2); // timeout_hours for confirm

      // Return value
      expect(result.approvalId).toBe(1);
      expect(result.approvalUuid).toBe('approval-uuid-123');
      expect(result.resumeToken).toBe('mock-resume-token-uuid');
    });

    it('uses review timeout (8h) for review tier', async () => {
      const session = { id: 'session-abc', brand_id: 'ikawn', working_memory: {} };
      const taskRun = { id: 10 };

      mockPool._pushResult({
        rows: [{ id: 2, uuid: 'approval-uuid-456', resume_token: 'mock-resume-token-uuid' }],
      });

      await hotl.requestApproval(session, taskRun, 'send_email', {}, {
        permissionTier: 'review',
      });

      const [, params] = mockPool.query.mock.calls[0];
      expect(params[7]).toBe(8); // timeout_hours for review
    });
  });

  describe('processApproval', () => {
    it('(approve) updates record and creates hotl_resume task', async () => {
      // Mock UPDATE returning the approval
      mockPool._pushResult({
        rows: [{
          id: 1,
          uuid: 'approval-uuid-123',
          resume_token: 'resume-token-abc',
          brand_id: 'ikawn',
          action_type: 'deploy_code',
          action_description: 'Deploy v2.1',
        }],
      });

      // Mock INSERT returning the scheduled task
      mockPool._pushResult({
        rows: [{ uuid: 'task-uuid-789' }],
      });

      const taskUuid = await hotl.processApproval('approval-uuid-123', true, 'user-42', null);

      // First query: UPDATE approval_requests
      const [updateSql, updateParams] = mockPool.query.mock.calls[0];
      expect(updateSql).toContain('UPDATE approval_requests');
      expect(updateParams[0]).toBe('approved');
      expect(updateParams[1]).toBe('user-42');

      // Second query: INSERT scheduled_tasks (hotl_resume)
      const [insertSql, insertParams] = mockPool.query.mock.calls[1];
      expect(insertSql).toContain('INSERT INTO scheduled_tasks');
      expect(insertSql).toContain('hotl_resume');
      const config = JSON.parse(insertParams[3]);
      expect(config.approved).toBe(true);
      expect(config.resumeToken).toBe('resume-token-abc');
      expect(config.originalAction).toBe('deploy_code');

      expect(taskUuid).toBe('task-uuid-789');
    });

    it('(reject) includes rejection reason in config', async () => {
      mockPool._pushResult({
        rows: [{
          id: 2,
          uuid: 'approval-uuid-456',
          resume_token: 'resume-token-def',
          brand_id: 'ikawn',
          action_type: 'send_email',
          action_description: 'Send campaign email',
        }],
      });

      mockPool._pushResult({
        rows: [{ uuid: 'task-uuid-999' }],
      });

      await hotl.processApproval('approval-uuid-456', false, 'user-99', 'Not ready yet');

      const [updateSql, updateParams] = mockPool.query.mock.calls[0];
      expect(updateParams[0]).toBe('rejected');
      expect(updateParams[2]).toBe('Not ready yet');

      const [insertSql, insertParams] = mockPool.query.mock.calls[1];
      const config = JSON.parse(insertParams[3]);
      expect(config.approved).toBe(false);
      expect(config.rejectionReason).toBe('Not ready yet');
    });
  });

  describe('getPendingApprovals', () => {
    it('returns only pending approvals for the brand', async () => {
      const pendingRows = [
        { id: 1, uuid: 'a1', status: 'pending', brand_id: 'ikawn' },
        { id: 2, uuid: 'a2', status: 'pending', brand_id: 'ikawn' },
      ];
      mockPool._pushResult({ rows: pendingRows });

      const results = await hotl.getPendingApprovals('ikawn');

      expect(results).toHaveLength(2);
      expect(results[0].uuid).toBe('a1');

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain("status = 'pending'");
      expect(params[0]).toBe('ikawn');
    });
  });

  describe('TIMEOUT_HOURS', () => {
    it('confirm = 2, review = 8', () => {
      expect(hotl.TIMEOUT_HOURS.confirm).toBe(2);
      expect(hotl.TIMEOUT_HOURS.review).toBe(8);
    });
  });
});
