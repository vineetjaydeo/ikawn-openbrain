const { chatCompletion } = require('./llm');

const TAXONOMY = [
  '#product', '#engineering', '#design', '#growth', '#sales',
  '#ruhi', '#lazarus', '#muse', '#genie', '#prism', '#shopkeeper',
  '#decision', '#blocker', '#milestone', '#client', '#investor',
  '#maxfashion', '#shubhkart', '#infrastructure', '#deployment',
  '#vision', '#strategy', '#team', '#hiring', '#finance'
];

async function suggestHashtags(content) {
  try {
    const result = await chatCompletion(
      [
        {
          role: 'system',
          content: `You are a hashtag classifier. Given content, suggest up to 5 relevant hashtags from this taxonomy ONLY: ${TAXONOMY.join(', ')}. Return ONLY the hashtags as a JSON array of strings. No explanation.`
        },
        { role: 'user', content }
      ],
      { model: 'gpt-4o-mini' }
    );

    const text = (result.content || '').trim();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(t => typeof t === 'string')
        .map(t => `auto:${t.startsWith('#') ? t : '#' + t}`);
    }
    return [];
  } catch (err) {
    console.error('Hashtag suggestion error:', err.message);
    return [];
  }
}

module.exports = { suggestHashtags, TAXONOMY };
