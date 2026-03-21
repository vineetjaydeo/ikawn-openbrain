// @ts-check
'use strict';

const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');
const { callReflectionLLM, parseJSONSafe } = require('../utils/llm');
const { createWorkerGuard } = require('../utils/worker-guards');
const { isPersonalMemory } = require('../utils/memory-types');

const { resetExpiredBudgets, expireStaleActions } = require('../utils/governance');

const guard = createWorkerGuard('distillation');

/** Minimum events needed before distillation runs for a group */
const MIN_EVENTS_FOR_DISTILLATION = 3;
/** Maximum events per LLM call to control token budget */
const MAX_EVENTS_PER_CALL = 50;
/** Cosine similarity threshold for supersession check */
const SUPERSESSION_THRESHOLD = 0.85;

/**
 * Main distillation entry point. Processes all unprocessed memory_events.
 */
async function runDistillation() {
  const check = guard.canRun();
  if (!check.allowed) {
    console.log(check.reason);
    return;
  }

  guard.startRun();
  let success = true;

  try {
    // Pass 1: Edit delta distillation (caption_edit events)
    await distillEditDeltas();

    // Pass 2: General event distillation (all other event types)
    await distillGeneralEvents();

    // Governance maintenance — budget resets + stale action expiration
    try {
      await resetExpiredBudgets();
      await expireStaleActions();
    } catch (govErr) {
      console.error('[DistillationWorker] Governance maintenance failed:', govErr.message);
    }

    console.log('[DistillationWorker] Run complete');
  } catch (err) {
    success = false;
    console.error('[DistillationWorker] Run failed:', err.message);
  } finally {
    guard.endRun(success);
  }
}

/**
 * Pass 1: Process caption_edit events into BRAND_VOICE_RULE memories.
 */
