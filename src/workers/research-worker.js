// @ts-check
'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../db');
const { captureMessage, captureEvent } = require('../utils/capture');
const { createWorkerGuard } = require('../utils/worker-guards');

const guard = createWorkerGuard('research');

const RESEARCH_TOPICS = [
  {
    id: 'ecommerce-trends',
    query: 'latest ecommerce trends strategies 2026',
    memory_type: 'MARKET_INTELLIGENCE',
    agent: 'growth',
    interval_hours: 24,
  },
  {
    id: 'seo-updates',
    query: 'latest Google algorithm update SEO changes',
    memory_type: 'SEO_UPDATE',
    agent: 'marketing',
    interval_hours: 24,
  },
  {
    id: 'meta-ads',
    query: 'Meta Facebook Instagram ads best performing strategies 2026',
    memory_type: 'AD_STRATEGY',
    agent: 'marketing',
    interval_hours: 48,
  },
  {
    id: 'google-ads',
    query: 'Google Ads performance trends best practices 2026',
    memory_type: 'AD_STRATEGY',
    agent: 'marketing',
    interval_hours: 48,
  },
  {
    id: 'social-media-trends',
    query: 'social media marketing trends Instagram Reels TikTok content strategy',
    memory_type: 'PLATFORM_UPDATE',
    agent: 'marketing',
    interval_hours: 48,
  },
  {
    id: 'ai-ecommerce',
    query: 'AI in ecommerce product photography visual content generation trends',
    memory_type: 'MARKET_INTELLIGENCE',
    agent: 'r-and-d',
    interval_hours: 72,
  },
];

const MAX_SEARCHES_PER_TOPIC = 5;
const MAX_TOTAL_SEARCHES = 30;
const DELAY_BETWEEN_TOPICS_MS = 5000;

/**
 * Get Anthropic client (lazy singleton)
 */
let _client = null;
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/**
 * Check when a topic was last researched via intelligence_snapshots.
 * @param {string} topicId
 * @returns {Promise<Date|null>}
 */
async function getLastResearchedAt(topicId) {
  const { rows } = await pool.query(
    `SELECT created_at FROM intelligence_snapshots
     WHERE snapshot_type = $1
     ORDER BY created_at DESC LIMIT 1`,
    [`research_${topicId}`]
  );
  return rows.length > 0 ? new Date(rows[0].created_at) : null;
}

/**
 * Save research snapshot timestamp.
 */
async function saveResearchSnapshot(topicId, data) {
  await pool.query(
    `INSERT INTO intelligence_snapshots (snapshot_type, period, data, summary)
     VALUES ($1, $2, $3, $4)`,
    [
      `research_${topicId}`,
      new Date().toISOString().slice(0, 10),
      JSON.stringify(data),
      data.summary || '',
    ]
  );
}

/**
 * Load existing knowledge for a memory_type to provide as context.
 * @param {string} memoryType
 * @returns {Promise<string>}
 */
async function loadExistingKnowledge(memoryType) {
  const { rows } = await pool.query(`
    SELECT content, confidence FROM distilled_memory
    WHERE memory_type = $1 AND superseded_by IS NULL
    ORDER BY confidence DESC
    LIMIT 5
  `, [memoryType]);

  if (rows.length === 0) return 'No existing knowledge on this topic yet.';

  return rows.map((r, i) =>
    `${i + 1}. [confidence: ${r.confidence}] ${r.content}`
  ).join('\n');
}

/**
 * Research a single topic using Claude + web search.
 * @returns {Promise<number>} Number of web searches used
 */
