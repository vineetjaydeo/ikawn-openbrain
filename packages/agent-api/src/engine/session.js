const { appendItem } = require('./runState.js');

class MemorySession {
  constructor() {
    this._states = new Map();
  }

  async load(conversationId) {
    const s = this._states.get(conversationId);
    return s ? structuredClone(s) : null;
  }

  async save(state) {
    this._states.set(state.conversationId, structuredClone(state));
  }

  async appendItem(conversationId, item, _opts) {
    const current = this._states.get(conversationId);
    if (!current) {
      throw new Error(`no such conversation: ${conversationId}`);
    }
    const next = appendItem(current, item);
    this._states.set(conversationId, next);
  }
}

module.exports = { MemorySession };
