const { ToolError } = require('../errors.js');

class StreamingToolExecutor {
  constructor({ registry, canUseTool }) {
    this._registry = registry;
    this._canUseTool = canUseTool || (() => true);
  }

  async dispatchToolUse(toolUse, ctx, state) {
    const { id: toolUseId, name, input } = toolUse;
    const ts = Date.now();

    const tool = this._registry.get(name);
    if (!tool) {
      return this._resultItem(toolUseId, ToolError({
        kind: 'not_found', message: `tool not found: ${name}`,
      }), ts);
    }

    const validated = tool.validateInput(input);
    if (!validated.success) {
      return this._resultItem(toolUseId, ToolError({
        kind: 'validation', message: 'input validation failed', detail: validated.error.issues,
      }), ts);
    }

    const allowed = await Promise.resolve(this._canUseTool(tool, validated.data, ctx));
    if (allowed === 'pending') {
      return {
        type: 'approval_pending',
        toolUseId,
        toolName: name,
        input: validated.data,
        ts,
      };
    }
    if (!allowed) {
      return {
        type: 'denial',
        toolName: name,
        reason: 'permission denied',
        ts,
      };
    }

    if (ctx.brandContext.brand !== state.brand) {
      return this._resultItem(toolUseId, ToolError({
        kind: 'isolation_violation',
        message: `ctx brand ${ctx.brandContext.brand} does not match state brand ${state.brand}`,
      }), ts);
    }

    if (tool.mode === 'async') {
      return this._resultItem(toolUseId, ToolError({
        kind: 'runtime',
        message: 'async tools not implemented in Plan 01',
      }), ts);
    }

    let raw;
    try {
      raw = await tool.execute(validated.data, ctx);
    } catch (e) {
      return this._resultItem(toolUseId, ToolError({
        kind: 'runtime', message: e.message, detail: { stack: e.stack },
      }), ts);
    }

    const out = tool.validateOutput(raw);
    if (!out.success) {
      return this._resultItem(toolUseId, ToolError({
        kind: 'output_invalid', message: 'output validation failed', detail: out.error.issues,
      }), ts);
    }

    return this._resultItem(toolUseId, out.data, ts);
  }

  async dispatchBatch(toolUses, ctx, state) {
    const safeBatch = [];
    const exclusiveBatch = [];
    for (const tu of toolUses) {
      const tool = this._registry.get(tu.name);
      if (tool && tool.concurrency === 'exclusive') {
        exclusiveBatch.push(tu);
      } else {
        safeBatch.push(tu);
      }
    }
    const safeResults = await Promise.all(
      safeBatch.map((tu) => this.dispatchToolUse(tu, ctx, state)),
    );
    const exclusiveResults = [];
    for (const tu of exclusiveBatch) {
      exclusiveResults.push(await this.dispatchToolUse(tu, ctx, state));
    }
    return [...safeResults, ...exclusiveResults];
  }

  _resultItem(toolUseId, output, ts) {
    return { type: 'tool_result', toolUseId, output, ts };
  }
}

module.exports = { StreamingToolExecutor };
