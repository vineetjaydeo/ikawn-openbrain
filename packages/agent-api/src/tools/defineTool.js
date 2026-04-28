const { zodToJsonSchema } = require('zod-to-json-schema');

const VALID_MODES = new Set(['sync', 'async']);
const VALID_CONCURRENCY = new Set(['safe', 'exclusive']);

function defineTool(spec) {
  if (!spec || !spec.name) throw new Error('name is required');
  if (!spec.description) throw new Error('description is required');
  if (!spec.parameters) throw new Error('parameters is required');
  if (!spec.output) throw new Error('output is required');
  if (typeof spec.execute !== 'function') throw new Error('execute is required');

  const mode = spec.mode || 'sync';
  if (!VALID_MODES.has(mode)) throw new Error(`invalid mode: ${mode}`);

  const concurrency = spec.concurrency || 'safe';
  if (!VALID_CONCURRENCY.has(concurrency)) {
    throw new Error(`invalid concurrency: ${concurrency}`);
  }

  const retry = spec.retry || { maxAttempts: 0 };
  const sideEffect = !!spec.sideEffect;
  if (retry.maxAttempts > 0 && sideEffect && typeof spec.idempotencyKey !== 'function') {
    throw new Error('idempotencyKey is required for retried side-effect tools');
  }

  const jsonSchema = zodToJsonSchema(spec.parameters, { target: 'jsonSchema7' });

  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: spec.output,
    jsonSchema,
    mode,
    concurrency,
    needsApproval: !!spec.needsApproval,
    timeoutMs: spec.timeoutMs || 5000,
    retry,
    sideEffect,
    idempotencyKey: spec.idempotencyKey || null,
    execute: spec.execute,
    validateInput(value) {
      return spec.parameters.safeParse(value);
    },
    validateOutput(value) {
      return spec.output.safeParse(value);
    },
  };
}

module.exports = { defineTool, VALID_MODES, VALID_CONCURRENCY };
