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

    const blocks = new Map(); // index -> { type, toolUseId?, name?, jsonBuf? }

    for await (const event of stream) {
      if (!event || !event.type) continue;
      if (event.type === 'content_block_start') {
        const cb = event.content_block;
        if (cb.type === 'tool_use') {
          blocks.set(event.index, { type: 'tool_use', toolUseId: cb.id, name: cb.name, jsonBuf: '' });
        } else if (cb.type === 'text') {
          blocks.set(event.index, { type: 'text' });
        }
      } else if (event.type === 'content_block_delta') {
        const block = blocks.get(event.index);
        if (!block) continue;
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          block.jsonBuf = (block.jsonBuf || '') + event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        const block = blocks.get(event.index);
        if (!block) continue;
        if (block.type === 'tool_use') {
          let parsed = {};
          if (block.jsonBuf && block.jsonBuf.length > 0) {
            try {
              parsed = JSON.parse(block.jsonBuf);
            } catch (e) {
              throw new Error(`ClaudeProvider tool_use input JSON parse failed: ${e.message}; buffer="${block.jsonBuf}"`);
            }
          }
          yield { type: 'tool_use', toolUseId: block.toolUseId, name: block.name, input: parsed };
        }
        blocks.delete(event.index);
      } else if (event.type === 'message_stop') {
        const msg = event.message || {};
        const usage = msg.usage || {};
        yield {
          type: 'message_stop',
          stopReason: msg.stop_reason,
          usage: {
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            cacheReadInputTokens: usage.cache_read_input_tokens || 0,
            cacheCreationInputTokens: usage.cache_creation_input_tokens || 0,
          },
        };
      }
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

}

module.exports = { ClaudeProvider };
