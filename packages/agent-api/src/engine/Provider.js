'use strict';

class MemoryProvider {
  constructor({ script } = {}) {
    if (!Array.isArray(script)) throw new Error('MemoryProvider requires script: ChunkScript[]');
    this._script = script;
    this.calls = [];
  }

  async *invoke(args) {
    this.calls.push(args);
    if (this._script.length === 0) throw new Error('MemoryProvider script exhausted');
    for (const chunk of this._script) {
      yield chunk;
    }
  }
}

module.exports = { MemoryProvider };