async function distillEditDeltas() {
  const { rows: events } = await pool.query(`
    SELECT id, brand_id, user_id, payload, created_at
    FROM memory_events
    WHERE event_type = 'caption_edit'
      AND processed_at IS NULL
    ORDER BY created_at ASC
    LIMIT 200
  `);

  if (events.length === 0) return;

  // Group by brand_id + user_id
  /** @type {Map<string, typeof events>} */
  const grouped = new Map();
  for (const evt of events) {
    const key = `${evt.brand_id}::${evt.user_id || '_system'}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(evt);
  }

  for (const [, brandEvents] of grouped) {
    const brandId = brandEvents[0].brand_id;
    const userId = brandEvents[0].user_id || null;
    if (brandEvents.length < MIN_EVENTS_FOR_DISTILLATION) {
      continue; // Not enough data yet
    }

    // Session diversity: require events spread across >= 1 hour
    const timestamps = brandEvents.map(e => new Date(e.created_at).getTime());
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const timeSpreadHours = (maxTs - minTs) / (60 * 60 * 1000);
    if (timeSpreadHours < 1) {
      continue; // All from same session — not enough temporal diversity
    }

    // Adjust confidence based on time spread (full confidence after 7 days of evidence)
    const timeSpreadDays = (maxTs - minTs) / (24 * 60 * 60 * 1000);
    const spreadFactor = Math.min(1, timeSpreadDays / 7);

    // Process in chunks of MAX_EVENTS_PER_CALL
    for (let i = 0; i < brandEvents.length; i += MAX_EVENTS_PER_CALL) {
      const chunk = brandEvents.slice(i, i + MAX_EVENTS_PER_CALL);

      if (!guard.trackLLMCall('claude-haiku-4-5-20251001')) return;

      // Strip to pattern-relevant fields only (token optimization)
      const editsForLLM = chunk.map(e => ({
        original: e.payload.original,
        edited: e.payload.edited,
        agent: e.payload.agent_name,
        type: e.payload.delta_type,
      }));

      const systemPrompt = `You are analyzing content edits for a brand. A user edited AI-generated content.
Extract DURABLE voice and style rules from the editing patterns.

Return ONLY a JSON array (no markdown, no preamble, no explanation):
[
  {
    "memory_type": "BRAND_VOICE_RULE",
    "content": "descriptive rule in plain English",
    "confidence": <number between 0.3 and 0.95>,
    "reasoning": "evidence for this rule from the edits"
  }
]

Confidence scoring (follow strictly):
- 0.3-0.5: Pattern seen in 2 edits (tentative)
- 0.5-0.7: Pattern seen in 3-4 edits (emerging)
- 0.7-0.85: Pattern seen in 5+ edits (established)
- 0.85-0.95: Consistent with zero counter-examples (strong)
Never assign above 0.95.

Only extract rules visible in 2+ edits. Ignore one-off changes.
Focus on: tone, sentence length, emoji usage, punctuation, word choices,
capitalization, hashtag preferences, CTA style, product name formatting.
If no clear patterns exist, return an empty array [].`;

      const userPrompt = `Here are the original and edited versions:\n${JSON.stringify(editsForLLM, null, 2)}`;

      try {
        const raw = await callReflectionLLM('edit_delta_distillation', systemPrompt, userPrompt);
        const rules = parseJSONSafe(raw);

        if (!Array.isArray(rules)) {
          console.warn('[DistillationWorker] Non-array response for edit deltas, skipping chunk');
          continue; // Don't mark processed — retry next run
        }

        // Apply spread factor to confidence (temporal diversity weighting)
        for (const rule of rules) {
          if (rule.confidence) {
            rule.confidence = Math.round(rule.confidence * spreadFactor * 100) / 100;
            rule.confidence = Math.max(0.3, rule.confidence); // floor
          }
        }

        for (const rule of rules) {
          if (!rule.content || !rule.memory_type) continue;
          await upsertDistilledMemory(brandId, userId, rule, chunk.map(e => e.id));
        }

        // Mark events as processed
        const eventIds = chunk.map(e => e.id);
        await pool.query(`
          UPDATE memory_events SET processed_at = NOW()
          WHERE id = ANY($1)
        `, [eventIds]);
      } catch (err) {
        if (err.status === 429) {
          const backoff = guard.getBackoffMs();
          console.warn(`[DistillationWorker] Rate limited. Backing off ${backoff}ms`);
          await sleep(backoff);
        } else {
          console.error('[DistillationWorker] Edit delta chunk failed:', err.message);
        }
      }
    }
  }
}

/**
 * Pass 2: Process all non-caption_edit events.
 */
async function distillGeneralEvents() {
  const { rows: events } = await pool.query(`
    SELECT id, brand_id, user_id, event_type, payload, created_at
    FROM memory_events
    WHERE event_type != 'caption_edit'
      AND processed_at IS NULL
    ORDER BY created_at ASC
    LIMIT 200
  `);

  if (events.length === 0) return;

  // Group by (brand_id, user_id, event_type)
  /** @type {Map<string, typeof events>} */
  const grouped = new Map();
  for (const evt of events) {
    const key = `${evt.brand_id}::${evt.user_id || '_system'}::${evt.event_type}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(evt);
  }

  for (const [, groupEvents] of grouped) {
    const userId = groupEvents[0].user_id || null;
    if (groupEvents.length < MIN_EVENTS_FOR_DISTILLATION) continue;

    // Session diversity: require events spread across >= 1 hour
    const gTimestamps = groupEvents.map(e => new Date(e.created_at).getTime());
    const gMinTs = Math.min(...gTimestamps);
    const gMaxTs = Math.max(...gTimestamps);
    if ((gMaxTs - gMinTs) / (60 * 60 * 1000) < 1) continue;
    const gSpreadFactor = Math.min(1, (gMaxTs - gMinTs) / (7 * 24 * 60 * 60 * 1000));

    for (let i = 0; i < groupEvents.length; i += MAX_EVENTS_PER_CALL) {
      const chunk = groupEvents.slice(i, i + MAX_EVENTS_PER_CALL);

      if (!guard.trackLLMCall('claude-haiku-4-5-20251001')) return;

      const eventsForLLM = chunk.map(e => ({
        type: e.event_type,
        data: e.payload,
      }));

      const systemPrompt = `Review the following events from a commerce platform.
Extract durable knowledge that should persist beyond these individual events.

Return ONLY a JSON array (no markdown, no preamble):
[
  {
    "memory_type": "<one of: USER_PREFERENCE, BRAND_VOICE_RULE, BUSINESS_INSIGHT, WORKFLOW_PATTERN, CORRECTION, CREATIVE_PATTERN, CONTENT_STRATEGY, AUDIENCE_INSIGHT, PERFORMANCE_INSIGHT, MARKET_INTELLIGENCE, SEO_UPDATE, AD_STRATEGY, PLATFORM_UPDATE>",
    "content": "clear, actionable statement",
    "confidence": <number 0.3-0.95>,
    "reasoning": "what evidence supports this"
  }
]

Confidence scoring (follow strictly):
- 0.3-0.5: Tentative (2-3 events)
- 0.5-0.7: Emerging (4-6 events)
- 0.7-0.85: Established (7+ events)
- 0.85-0.95: Consistent with zero counter-examples
Never above 0.95.

Rules:
- Only extract patterns, not one-off observations
- Be specific and actionable
- Ignore temporary information
- If no patterns, return []`;

      const userPrompt = `Events:\n${JSON.stringify(eventsForLLM, null, 2)}`;

      try {
        const raw = await callReflectionLLM('event_distillation', systemPrompt, userPrompt);
        const insights = parseJSONSafe(raw);

        if (!Array.isArray(insights)) {
          console.warn('[DistillationWorker] Non-array response for general events, skipping chunk');
          continue;
        }

        // Apply spread factor to confidence
        for (const insight of insights) {
          if (insight.confidence) {
            insight.confidence = Math.round(insight.confidence * gSpreadFactor * 100) / 100;
            insight.confidence = Math.max(0.3, insight.confidence);
          }
        }

        for (const insight of insights) {
          if (!insight.content || !insight.memory_type) continue;
          await upsertDistilledMemory(chunk[0].brand_id, userId, insight, chunk.map(e => e.id));
        }

        const eventIds = chunk.map(e => e.id);
        await pool.query(`
          UPDATE memory_events SET processed_at = NOW()
          WHERE id = ANY($1)
        `, [eventIds]);
      } catch (err) {
        if (err.status === 429) {
          await sleep(guard.getBackoffMs());
        } else {
          console.error('[DistillationWorker] General event chunk failed:', err.message);
        }
      }
    }
  }
}

