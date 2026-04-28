const errors = require('./errors.js');
const runState = require('./engine/runState.js');
const session = require('./engine/session.js');
const brandContext = require('./engine/brandContext.js');
const learningSink = require('./engine/learningSink.js');
const contextAssembler = require('./engine/ContextAssembler.js');
const defineTool = require('./tools/defineTool.js');
const registry = require('./tools/ToolRegistry.js');
const executor = require('./tools/StreamingToolExecutor.js');

module.exports = {
  // errors
  ToolError: errors.ToolError,
  BrandIsolationError: errors.BrandIsolationError,
  BudgetExceededError: errors.BudgetExceededError,
  TOOL_ERROR_KINDS: errors.TOOL_ERROR_KINDS,

  // engine state
  SCHEMA_VERSION: runState.SCHEMA_VERSION,
  RUN_ITEM_TYPES: runState.RUN_ITEM_TYPES,
  createRunState: runState.createRunState,
  appendItem: runState.appendItem,
  serializeRunState: runState.serializeRunState,
  deserializeRunState: runState.deserializeRunState,

  // session
  MemorySession: session.MemorySession,

  // brand context
  buildBrandContext: brandContext.buildBrandContext,
  LEGACY_DEFAULT_BRAND: brandContext.LEGACY_DEFAULT_BRAND,

  // learning
  MemoryLearningSink: learningSink.MemoryLearningSink,

  // context assembly
  ContextAssembler: contextAssembler.ContextAssembler,

  // tools
  defineTool: defineTool.defineTool,
  VALID_MODES: defineTool.VALID_MODES,
  VALID_CONCURRENCY: defineTool.VALID_CONCURRENCY,
  ToolRegistry: registry.ToolRegistry,
  StreamingToolExecutor: executor.StreamingToolExecutor,
};
