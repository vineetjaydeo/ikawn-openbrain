const { BudgetExceededError } = require('../errors.js');

class ContextAssembler {
  constructor({ learningSink, brandReader, agentConfig, estimateTokens }) {
    this._learningSink = learningSink;
    this._brandReader = brandReader;
    this._agentConfig = agentConfig;
    this._estimateTokens = estimateTokens;
  }

  async compose({ ctx, state, turnInput }) {
    const config = this._agentConfig(ctx.brandContext.agent, ctx.brandContext.brand);
    const messages = [];
    const cacheBreakpoints = [];
    let estimatedInputTokens = 0;

    // Stage 1: system prompt (cached)
    const systemPrompt = `${ctx.agentSystemPrompt}\n\n${ctx.standingRules}`;
    cacheBreakpoints.push({ position: 0, kind: 'system' });
    estimatedInputTokens += this._estimateTokens(systemPrompt);

    // Stage 2: brand context (cached at brandRevision)
    const brandText = await this._brandReader(
      ctx.brandContext.brand, ctx.brandContext.isolationToken,
    );
    messages.push({
      role: 'system',
      content: [{ type: 'text', text: `Brand context:\n${brandText}` }],
    });
    cacheBreakpoints.push({ position: messages.length, kind: 'brand' });
    estimatedInputTokens += this._estimateTokens(brandText);

    // Stage 3: lessons (cached per brandRevision)
    const lessons = await this._readAndRankLessons({ ctx, state, turnInput, config });
    if (lessons.length > 0) {
      const lessonText = lessons.map((l) => `- ${l.text}`).join('\n');
      messages.push({
        role: 'system',
        content: [{ type: 'text', text: `Lessons:\n${lessonText}` }],
      });
      cacheBreakpoints.push({ position: messages.length, kind: 'lessons' });
      estimatedInputTokens += this._estimateTokens(lessonText);
    }

    // Stage 4: history since last compaction_boundary
    const history = this._historySinceLastBoundary(state.items);
    for (const item of history) {
      const msg = this._itemToMessage(item);
      if (msg) {
        messages.push(msg);
        estimatedInputTokens += this._estimateTokens(JSON.stringify(msg.content));
      }
    }
    cacheBreakpoints.push({ position: messages.length, kind: 'history' });

    // Stage 5: turn input (uncached, last)
    messages.push({ role: 'user', content: turnInput });
    estimatedInputTokens += this._estimateTokens(JSON.stringify(turnInput));

    return {
      systemPrompt,
      messages,
      tools: [], // populated by engine in Plan 02 with tool_allowlist resolution
      cacheBreakpoints,
      budget: {
        inputTokenBudget: config.inputTokenBudget,
        estimatedInputTokens,
        cacheableTokens: 0, // computed in Plan 02 once tokenizer is wired
      },
      lessonsApplied: lessons.map((l) => ({ id: l.id, score: l._score })),
    };
  }

  // Lesson ranking is wired in Task 11; for Task 9 it returns the unranked top-N.
  async _readAndRankLessons({ ctx, config }) {
    const candidates = await this._learningSink.readLessons(
      { brand: ctx.brandContext.brand, agent: ctx.brandContext.agent },
      config.maxRetrieval || 8,
    );
    return candidates.map((c) => ({ ...c, _score: 0 }));
  }

  _historySinceLastBoundary(items) {
    let lastBoundaryIdx = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].type === 'compaction_boundary') {
        lastBoundaryIdx = i;
        break;
      }
    }
    if (lastBoundaryIdx === -1) return items;
    return items.slice(lastBoundaryIdx);
  }

  _itemToMessage(item) {
    switch (item.type) {
      case 'user_message': return { role: 'user', content: item.content };
      case 'assistant_message': return { role: 'assistant', content: item.content };
      case 'compaction_boundary':
        return { role: 'system', content: [{ type: 'text', text: `Earlier conversation summary:\n${item.summary}` }] };
      case 'tool_call':
        return { role: 'assistant', content: [{ type: 'tool_use', id: item.toolUseId, name: item.toolName, input: item.input }] };
      case 'tool_result':
        return { role: 'user', content: [{ type: 'tool_result', tool_use_id: item.toolUseId, content: JSON.stringify(item.output) }] };
      case 'denial':
      case 'approval_pending':
      case 'tool_async_pending':
      case 'edit_delta':
      case 'learn_signal':
      case 'reasoning':
        return null; // engine-internal; not sent to model
      default: return null;
    }
  }
}

module.exports = { ContextAssembler };
