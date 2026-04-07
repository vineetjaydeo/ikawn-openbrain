const fs = require('fs');
const path = require('path');

describe('Web Chat V2 Tool Registry Regression', () => {
  const chatApiPath = path.resolve(__dirname, '../../src/routes/chat-api.js');
  const indexPath = path.resolve(__dirname, '../../src/index.js');
  const source = fs.readFileSync(chatApiPath, 'utf-8');
  const indexSource = fs.readFileSync(indexPath, 'utf-8');

  it('imports from engine/tool-registry-v2, not tools/registry', () => {
    // Must use v2 registry
    expect(source).toContain("require('../engine/tool-registry-v2')");
    // Must NOT import getTool/getTools/getToolSchemas from v1 registry
    expect(source).not.toMatch(/require\(['"]\.\.\/tools\/registry['"]\)/);
  });

  it('imports executeToolV2 from engine/tool-executor', () => {
    expect(source).toContain("require('../engine/tool-executor')");
  });

  it('uses getToolDefinitions (v2) not getToolSchemas (v1) for building tool schemas', () => {
    expect(source).toContain('getToolDefinitions');
    // Should not use v1's getToolSchemas anywhere
    expect(source).not.toContain('getToolSchemas');
  });

  it('passes toolRegistry to executeReasoningLoop instead of executeToolFn', () => {
    // The reasoning loop call should include toolRegistry
    expect(source).toContain('toolRegistry,');
    // Should NOT pass executeToolFn to the reasoning loop
    // (match the pattern of passing it as a config property)
    const loopCallMatch = source.match(/executeReasoningLoop\(\{[\s\S]*?\}\)/);
    expect(loopCallMatch).not.toBeNull();
    const loopCallBody = loopCallMatch[0];
    expect(loopCallBody).toContain('toolRegistry');
    expect(loopCallBody).not.toMatch(/\bexecuteToolFn\b/);
  });

  it('sets trustLevel to confirm for web chat users', () => {
    // Web chat users get confirm trust level (can use auto + confirm tools)
    expect(source).toContain("trustLevel: 'confirm'");
  });

  it('scopes web chat tools to safe categories', () => {
    // Web chat should use a limited scope, not all categories
    expect(source).toContain('WEB_CHAT_TOOL_SCOPE');
    // Should include observe, analyze, create, communicate
    expect(source).toContain("'observe'");
    expect(source).toContain("'analyze'");
    expect(source).toContain("'create'");
    expect(source).toContain("'communicate'");
  });

  it('handles v2 SSE events (tool_gated, tool_suspended, tool_hotl)', () => {
    expect(source).toContain("case 'tool_gated':");
    expect(source).toContain("case 'tool_suspended':");
    expect(source).toContain("case 'tool_hotl':");
  });

  it('uses lookupTool for /skill shortcut (not v1 getTool)', () => {
    // The /skill shortcut should use v2 lookupTool
    expect(source).toContain('lookupTool(toolName)');
    // Should not use v1 getTool
    expect(source).not.toMatch(/\bgetTool\(toolName\)/);
  });

  it('index.js loads v2 tools at startup', () => {
    expect(indexSource).toContain("require('./engine/tool-registry-v2')");
    expect(indexSource).toContain('loadToolsV2()');
  });
});
