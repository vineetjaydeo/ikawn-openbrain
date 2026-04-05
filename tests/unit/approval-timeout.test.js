describe('approval-timeout.js', () => {
  let approvalTimeout, mockPool, mockSendExpiryNotice;

  beforeEach(() => {
    mockSendExpiryNotice = vi.fn(async () => {});
    mockPool = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    };

    delete require.cache[require.resolve('../../src/engine/approval-timeout')];
    approvalTimeout = require('../../src/engine/approval-timeout');
    approvalTimeout._setPool(mockPool);
    approvalTimeout._setSendExpiryNotice(mockSendExpiryNotice);
  });

  describe('checkExpiredApprovals', () => {
    it('marks expired approvals as timeout and sends notices', async () => {
      const expired = [
        { id: 1, uuid: 'exp-1', action_type: 'deploy', action_description: 'Deploy v1', timeout_hours: 2 },
        { id: 2, uuid: 'exp-2', action_type: 'email', action_description: 'Send campaign', timeout_hours: 8 },
      ];

      // First query: SELECT expired
      mockPool.query.mockResolvedValueOnce({ rows: expired });
      // Update queries for each
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const count = await approvalTimeout.checkExpiredApprovals();

      expect(count).toBe(2);

      // Should have queried for expired approvals
      const [selectSql] = mockPool.query.mock.calls[0];
      expect(selectSql).toContain("status = 'pending'");
      expect(selectSql).toContain('timeout_hours');

      // Should have updated each as timeout
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'timeout'"),
        [1]
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'timeout'"),
        [2]
      );

      // Should have sent expiry notice for each
      expect(mockSendExpiryNotice).toHaveBeenCalledTimes(2);
      expect(mockSendExpiryNotice).toHaveBeenCalledWith(expired[0]);
      expect(mockSendExpiryNotice).toHaveBeenCalledWith(expired[1]);
    });

    it('returns 0 when no approvals are expired', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const count = await approvalTimeout.checkExpiredApprovals();

      expect(count).toBe(0);
      expect(mockSendExpiryNotice).not.toHaveBeenCalled();
    });

    it('non-expired approvals are untouched', async () => {
      // No expired rows returned
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await approvalTimeout.checkExpiredApprovals();

      // Only the SELECT query, no UPDATE
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('continues processing even if one notice fails', async () => {
      const expired = [
        { id: 1, uuid: 'exp-1', action_type: 'deploy', timeout_hours: 2 },
        { id: 2, uuid: 'exp-2', action_type: 'email', timeout_hours: 8 },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: expired });
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

      // First notice fails, second succeeds
      mockSendExpiryNotice
        .mockRejectedValueOnce(new Error('Telegram API down'))
        .mockResolvedValueOnce();

      const count = await approvalTimeout.checkExpiredApprovals();

      expect(count).toBe(2);
      // Both updates should still happen
      expect(mockSendExpiryNotice).toHaveBeenCalledTimes(2);
    });
  });
});