async function researchTopic(topic) {
  if (!guard.trackLLMCall('claude-sonnet-4-6')) return 0;

  const existingKnowledge = await loadExistingKnowledge(topic.memory_type);

  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: MAX_SEARCHES_PER_TOPIC,
    }],
    system: `You are a ${topic.agent} researcher for an AI-powered ecommerce platform called iKawn.
Search for the latest information on the given topic. Compare against what we already know (provided below).
Report ONLY genuinely new or changed information — skip anything we already know.

EXISTING KNOWLEDGE:
${existingKnowledge}

Respond with a JSON array (no markdown fences):
[
  {
    "finding": "clear, actionable statement of what's new or changed",
    "significance": "high" | "medium" | "low",
    "source": "where this information came from"
  }
]

If nothing new was found, return an empty array [].
Focus on actionable intelligence, not general knowledge.`,
    messages: [{
      role: 'user',
      content: `Research: ${topic.query}`,
    }],
  });

  // Count web searches used
  const searchesUsed = response.content.filter(b => b.type === 'web_search_tool_use' || b.type === 'server_tool_use').length;

  // Extract text response
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) return searchesUsed;

  // Parse findings
  let findings;
  try {
    const cleaned = textBlock.text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
    findings = JSON.parse(cleaned);
  } catch {
    // Try to extract array
    const match = textBlock.text.match(/\[[\s\S]*\]/);
    if (match) {
      try { findings = JSON.parse(match[0]); } catch { findings = []; }
    } else {
      findings = [];
    }
  }

  if (!Array.isArray(findings) || findings.length === 0) {
    console.log(`[ResearchWorker] ${topic.id}: No new findings`);
    await saveResearchSnapshot(topic.id, { findings_count: 0, summary: 'No new findings' });
    return searchesUsed;
  }

  // Filter to medium/high significance only
  const significant = findings.filter(f => f.significance !== 'low');
  console.log(`[ResearchWorker] ${topic.id}: ${significant.length} significant findings (${findings.length} total)`);

  // Capture each finding via captureMessage (enters memory → embedding → distillation pipeline)
  for (const finding of significant) {
    await captureMessage({
      brand_id: 'ikawn',
      channel: 'research',
      direction: 'inbound',
      content: finding.finding,
      metadata: {
        topic_id: topic.id,
        memory_type: topic.memory_type,
        significance: finding.significance,
        source: finding.source,
      },
      source_ref: `research_${topic.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      access_level: 'internal',
    });

    // Also write to memory_events for distillation
    await captureEvent({
      brand_id: 'ikawn',
      event_type: 'research_finding',
      payload: {
        topic_id: topic.id,
        memory_type: topic.memory_type,
        finding: finding.finding,
        significance: finding.significance,
        source: finding.source,
        agent: topic.agent,
      },
    });
  }

  await saveResearchSnapshot(topic.id, {
    findings_count: significant.length,
    total_raw: findings.length,
    summary: significant.map(f => f.finding).join('; ').slice(0, 500),
  });

  return searchesUsed;
}

/**
 * Self-evaluate low-confidence research insights.
 * Re-searches to verify, bumps or supersedes as needed.
 */
async function selfEvaluate() {
  const researchTypes = ['MARKET_INTELLIGENCE', 'SEO_UPDATE', 'AD_STRATEGY', 'PLATFORM_UPDATE'];

  const { rows: lowConfidence } = await pool.query(`
    SELECT id, content, memory_type, confidence FROM distilled_memory
    WHERE memory_type = ANY($1)
      AND superseded_by IS NULL
      AND confidence < 0.5
    ORDER BY confidence ASC
    LIMIT 5
  `, [researchTypes]);

  if (lowConfidence.length === 0) return;

  console.log(`[ResearchWorker] Self-evaluating ${lowConfidence.length} low-confidence insights`);

  for (const insight of lowConfidence) {
    if (!guard.trackLLMCall('claude-sonnet-4-6')) return;

    const client = getClient();
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 2,
        }],
        system: 'Verify whether this claim is still accurate. Respond with ONLY "confirmed" or "outdated" followed by a one-sentence explanation.',
        messages: [{
          role: 'user',
          content: `Verify: "${insight.content}"`,
        }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock) continue;

      const result = textBlock.text.trim().toLowerCase();

      if (result.startsWith('confirmed')) {
        // Bump confidence
        const newConf = Math.min(insight.confidence + 0.15, 0.95);
        await pool.query(
          `UPDATE distilled_memory SET confidence = $1, last_updated = NOW() WHERE id = $2`,
          [newConf, insight.id]
        );
        console.log(`[ResearchWorker] Confirmed: ${insight.id} (${insight.confidence} → ${newConf})`);
      } else {
        // Mark as low confidence, let natural decay handle it
        const newConf = Math.max(insight.confidence - 0.15, 0.1);
        await pool.query(
          `UPDATE distilled_memory SET confidence = $1, last_updated = NOW() WHERE id = $2`,
          [newConf, insight.id]
        );
        console.log(`[ResearchWorker] Outdated: ${insight.id} (${insight.confidence} → ${newConf})`);
      }
    } catch (err) {
      console.error(`[ResearchWorker] Self-eval failed for ${insight.id}:`, err.message);
    }

    // Rate limit between evaluations
    await sleep(5000);
  }

  // Log evaluation
  await saveResearchSnapshot('evaluation', {
    evaluated: lowConfidence.length,
    summary: `Evaluated ${lowConfidence.length} low-confidence insights`,
  });
}

/**
 * Main research run. Called every 12 hours.
 */
async function runResearch() {
  const check = guard.canRun();
  if (!check.allowed) {
    console.log(check.reason);
    return;
  }

  guard.startRun();
  let success = true;
  let totalSearches = 0;

  try {
    console.log('[ResearchWorker] Starting research run');

    for (const topic of RESEARCH_TOPICS) {
      // Check interval
      const lastRun = await getLastResearchedAt(topic.id);
      if (lastRun) {
        const hoursSince = (Date.now() - lastRun.getTime()) / (60 * 60 * 1000);
        if (hoursSince < topic.interval_hours) {
          console.log(`[ResearchWorker] Skipping ${topic.id} (${Math.round(hoursSince)}h since last run, interval: ${topic.interval_hours}h)`);
          continue;
        }
      }

      // Global search budget
      if (totalSearches >= MAX_TOTAL_SEARCHES) {
        console.log('[ResearchWorker] Global search budget exhausted, stopping');
        break;
      }

      try {
        const searches = await researchTopic(topic);
        totalSearches += searches;
        console.log(`[ResearchWorker] ${topic.id} complete (${searches} searches, ${totalSearches} total)`);
      } catch (err) {
        if (err.status === 429) {
          console.warn('[ResearchWorker] Rate limited. Stopping research run.');
          break;
        }
        console.error(`[ResearchWorker] Topic ${topic.id} failed:`, err.message);
      }

      // Delay between topics
      await sleep(DELAY_BETWEEN_TOPICS_MS);
    }

    // Self-evaluation pass
    try {
      await selfEvaluate();
    } catch (err) {
      console.error('[ResearchWorker] Self-evaluation failed:', err.message);
    }

    console.log(`[ResearchWorker] Run complete (${totalSearches} total searches)`);
  } catch (err) {
    success = false;
    console.error('[ResearchWorker] Run failed:', err.message);
  } finally {
    guard.endRun(success);
  }
}

// ── Scheduling ──

let scheduledTimeout = null;
let scheduledInterval = null;
const INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

function startResearchWorker() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[ResearchWorker] ANTHROPIC_API_KEY not set — worker disabled');
    return;
  }

  console.log('[ResearchWorker] Starting (every 12h)');

  // First run 5 minutes after startup (let other workers settle)
  scheduledTimeout = setTimeout(() => {
    runResearch();
    scheduledInterval = setInterval(runResearch, INTERVAL_MS);
  }, 5 * 60 * 1000);
}

function stopResearchWorker() {
  if (scheduledTimeout) clearTimeout(scheduledTimeout);
  if (scheduledInterval) clearInterval(scheduledInterval);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { startResearchWorker, stopResearchWorker, runResearch };
