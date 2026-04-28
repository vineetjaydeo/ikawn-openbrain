const SCHEMA_VERSION = '1.0';

const RUN_ITEM_TYPES = new Set([
  'user_message',
  'assistant_message',
  'tool_call',
  'tool_result',
  'tool_async_pending',
  'denial',
  'approval_pending',
  'compaction_boundary',
  'reasoning',
  'edit_delta',
  'learn_signal',
]);

function createRunState({ conversationId, userId, brand, brandRevision, agent }) {
  if (!brand) throw new Error('brand is required');
  if (!conversationId) throw new Error('conversationId is required');
  if (!userId) throw new Error('userId is required');
  if (typeof brandRevision !== 'number') throw new Error('brandRevision must be a number');
  if (!agent) throw new Error('agent is required');
  return {
    schemaVersion: SCHEMA_VERSION,
    conversationId,
    userId,
    brand,
    brandRevision,
    agent,
    items: [],
    currentStep: 'idle',
    pendingApprovals: [],
    pendingJobs: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReads: 0, cacheWrites: 0 },
    spanContext: null,
    metadata: {},
  };
}

function appendItem(state, item) {
  if (!item || typeof item.type !== 'string') {
    throw new Error('item must have a type');
  }
  if (!RUN_ITEM_TYPES.has(item.type)) {
    throw new Error(`unknown RunItem type: ${item.type}`);
  }
  return { ...state, items: [...state.items, item] };
}

function serializeRunState(state) {
  return JSON.stringify(state);
}

function deserializeRunState(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`unsupported schemaVersion: ${parsed.schemaVersion}`);
  }
  return parsed;
}

module.exports = {
  SCHEMA_VERSION,
  RUN_ITEM_TYPES,
  createRunState,
  appendItem,
  serializeRunState,
  deserializeRunState,
};
