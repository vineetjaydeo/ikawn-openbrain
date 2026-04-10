'use strict';

const kg = require('../../engine/knowledge-graph');
const { createEnvelope, DEFAULT_RETRY_POLICIES } = require('../../engine/tool-interface');

module.exports = [
  {
    name: 'kg_query',
    description: 'Query relationships for an entity in the knowledge graph. Returns all known relationships (triples) involving the given entity.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'The entity to query relationships for' },
        as_of: { type: 'string', description: 'Optional ISO date to query relationships as of a specific point in time' },
      },
      required: ['entity'],
    },
    permissionTier: 'auto',
    category: 'analyze',
    timeout: 60000,
    retryPolicy: DEFAULT_RETRY_POLICIES.analyze,
    async execute(input, context) {
      const start = Date.now();
      try {
        const result = await kg.queryEntity(context.brandId, input.entity, { asOf: input.as_of });
        return createEnvelope(true, result, null, {
          tool: 'kg_query', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
        });
      } catch (err) {
        return createEnvelope(false, null, err.message, {
          tool: 'kg_query', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
        });
      }
    },
  },

  {
    name: 'kg_add',
    description: 'Manually add a relationship (triple) to the knowledge graph. Format: subject -[predicate]-> object.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'The subject entity' },
        predicate: { type: 'string', description: 'The relationship type (e.g. "works_at", "is_a", "located_in")' },
        object: { type: 'string', description: 'The object entity' },
        valid_from: { type: 'string', description: 'Optional ISO date when this relationship became true' },
      },
      required: ['subject', 'predicate', 'object'],
    },
    permissionTier: 'auto',
    category: 'analyze',
    timeout: 60000,
    retryPolicy: DEFAULT_RETRY_POLICIES.analyze,
    async execute(input, context) {
      const start = Date.now();
      try {
        const opts = {};
        if (input.valid_from) opts.validFrom = input.valid_from;
        const result = await kg.addTriple(context.brandId, input.subject, input.predicate, input.object, opts);
        return createEnvelope(true, result, null, {
          tool: 'kg_add', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
        });
      } catch (err) {
        return createEnvelope(false, null, err.message, {
          tool: 'kg_add', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
        });
      }
    },
  },

  {
    name: 'kg_invalidate',
    description: 'Mark a relationship as no longer true. Sets valid_to on the triple without deleting it, preserving history.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'The subject entity' },
        predicate: { type: 'string', description: 'The relationship type' },
        object: { type: 'string', description: 'The object entity' },
      },
      required: ['subject', 'predicate', 'object'],
    },
    permissionTier: 'auto',
    category: 'analyze',
    timeout: 60000,
    retryPolicy: DEFAULT_RETRY_POLICIES.analyze,
    async execute(input, context) {
      const start = Date.now();
      try {
        const result = await kg.invalidateTriple(context.brandId, input.subject, input.predicate, input.object);
        return createEnvelope(true, result, null, {
          tool: 'kg_invalidate', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
        });
      } catch (err) {
        return createEnvelope(false, null, err.message, {
          tool: 'kg_invalidate', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
        });
      }
    },
  },

  {
    name: 'kg_timeline',
    description: 'Show chronological history of knowledge graph changes. If an entity is provided, shows its history. Otherwise returns overall graph statistics.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Optional entity to show timeline for. If omitted, returns graph-wide stats.' },
      },
      required: [],
    },
    permissionTier: 'auto',
    category: 'analyze',
    timeout: 60000,
    retryPolicy: DEFAULT_RETRY_POLICIES.analyze,
    async execute(input, context) {
      const start = Date.now();
      try {
        const result = input.entity
          ? await kg.timeline(context.brandId, input.entity)
          : await kg.graphStats(context.brandId);
        return createEnvelope(true, result, null, {
          tool: 'kg_timeline', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
        });
      } catch (err) {
        return createEnvelope(false, null, err.message, {
          tool: 'kg_timeline', duration_ms: Date.now() - start, attempt: 1, truncated: false, cost_usd: 0,
        });
      }
    },
  },
];
