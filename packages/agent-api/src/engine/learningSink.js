class MemoryLearningSink {
  constructor() {
    this._signals = new Map();      // brand -> array of signals
    this._lessons = new Map();      // brand -> array of lessons
    this._crossBrandLessons = [];   // array
  }

  async recordEditDelta(brand, turnId, delta) {
    this._appendSignal(brand, { kind: 'edit_delta', turnId, detail: delta, ts: Date.now() });
  }

  async recordToolOutcome(brand, turnId, signal) {
    this._appendSignal(brand, { kind: 'tool_outcome', turnId, detail: signal, ts: Date.now() });
  }

  async recordApproval(brand, turnId, decision) {
    this._appendSignal(brand, { kind: 'approval', turnId, detail: decision, ts: Date.now() });
  }

  async writeLesson(scope, lesson) {
    if (scope.crossBrand) {
      this._crossBrandLessons.push({ ...lesson });
      return;
    }
    if (!scope.brand) throw new Error('writeLesson requires scope.brand or scope.crossBrand');
    const arr = this._lessons.get(scope.brand) || [];
    arr.push({ ...lesson });
    this._lessons.set(scope.brand, arr);
  }

  async readLessons({ brand, agent, topic }, limit) {
    const all = this._lessons.get(brand) || [];
    return all
      .filter((l) => (!agent || l.agent === agent) && (!topic || l.topic === topic))
      .slice(0, limit);
  }

  async readCrossBrandLessons({ agent, topic }, limit) {
    return this._crossBrandLessons
      .filter((l) => (!agent || l.agent === agent) && (!topic || l.topic === topic))
      .slice(0, limit);
  }

  async readSignals(brand) {
    return this._signals.get(brand) || [];
  }

  _appendSignal(brand, signal) {
    const arr = this._signals.get(brand) || [];
    arr.push(signal);
    this._signals.set(brand, arr);
  }
}

module.exports = { MemoryLearningSink };
