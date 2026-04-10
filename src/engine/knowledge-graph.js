'use strict';

const { pool } = require('../db');

// Normalize entity name to ID
function entityId(name) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/'/g, '');
}

// Add or update an entity
async function addEntity(brandId, name, type = 'unknown', properties = {}) {
  const id = entityId(name);
  const result = await pool.query(`
    INSERT INTO kg_entities (id, brand_id, name, entity_type, properties)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET
      entity_type = CASE WHEN kg_entities.entity_type = 'unknown' THEN $4 ELSE kg_entities.entity_type END,
      properties = kg_entities.properties || $5,
      seen_count = kg_entities.seen_count + 1,
      updated_at = NOW()
    RETURNING *
  `, [id, brandId, name, type, JSON.stringify(properties)]);
  return result.rows[0];
}

// Add a triple (relationship)
async function addTriple(brandId, subjectName, predicate, objectName, opts = {}) {
  const { validFrom = null, validTo = null, confidence = 0.8, sourceType = 'distillation', sourceRef = null } = opts;

  // Ensure both entities exist
  await addEntity(brandId, subjectName);
  await addEntity(brandId, objectName);

  const subId = entityId(subjectName);
  const objId = entityId(objectName);

  // Check for existing active triple with same subject-predicate-object
  const existing = await pool.query(`
    SELECT id FROM kg_triples
    WHERE brand_id = $1 AND subject = $2 AND predicate = $3 AND object = $4 AND valid_to IS NULL
    LIMIT 1
  `, [brandId, subId, predicate, objId]);

  if (existing.rows.length > 0) {
    // Update confidence if already exists
    const updated = await pool.query(`
      UPDATE kg_triples SET confidence = LEAST(0.99, confidence + 0.05), extracted_at = NOW()
      WHERE id = $1 RETURNING *
    `, [existing.rows[0].id]);
    return updated.rows[0];
  }

  const result = await pool.query(`
    INSERT INTO kg_triples (brand_id, subject, predicate, object, valid_from, valid_to, confidence, source_type, source_ref)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [brandId, subId, predicate, objId, validFrom, validTo, confidence, sourceType, sourceRef]);
  return result.rows[0];
}

// Invalidate a triple (mark as no longer true)
async function invalidateTriple(brandId, subjectName, predicate, objectName, endedAt = new Date()) {
  const subId = entityId(subjectName);
  const objId = entityId(objectName);

  const result = await pool.query(`
    UPDATE kg_triples SET valid_to = $5
    WHERE brand_id = $1 AND subject = $2 AND predicate = $3 AND object = $4 AND valid_to IS NULL
    RETURNING *
  `, [brandId, subId, predicate, objId, endedAt]);
  return result.rows;
}

// Query all relationships for an entity, optionally at a point in time
async function queryEntity(brandId, entityName, opts = {}) {
  const { asOf = null, direction = 'both' } = opts;
  const eid = entityId(entityName);
  const asOfDate = asOf ? new Date(asOf) : new Date();

  let directionClause;
  if (direction === 'outgoing') directionClause = 't.subject = $2';
  else if (direction === 'incoming') directionClause = 't.object = $2';
  else directionClause = '(t.subject = $2 OR t.object = $2)';

  const result = await pool.query(`
    SELECT t.*,
           e_subj.name AS subject_name,
           e_obj.name AS object_name
    FROM kg_triples t
    JOIN kg_entities e_subj ON t.subject = e_subj.id
    JOIN kg_entities e_obj ON t.object = e_obj.id
    WHERE t.brand_id = $1
      AND ${directionClause}
      AND (t.valid_from IS NULL OR t.valid_from <= $3)
      AND (t.valid_to IS NULL OR t.valid_to > $3)
    ORDER BY t.valid_from DESC NULLS LAST
  `, [brandId, eid, asOfDate]);
  return result.rows;
}

// Query by relationship type
async function queryRelationship(brandId, predicate, opts = {}) {
  const { asOf = null } = opts;
  const asOfDate = asOf ? new Date(asOf) : new Date();

  const result = await pool.query(`
    SELECT t.*,
           e_subj.name AS subject_name,
           e_obj.name AS object_name
    FROM kg_triples t
    JOIN kg_entities e_subj ON t.subject = e_subj.id
    JOIN kg_entities e_obj ON t.object = e_obj.id
    WHERE t.brand_id = $1
      AND t.predicate = $2
      AND (t.valid_from IS NULL OR t.valid_from <= $3)
      AND (t.valid_to IS NULL OR t.valid_to > $3)
    ORDER BY t.confidence DESC
  `, [brandId, predicate, asOfDate]);
  return result.rows;
}

// Get chronological timeline for an entity
async function timeline(brandId, entityName) {
  const eid = entityId(entityName);

  const result = await pool.query(`
    SELECT t.*,
           e_subj.name AS subject_name,
           e_obj.name AS object_name,
           CASE WHEN t.valid_to IS NOT NULL THEN 'ended' ELSE 'active' END AS status
    FROM kg_triples t
    JOIN kg_entities e_subj ON t.subject = e_subj.id
    JOIN kg_entities e_obj ON t.object = e_obj.id
    WHERE t.brand_id = $1
      AND (t.subject = $2 OR t.object = $2)
    ORDER BY COALESCE(t.valid_from, t.extracted_at) ASC
  `, [brandId, eid]);
  return result.rows;
}

// Get graph statistics
async function graphStats(brandId) {
  const entities = await pool.query(
    'SELECT COUNT(*) AS count, entity_type FROM kg_entities WHERE brand_id = $1 GROUP BY entity_type',
    [brandId]
  );
  const triples = await pool.query(
    'SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE valid_to IS NULL) AS active FROM kg_triples WHERE brand_id = $1',
    [brandId]
  );
  const predicates = await pool.query(
    'SELECT predicate, COUNT(*) AS count FROM kg_triples WHERE brand_id = $1 AND valid_to IS NULL GROUP BY predicate ORDER BY count DESC',
    [brandId]
  );
  return {
    entities: entities.rows,
    triples: triples.rows[0] || { total: 0, active: 0 },
    predicates: predicates.rows
  };
}

// Helper: get entity connections for search boosting
async function getEntityConnections(brandId, entityNames) {
  if (!entityNames.length) return new Set();
  const eids = entityNames.map(entityId);
  const placeholders = eids.map((_, i) => `$${i + 2}`).join(',');

  const result = await pool.query(`
    SELECT DISTINCT e.name
    FROM kg_triples t
    JOIN kg_entities e ON (e.id = t.subject OR e.id = t.object)
    WHERE t.brand_id = $1
      AND (t.subject IN (${placeholders}) OR t.object IN (${placeholders}))
      AND t.valid_to IS NULL
  `, [brandId, ...eids]);

  return new Set(result.rows.map(r => r.name.toLowerCase()));
}

module.exports = {
  entityId,
  addEntity,
  addTriple,
  invalidateTriple,
  queryEntity,
  queryRelationship,
  timeline,
  graphStats,
  getEntityConnections
};
