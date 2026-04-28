'use strict';

class ClaudeProvider {
  constructor({ client, defaultModel = 'claude-sonnet-4-6', defaultMaxTokens = 4096 } = {}) {
    if (!client) throw new Error('ClaudeProvider requires { client }');
    this._client = client;
    this._defaultModel = defaultModel;
    this._defaultMaxTokens = defaultMaxTokens;
  }

  async *invoke({ systemPrompt, messages, tools, cacheBreakpoints, model, maxTokens }) {
    const params = this._buildParams({ systemPrompt, messages, tools, cacheBreakpoints, model, maxTokens });
    const stream = this._client.messages.stream(params);

    for await (const event of stream) {
      const out = this._mapEvent(event);
      if (out) yield out;
    }
  }

  _buildParams({ systemPrompt, messages, tools, cacheBreakpoints, model, maxTokens }) {
    const sys = [{ type: 'text', text: systemPrompt }];
    const msgs = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string'
        ? [{ type: 'text', text: m.content }]
        : m.content,
    }));

    for (const bp of cacheBreakpoints || []) {
      if (bp.kind === 'system') {
        sys[sys.length - 1].cache_control = { type: 'ephemeral' };
      } else if (bp.kind === 'brand' || bp.kind === 'lessons' || bp.kind === 'history') {
        // ContextAssembler emits `position = messages.length` AFTER each stage push,
        // so the LAST message of that stage is at zero-indexed slot `position - 1`.
        const target = msgs[bp.position - 1];
        if (target && Array.isArray(target.content) && target.content.length > 0) {
          target.content[target.content.length - 1].cache_control = { type: 'ephemeral' };
        }
      }
    }

    return {
      model: model || this._defaultModel,
      max_tokens: maxTokens || this._defaultMaxTokens,
      system: sys,
      messages: msgs,
      tools: tools || [],
    };
  }

  _mapEvent(_event) {
    // Streaming event mapping is implemented in Task 6.
    // For Task 5 we only verify request shaping; a single message_stop event
    // is the minimum the test fakes deliver, so map it here.
    if (_event && _event.type === 'message_stop' && _event.message) {
      return {
        type: 'message_stop',
        stopReason: _event.message.stop_reason,
        usage: {
          inputTokens: _event.message.usage.input_tokens,
          outputTokens: _event.message.usage.output_tokens,
          cacheReadInputTokens: _event.message.usage.cache_read_input_tokens || 0,
          cacheCreationInputTokens: _event.message.usage.cache_creation_input_tokens || 0,
        },
      };
    }
    return null;
  }
}

module.exports = { ClaudeProvider };
