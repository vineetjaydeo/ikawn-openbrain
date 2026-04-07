const { Router } = require('express');
const { requireAdmin } = require('../auth');

const router = Router();

// In-memory cache (15 minutes)
let cachedData = null;
let cachedAt = 0;
const CACHE_TTL = 15 * 60 * 1000;

async function fetchOpenAICosts() {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) return { error: 'OPENAI_ADMIN_KEY not configured' };

  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;

  const headers = { Authorization: `Bearer ${adminKey}` };

  try {
    const [costsRes, completionsRes, embeddingsRes, imagesRes] = await Promise.all([
      fetch(`https://api.openai.com/v1/organization/costs?start_time=${sevenDaysAgo}&bucket_width=1d`, { headers }),
      fetch(`https://api.openai.com/v1/organization/usage/completions?start_time=${sevenDaysAgo}&bucket_width=1d&group_by=model`, { headers }),
      fetch(`https://api.openai.com/v1/organization/usage/embeddings?start_time=${sevenDaysAgo}&bucket_width=1d`, { headers }),
      fetch(`https://api.openai.com/v1/organization/usage/images?start_time=${sevenDaysAgo}&bucket_width=1d`, { headers }),
    ]);

    if (!costsRes.ok) {
      const errBody = await costsRes.text();
      console.error('[AdminCosts] OpenAI API error:', costsRes.status, errBody);
      return { error: `OpenAI API returned ${costsRes.status}` };
    }

    const [costs, completions, embeddings, images] = await Promise.all([
      costsRes.json(),
      completionsRes.ok ? completionsRes.json() : { data: [] },
      embeddingsRes.ok ? embeddingsRes.json() : { data: [] },
      imagesRes.ok ? imagesRes.json() : { data: [] },
    ]);

    // Build daily spend from costs response
    const dailySpend = {};
    for (const bucket of (costs.data || [])) {
      const date = new Date(bucket.start_time * 1000).toISOString().slice(0, 10);
      const usd = (bucket.results || []).reduce((sum, r) => sum + Number(r.amount?.value || 0), 0);
      dailySpend[date] = (dailySpend[date] || 0) + usd;
    }

    const today = new Date().toISOString().slice(0, 10);
    const todaySpend = dailySpend[today] || 0;

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      last7Days.push({ date: d, spend_usd: +(dailySpend[d] || 0).toFixed(4) });
    }

    // Aggregate completions by model
    const modelMap = {};
    for (const bucket of (completions.data || [])) {
      for (const result of (bucket.results || [])) {
        const model = result.model || result.snapshot_id || 'unknown';
        if (!modelMap[model]) modelMap[model] = { model, input_tokens: 0, output_tokens: 0, requests: 0 };
        modelMap[model].input_tokens += result.input_tokens || 0;
        modelMap[model].output_tokens += result.output_tokens || 0;
        modelMap[model].requests += result.num_model_requests || 0;
      }
    }
    const byModel = Object.values(modelMap);

    // Aggregate embeddings
    let embTokens = 0, embRequests = 0;
    for (const bucket of (embeddings.data || [])) {
      for (const result of (bucket.results || [])) {
        embTokens += result.input_tokens || 0;
        embRequests += result.num_model_requests || 0;
      }
    }

    // Aggregate images
    let imgCount = 0, imgRequests = 0;
    for (const bucket of (images.data || [])) {
      for (const result of (bucket.results || [])) {
        imgCount += result.num_images || 0;
        imgRequests += result.num_model_requests || 0;
      }
    }

    return {
      today: { spend_usd: +todaySpend.toFixed(4), date: today },
      last_7_days: last7Days,
      by_model: byModel,
      embeddings: { tokens: embTokens, requests: embRequests },
      images: { count: imgCount, requests: imgRequests },
      cached_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[AdminCosts] Fetch error:', err);
    return { error: err.message };
  }
}

// GET /admin/costs -- JSON API
router.get('/admin/costs', requireAdmin, async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const now = Date.now();

  if (!forceRefresh && cachedData && (now - cachedAt) < CACHE_TTL) {
    return res.json(cachedData);
  }

  const data = await fetchOpenAICosts();
  if (!data.error) {
    cachedData = data;
    cachedAt = now;
  }
  res.json(data);
});

module.exports = router;
