const { BudgetExceededError } = require('../errors.js');

class ContextAssembler {
  constructor({ learningSink, brandReader, agentConfig, estimateTokens, similarityFn }) {
    this._learningSink = learningSink;
    this._brandReader = brandReader;
    this._agentConfig = agentConfig;
    this._estimateTokens = estimateTokens;
    this._similarityFn = similarityFn || (() => 0);
  }

  async compose({ ctx, state, turnInput }) {
    const config = this._agentConfig(ctx.brandContext.agent, ctx.brandContext.brand);
    const messages = [];
    const cacheBreakpoints = [];

    const systemPrompt = `${ctx.agentSystemPrompt}\n\n${ctx.standingRules}`;
    cacheBreakpoints.push({ position: 0, kind: 'system' });
    const systemTokens = this._estimateTokens(systemPrompt);

    const brandText = await this._brandReader(
      ctx.brandContext.brand, ctx.brandContext.isolationToken,
    );
    const brandMsg = {
      role: 'system',
      content: [{ type: 'text', text: `Brand context:\n${brandText}` }],
    };
    messages.push(brandMsg);
    cacheBreakpoints.push({ position: messages.length, kind: 'brand' });
    const brandTokens = this._estimateTokens(brandText);

    let lessons = await this._readAndRankLessons({ ctx, state, turnInput, config });

    const history = this._historySinceLastBoundary(state.items);
    const historyMsgs = [];
    let historyTokens = 0;
    for (const item of history) {
      const msg = this._itemToMessage(item);
      if (msg) {
        historyMsgs.push(msg);
        historyTokens += this._estimateTokens(JSON.stringify(msg.content));
      }
    }

    const turnTokens = this._estimateTokens(JSON.stringify(turnInput));
    const fixedTokens = systemTokens + brandTokens + historyTokens + turnTokens;

    const lessonTokensFor = (ls) => ls.reduce(
      (sum, l) => sum + this._estimateTokens(`- ${l.text}`), 0,
    );

    while (true) {
      const lessonTokens = lessonTokensFor(lessons);
      const total = fixedTokens + lessonTokens;
      if (total <= config.inputTokenBudget) break;
      if (lessons.length === 0) {
        throw new BudgetExceededError('context exceeds budget after dropping all lessons', {
          budget: config.inputTokenBudget, estimated: total,
        });
      }
      lessons.sort((a, b) => (a._score || 0) - (b._score || 0));
      lessons.shift();
    }

    if (lessons.length > 0) {
      const lessonText = lessons.map((l) => `- ${l.text}`).join('\n');
      messages.push({
        role: 'system',
        content: [{ type: 'text', text: `Lessons:\n${lessonText}` }],
      });
      cacheBreakpoints.push({ position: messages.length, kind: 'lessons' });
    }

    for (const m of historyMsgs) {
      messages.push(m);
    }
    cacheBreakpoints.push({ position: messages.length, kind: 'history' });

    messages.push({ role: 'user', content: turnInput });

    const lessonTokens = lessonTokensFor(lessons);
    const estimatedInputTokens = systemTokens + brandTokens + lessonTokens + historyTokens + turnTokens;

    return {
      systemPrompt,
      messages,
      tools: [],
      cacheBreakpoints,
      budget: {
        inputTokenBudget: config.inputTokenBudget,
        estimatedInputTokens,
        cacheableTokens: 0,
      },
      lessonsApplied: lessons.map((l) => ({ id: l.id, score: l._score || 0 })),
    };
  }

  async _readAndRankLessons({ ctx, turnInput, config }) {
    const candidates = await this._learningSink.readLessons(
      { brand: ctx.brandContext.brand, agent: ctx.brandContext.agent },
      Math.max(config.maxRetrieval * 2, 0), // pull a wider pool, then rank
    );
    if (candidates.length === 0) return [];
    const weights = config.lessonInjectionWeights || {
      similarity: 0.5, recency: 0.3, quality_score: 0.2,
    };
    const now = Date.now();
    const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
    const ranked = candidates.map((c) => {
      const sim = this._similarityFn(c, turnInput);
      const ageMs = Math.max(now - (c.created_at || 0), 0);
      const recency = Math.exp(-ageMs / RECENCY_HALF_LIFE_MS);
      const quality = c.quality_score || 0;
      const score = weights.similarity * sim
                  + weights.recency * recency
                  + weights.quality_score * quality;
      return { ...c, _score: score };
    });
    ranked.sort((a, b) => b._score - a._score);
    return ranked.slice(0, config.maxRetrieval || 8);
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
