const TAXONOMY = [
  '#product', '#engineering', '#design', '#growth', '#sales',
  '#ruhi', '#lazarus', '#muse', '#genie', '#prism', '#shopkeeper',
  '#decision', '#blocker', '#milestone', '#client', '#investor',
  '#maxfashion', '#shubhkart', '#infrastructure', '#deployment',
  '#vision', '#strategy', '#team', '#hiring', '#finance'
];

// Keyword patterns for each hashtag — matched against lowercased content
const KEYWORD_MAP = {
  '#product':        ['product', 'feature', 'roadmap', 'spec', 'requirement', 'user story', 'prd'],
  '#engineering':    ['code', 'bug', 'fix', 'deploy', 'api', 'endpoint', 'server', 'database', 'postgres', 'migration', 'refactor', 'test', 'ci', 'build', 'error', 'crash', 'debug', 'commit', 'pr ', 'pull request', 'merge'],
  '#design':         ['design', 'ui', 'ux', 'layout', 'color', 'font', 'component', 'figma', 'mockup', 'wireframe', 'css', 'tailwind', 'theme'],
  '#growth':         ['growth', 'acquisition', 'retention', 'conversion', 'funnel', 'onboard', 'signup', 'marketing', 'seo', 'traffic'],
  '#sales':          ['sales', 'deal', 'pipeline', 'prospect', 'lead', 'pricing', 'subscription', 'revenue', 'contract', 'demo'],
  '#ruhi':           ['ruhi', 'openbrain', 'memory', 'persona', 'soul.md', 'rag', 'chat'],
  '#lazarus':        ['lazarus', 'video', 'animate', 'motion'],
  '#muse':           ['muse', 'creative', 'carousel', 'kinetic', 'faceless', 'explainer'],
  '#genie':          ['genie', 'image gen', 'generate image', 'text to image', 'z-image', 'seedream'],
  '#prism':          ['prism', 'edit image', 'image edit', 'enhance', 'upscale'],
  '#shopkeeper':     ['shopkeeper', 'shopify', 'store', 'catalog', 'inventory', 'order'],
  '#decision':       ['decision', 'decided', 'chose', 'trade-off', 'tradeoff', 'architecture decision'],
  '#blocker':        ['blocker', 'blocked', 'stuck', 'cannot proceed', 'waiting on', 'dependency'],
  '#milestone':      ['milestone', 'launch', 'release', 'shipped', 'v1', 'v2', 'v3', 'go live', 'completed phase'],
  '#client':         ['client', 'customer', 'user feedback', 'support ticket', 'onboarding'],
  '#investor':       ['investor', 'funding', 'pitch', 'valuation', 'cap table', 'term sheet'],
  '#maxfashion':     ['maxfashion', 'max fashion'],
  '#shubhkart':      ['shubhkart'],
  '#infrastructure': ['infrastructure', 'fly.io', 'vps', 'docker', 'container', 'hosting', 'ssl', 'dns', 'cloudflare', 'r2', 'bucket'],
  '#deployment':     ['deploy', 'deployment', 'release', 'rollback', 'ci/cd', 'pipeline', 'staging', 'production'],
  '#vision':         ['vision', 'north star', 'long term', 'roadmap', 'future', 'ambition'],
  '#strategy':       ['strategy', 'strategic', 'competitive', 'positioning', 'market', 'differentiation'],
  '#team':           ['team', 'teammate', 'colleague', 'standup', 'sync', 'meeting', '1:1'],
  '#hiring':         ['hiring', 'hire', 'candidate', 'interview', 'job', 'role', 'recruiting'],
  '#finance':        ['finance', 'cost', 'budget', 'spend', 'invoice', 'payment', 'burn', 'runway', 'expense'],
};

/**
 * Suggest hashtags using keyword matching against the fixed taxonomy.
 * No LLM call — instant, free, deterministic.
 * Returns up to 5 hashtags in the same format as before: ['auto:#tag', ...]
 */
function suggestHashtags(content) {
  const lower = content.toLowerCase();
  const matches = [];

  for (const [tag, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matches.push(tag);
        break; // one match per tag is enough
      }
    }
  }

  // Return top 5, prefixed with auto:
  return Promise.resolve(
    matches.slice(0, 5).map(t => `auto:${t}`)
  );
}

module.exports = { suggestHashtags, TAXONOMY };
