describe('approval-telegram.js', () => {
  let approvalTelegram, mockSend, mockPool;

  beforeEach(() => {
    mockSend = vi.fn(async () => true);
    mockPool = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    };

    delete require.cache[require.resolve('../../src/engine/approval-telegram')];
    approvalTelegram = require('../../src/engine/approval-telegram');
    approvalTelegram._setSendMessage(mockSend);
    approvalTelegram._setPool(mockPool);
  });

  describe('sendApprovalRequest', () => {
    const baseApproval = {
      uuid: 'test-uuid-123',
      permission_tier: 'confirm',
      action_type: 'deploy_code',
      action_description: 'Deploy v2.1 to production',
      timeout_hours: 2,
      context: { reason: 'Feature is ready and tested' },
    };

    it('message includes action description and tier badge', async () => {
      await approvalTelegram.sendApprovalRequest(baseApproval);

      expect(mockSend).toHaveBeenCalledOnce();
      const [message] = mockSend.mock.calls[0];

      expect(message).toContain('Lucy needs your approval');
      expect(message).toContain('[CONFIRM]');
      expect(message).toContain('Deploy v2.1 to production');
      expect(message).toContain('Feature is ready and tested');
      expect(message).toContain('Expires in 2 hours');
    });

    it('uses REVIEW badge for review tier', async () => {
      await approvalTelegram.sendApprovalRequest({
        ...baseApproval,
        permission_tier: 'review',
        timeout_hours: 8,
      });

      const [message] = mockSend.mock.calls[0];
      expect(message).toContain('[REVIEW]');
      expect(message).toContain('Expires in 8 hours');
    });

    it('inline keyboard has approve/reject buttons with correct callback_data', async () => {
      await approvalTelegram.sendApprovalRequest(baseApproval);

      const [, opts] = mockSend.mock.calls[0];
      const keyboard = opts.reply_markup.inline_keyboard;

      expect(keyboard).toHaveLength(1); // one row
      expect(keyboard[0]).toHaveLength(2); // two buttons

      const [approveBtn, rejectBtn] = keyboard[0];
      expect(approveBtn.text).toContain('Approve');
      expect(approveBtn.callback_data).toBe('hotl:approve:test-uuid-123');
      expect(rejectBtn.text).toContain('Reject');
      expect(rejectBtn.callback_data).toBe('hotl:reject:test-uuid-123');
    });

    it('handles stringified context gracefully', async () => {
      await approvalTelegram.sendApprovalRequest({
        ...baseApproval,
        context: JSON.stringify({ reason: 'Stringified context' }),
      });

      const [message] = mockSend.mock.calls[0];
      expect(message).toContain('Stringified context');
    });
  });

  describe('updateApprovalMessage', () => {
    it('edits with APPROVED badge when status is approved', async () => {
      // Mock global fetch
      const originalFetch = global.fetch;
      global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

      process.env.INTELLIGENCE_TELEGRAM_BOT_TOKEN = 'test-token';
      process.env.INTELLIGENCE_TELEGRAM_CHAT_ID = '123456';

      const approval = {
        telegram_message_id: 999,
        action_description: 'Deploy v2.1',
        action_type: 'deploy_code',
      };

      await approvalTelegram.updateApprovalMessage(approval, 'approved');

      expect(global.fetch).toHaveBeenCalledOnce();
      const [url, opts] = global.fetch.mock.calls[0];
      expect(url).toContain('editMessageText');
      const body = JSON.parse(opts.body);
      expect(body.text).toContain('APPROVED');
      expect(body.message_id).toBe(999);

      global.fetch = originalFetch;
    });

    it('skips if no telegram_message_id', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn();

      await approvalTelegram.updateApprovalMessage({ action_type: 'test' }, 'rejected');

      expect(global.fetch).not.toHaveBeenCalled();
      global.fetch = originalFetch;
    });
  });
});
