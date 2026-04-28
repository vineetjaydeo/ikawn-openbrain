'use strict';

const pkg = require('../src/index.js');

describe('package exports', () => {
  it('exposes the Plan 01 public surface', () => {
    [
      'ToolError', 'BrandIsolationError', 'BudgetExceededError', 'TOOL_ERROR_KINDS',
      'SCHEMA_VERSION', 'RUN_ITEM_TYPES', 'createRunState', 'appendItem',
      'serializeRunState', 'deserializeRunState',
      'MemorySession',
      'buildBrandContext', 'LEGACY_DEFAULT_BRAND',
      'MemoryLearningSink',
      'ContextAssembler',
      'defineTool', 'VALID_MODES', 'VALID_CONCURRENCY',
      'ToolRegistry', 'StreamingToolExecutor',
    ].forEach((sym) => {
      expect(pkg[sym], `expected export ${sym}`).toBeDefined();
    });
  });
});
