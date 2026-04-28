const errors = require('./errors.js');
const runState = require('./engine/runState.js');
const session = require('./engine/session.js');
const brandContext = require('./engine/brandContext.js');
const learningSink = require('./engine/learningSink.js');
const contextAssembler = require('./engine/ContextAssembler.js');
const defineTool = require('./tools/defineTool.js');
const registry = require('./tools/ToolRegistry.js');
const executor = require('./tools/StreamingToolExecutor.js');
const turnEngine = require('./engine/TurnEngine.js');
const claudeProvider = require('./engine/ClaudeProvider.js');
const providerModule = require('./engine/Provider.js');
const pgSession = require('./engine/PgSession.js');
const pgLearningSink = require('./engine/PgLearningSink.js');
const vectorSearchTool = require('./tools/vectorSearch.js');
const brandContextReadTool = require('./tools/brandContextRead.js');
const webSearchTool = require('./tools/webSearch.js');
const legacyHttp = require('./transports/legacyHttp.js');

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

  // v2 engine
  TurnEngine: turnEngine.TurnEngine,
  ClaudeProvider: claudeProvider.ClaudeProvider,
  MemoryProvider: providerModule.MemoryProvider,
  PgSession: pgSession.PgSession,
  PgLearningSink: pgLearningSink.PgLearningSink,
  vectorSearch: vectorSearchTool.vectorSearch,
  brandContextRead: brandContextReadTool.brandContextRead,
  webSearch: webSearchTool.webSearch,
  createLegacyHttpRouter: legacyHttp.createLegacyHttpRouter,
};
