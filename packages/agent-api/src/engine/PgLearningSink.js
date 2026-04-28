'use strict';

class PgLearningSink {
  constructor({ pool }) {
    if (!pool) throw new Error('PgLearningSink requires { pool }');
    this._pool = pool;
  }

  async _recordSignal(brand, turnId, kind, detail) {
    await this._pool.query(
      `INSERT INTO learning_signals (brand, turn_id, kind, detail) VALUES ($1, $2, $3, $4)`,
      [brand, turnId, kind, detail]
    );
  }

  async recordEditDelta(brand, turnId, delta) {
    return this._recordSignal(brand, turnId, 'edit_delta', delta);
  }

  async recordToolOutcome(brand, turnId, signal) {
    return this._recordSignal(brand, turnId, 'tool_outcome', signal);
  }

  async recordApproval(brand, turnId, decision) {
    return this._recordSignal(brand, turnId, 'approval', decision);
  }

  async writeLesson(scope, lesson) {
    if (!scope || (!scope.brand && !scope.crossBrand)) {
      throw new Error('writeLesson scope must specify brand or crossBrand: true');
    }
    const brand = scope.crossBrand ? null : scope.brand;
    const crossBrand = !!scope.crossBrand;
    await this._pool.query(
      `INSERT INTO lessons (brand, cross_brand, agent, topic, text, quality_score)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [brand, crossBrand, lesson.agent || null, lesson.topic || null, lesson.text, lesson.qualityScore != null ? lesson.qualityScore : 0.5]
    );
  }

  async readLessons({ brand, agent, topic }, limit) {
    const params = [brand];
    let sql = `SELECT id, brand, agent, topic, text, quality_score, created_at
               FROM lessons
               WHERE cross_brand = false AND brand = $1`;
    if (agent) {
      params.push(agent);
      sql += ` AND agent = $${params.length}`;
    }
    if (topic) {
      params.push(topic);
      sql += ` AND topic = $${params.length}`;
    }
    params.push(limit);
    sql += ` ORDER BY quality_score DESC, created_at DESC LIMIT $${params.length}`;
    const res = await this._pool.query(sql, params);
    return res.rows.map((r) => ({
      id: String(r.id),
      brand: r.brand,
      agent: r.agent,
      topic: r.topic,
      text: r.text,
      qualityScore: Number(r.quality_score),
      createdAt: r.created_at,
    }));
  }

  async readCrossBrandLessons({ agent, topic }, limit) {
    const params = [];
    let sql = `SELECT id, agent, topic, text, quality_score, created_at FROM lessons WHERE cross_brand = true`;
    if (agent) {
      params.push(agent);
      sql += ` AND agent = $${params.length}`;
    }
    if (topic) {
      params.push(topic);
      sql += ` AND topic = $${params.length}`;
    }
    params.push(limit);
    sql += ` ORDER BY quality_score DESC, created_at DESC LIMIT $${params.length}`;
    const res = await this._pool.query(sql, params);
    return res.rows.map((r) => ({
      id: String(r.id),
      brand: null,
      agent: r.agent,
      topic: r.topic,
      text: r.text,
      qualityScore: Number(r.quality_score),
      createdAt: r.created_at,
    }));
  }
}

module.exports = { PgLearningSink };