/**
 * Upsert a distilled memory with supersession logic.
 * If similar active memory exists (cosine > 0.85):
 *   - Content aligns → bump confidence, merge source_event_ids
 *   - Content contradicts → supersede old, insert new
 * Otherwise → insert new.
 *
 * CRITICAL: Personal memory types are scoped to user_id. Shared types use user_id = NULL.
 * Supersession must NEVER cross users.
 *
 * @param {string} brandId
 * @param {string|null} userId
 * @param {{ memory_type: string, content: string, confidence: number, reasoning: string }} insight
 * @param {string[]} sourceEventIds
 */
async function upsertDistilledMemory(brandId, userId, insight, sourceEventIds) {
  // Personal memory types get the user_id; shared types always store NULL
  const effectiveUserId = isPersonalMemory(insight.memory_type) ? userId : null;

  // Generate embedding for the new insight
  let embedding;
  try {
    embedding = await getEmbedding(insight.content);
  } catch (err) {
    console.error('[DistillationWorker] Embedding failed for insight, inserting without:', err.message);
    await pool.query(`
      INSERT INTO distilled_memory (brand_id, user_id, memory_type, content, confidence, source_event_ids, reasoning, embedding_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
    `, [brandId, effectiveUserId, insight.memory_type, insight.content, insight.confidence, sourceEventIds, insight.reasoning]);
    return;
  }

  // Check for similar active memories — scoped by user_id to prevent cross-user supersession
  const embeddingStr = `{${embedding.join(',')}}`;
  const userClause = effectiveUserId != null
    ? `AND user_id = $4`
    : `AND user_id IS NULL`;
  const similarParams = effectiveUserId != null
    ? [embeddingStr, brandId, insight.memory_type, effectiveUserId]
    : [embeddingStr, brandId, insight.memory_type];

  const { rows: similar } = await pool.query(`
    SELECT id, content, confidence, source_event_ids, reasoning,
           cosine_similarity(embedding, $1::float8[]) AS similarity
    FROM distilled_memory
    WHERE brand_id = $2
      AND memory_type = $3
      ${userClause}
      AND superseded_by IS NULL
      AND embedding IS NOT NULL
    ORDER BY cosine_similarity(embedding, $1::float8[]) DESC
    LIMIT 1
  `, similarParams);

  if (similar.length > 0 && similar[0].similarity > SUPERSESSION_THRESHOLD) {
    const existing = similar[0];

    // High similarity — ask LLM whether content aligns or contradicts
    // Escalate to Sonnet if either memory has high confidence (prevents corruption)
    const useHighModel = existing.confidence > 0.8 || insight.confidence > 0.8;
    const alignmentModel = useHighModel ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
    if (!guard.trackLLMCall(alignmentModel)) return;

    let alignment = 'agree';
    try {
      const alignmentRaw = await callReflectionLLM(
        useHighModel ? 'strategic_rollup' : 'edit_delta_distillation',
        'You compare two knowledge rules. Reply with ONLY the word "agree" or "contradict". Nothing else.',
        `Existing rule: "${existing.content}"\nNew rule: "${insight.content}"`
      );
      alignment = alignmentRaw.trim().toLowerCase().includes('contradict') ? 'contradict' : 'agree';
    } catch (err) {
      console.warn('[DistillationWorker] Alignment check failed, defaulting to reinforce:', err.message);
    }

    if (alignment === 'contradict') {
      // Contradiction pressure: reduce BOTH confidences by 0.1
      // The one that keeps getting reinforced wins; the other decays
      const reducedExisting = Math.max(0.1, existing.confidence - 0.1);
      const reducedNew = Math.max(0.1, insight.confidence - 0.1);

      await pool.query(`
        UPDATE distilled_memory SET confidence = $1, last_updated = NOW() WHERE id = $2
      `, [reducedExisting, existing.id]);

      // Still insert the new contradicting memory so it can compete
      await pool.query(`
        INSERT INTO distilled_memory (brand_id, user_id, memory_type, content, confidence, source_event_ids, reasoning, embedding, embedding_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::float8[], 'done')
      `, [brandId, effectiveUserId, insight.memory_type, insight.content, reducedNew, sourceEventIds, insight.reasoning, embeddingStr]);

      console.log(`[DistillationWorker] Contradiction: existing ${existing.id} (${existing.confidence}->${reducedExisting}), new (${insight.confidence}->${reducedNew})`);
    } else {
      // Reinforce: bump confidence, merge evidence
      const newConfidence = Math.min(existing.confidence + 0.1, 0.99);
      const mergedEventIds = [...new Set([...(existing.source_event_ids || []), ...sourceEventIds])];
      const updatedReasoning = `${existing.reasoning || ''}\n[${new Date().toISOString().slice(0, 10)}] Reinforced: ${insight.reasoning}`;

      await pool.query(`
        UPDATE distilled_memory
        SET confidence = $1,
            source_event_ids = $2,
            reasoning = $3,
            last_updated = NOW()
        WHERE id = $4
      `, [newConfidence, mergedEventIds, updatedReasoning.slice(0, 4000), existing.id]);

      console.log(`[DistillationWorker] Reinforced memory ${existing.id} (confidence ${existing.confidence} → ${newConfidence})`);
    }
  } else {
    // Cluster dedup: check if top 3 similar memories say essentially the same thing
    const { rows: top3 } = await pool.query(`
      SELECT id, content, cosine_similarity(embedding, $1::float8[]) AS similarity
      FROM distilled_memory
      WHERE brand_id = $2 AND memory_type = $3
        ${userClause}
        AND superseded_by IS NULL AND embedding IS NOT NULL
      ORDER BY cosine_similarity(embedding, $1::float8[]) DESC
      LIMIT 3
    `, similarParams);

    const highSimilarCount = top3.filter(r => r.similarity > 0.80).length;
    if (highSimilarCount >= 2) {
      console.log(`[DistillationWorker] Skipping duplicate insight (${highSimilarCount} similar memories exist)`);
      return; // We already know this
    }

    // Per-type cap: max 30 voice rules, 20 creative patterns, 50 total per brand
    const TYPE_CAPS = {
      BRAND_VOICE_RULE: 30, CREATIVE_PATTERN: 20,
      MARKET_INTELLIGENCE: 20, SEO_UPDATE: 20, AD_STRATEGY: 20, PLATFORM_UPDATE: 20,
    };
    const typeCap = TYPE_CAPS[insight.memory_type];
    if (typeCap) {
      const capParams = effectiveUserId != null ? [brandId, insight.memory_type, effectiveUserId] : [brandId, insight.memory_type];
      const { rows: [{ count }] } = await pool.query(`
        SELECT COUNT(*)::int AS count FROM distilled_memory
        WHERE brand_id = $1 AND memory_type = $2 AND superseded_by IS NULL
          ${userClause}
      `, capParams);

      if (count >= typeCap) {
        // Evict lowest effective_confidence entry
        await pool.query(`
          DELETE FROM distilled_memory WHERE id = (
            SELECT id FROM distilled_memory
            WHERE brand_id = $1 AND memory_type = $2 AND superseded_by IS NULL
              ${userClause}
            ORDER BY confidence * CASE WHEN last_updated IS NOT NULL
              THEN EXP(-EXTRACT(EPOCH FROM (NOW() - last_updated)) / (30 * 86400))
              ELSE 0.5 END ASC
            LIMIT 1
          )
        `, capParams);
        console.log(`[DistillationWorker] Evicted lowest-confidence ${insight.memory_type} (cap: ${typeCap})`);
      }
    }

    // Insert new
    await pool.query(`
      INSERT INTO distilled_memory (brand_id, user_id, memory_type, content, confidence, source_event_ids, reasoning, embedding, embedding_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::float8[], 'done')
    `, [brandId, effectiveUserId, insight.memory_type, insight.content, insight.confidence, sourceEventIds, insight.reasoning, embeddingStr]);

    console.log(`[DistillationWorker] New ${insight.memory_type} memory (confidence ${insight.confidence})`);
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Scheduling ──

let scheduledTimeout = null;
let scheduledInterval = null;

/**
 * Start the distillation worker. Runs daily at 3am UTC.
 */
function startDistillationWorker() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[DistillationWorker] ANTHROPIC_API_KEY not set — worker disabled');
    return;
  }

  console.log('[DistillationWorker] Starting (daily at 3am UTC)');

  const now = new Date();
  const next3am = new Date(now);
  next3am.setUTCHours(3, 0, 0, 0);
  if (next3am <= now) next3am.setDate(next3am.getDate() + 1);
  const delay = next3am - now;

  scheduledTimeout = setTimeout(() => {
    runDistillation();
    scheduledInterval = setInterval(runDistillation, 24 * 60 * 60 * 1000);
  }, delay);
}

function stopDistillationWorker() {
  if (scheduledTimeout) clearTimeout(scheduledTimeout);
  if (scheduledInterval) clearInterval(scheduledInterval);
}

module.exports = { startDistillationWorker, stopDistillationWorker, runDistillation };
