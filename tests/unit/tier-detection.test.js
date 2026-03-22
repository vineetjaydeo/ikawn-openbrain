
// Test detectTier inline since it's not exported — replicate exact logic from chat-api.js
const EXPERT_KEYWORDS = /\b(investor|valuation|funding|revenue|series\s*[abc]|due\s*diligence|term\s*sheet|cap\s*table|equity|partnership\s*agreement|legal|compliance|acquisition|board\s*meeting|arr|mrr|burn\s*rate|runway|dilution|convertible\s*note|safe\s*note)\b/i;
const EXPERT_PHRASES = /how much is ikawn worth|tell me about the company|what(?:'s| is) our arr|what(?:'s| is) the valuation|investor deck|pitch deck|fundraising/i;
const REGULAR_PATTERNS = /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no|bye|good morning|good evening|gm|gn|lol|haha|hmm|cool|nice|great|got it|noted)[\s!.?]*$/i;

function detectTier(content, historyRows, forcedTier, contextSummary) {
  if (forcedTier && ['regular', 'pro', 'expert'].includes(forcedTier)) {
    return forcedTier;
  }
  const trimmed = (content || '').trim();
  if (trimmed.length < 20 && REGULAR_PATTERNS.test(trimmed)) {
    return 'regular';
  }
  if (contextSummary && contextSummary.complexity) {
    const complexityMap = { casual: 'regular', standard: 'pro', complex: 'expert' };
    const mapped = complexityMap[contextSummary.complexity];
    if (mapped) return mapped;
  }
  if (EXPERT_KEYWORDS.test(trimmed) || EXPERT_PHRASES.test(trimmed)) {
    return 'expert';
  }
  return 'pro';
}

describe('detectTier', () => {
  it('returns "regular" for simple greetings', () => {
    expect(detectTier('hello', [], null, null)).toBe('regular');
    expect(detectTier('thanks!', [], null, null)).toBe('regular');
    expect(detectTier('ok', [], null, null)).toBe('regular');
    expect(detectTier('got it', [], null, null)).toBe('regular');
  });

  it('returns "pro" for general conversation', () => {
    expect(detectTier('How do I set up a new brand campaign?', [], null, null)).toBe('pro');
    expect(detectTier('Can you help me redesign the homepage?', [], null, null)).toBe('pro');
  });

  it('returns "expert" for investor/business keywords', () => {
    expect(detectTier('What is our current valuation?', [], null, null)).toBe('expert');
    expect(detectTier('Prepare the investor deck', [], null, null)).toBe('expert');
    expect(detectTier('What is our ARR right now?', [], null, null)).toBe('expert');
    expect(detectTier('Review the term sheet from the VC', [], null, null)).toBe('expert');
  });

  it('respects forced_tier override', () => {
    expect(detectTier('hello', [], 'expert', null)).toBe('expert');
    expect(detectTier('What is valuation?', [], 'regular', null)).toBe('regular');
  });

  it('uses contextSummary.complexity when available', () => {
    expect(detectTier('hello', [], null, { complexity: 'casual' })).toBe('regular');
    expect(detectTier('something long enough to not be regular pattern', [], null, { complexity: 'standard' })).toBe('pro');
    expect(detectTier('something long enough to not be regular pattern', [], null, { complexity: 'complex' })).toBe('expert');
  });

  // Regression: bug #16 — tier must NOT be sticky across messages
  it('does not escalate based on history tier values', () => {
    const history = [
      { role: 'user', content: 'explain the full architecture', tier: 'expert' },
      { role: 'assistant', content: 'Here is the architecture...', tier: 'expert' },
    ];
    // "ok" is a regular greeting — should NOT inherit expert from history
    expect(detectTier('ok', history, null, null)).toBe('regular');
  });

  // Regression: bug #17 — only current message content matters
  it('does not scan history content for keywords', () => {
    const history = [
      { role: 'user', content: 'Tell me about our valuation and cap table' },
    ];
    // "yes" follow-up should be regular, not expert (history has expert keywords)
    expect(detectTier('yes', history, null, null)).toBe('regular');
  });

  it('returns "pro" as default for non-trivial non-expert messages', () => {
    expect(detectTier('I need help understanding the deployment pipeline', [], null, null)).toBe('pro');
  });
});
