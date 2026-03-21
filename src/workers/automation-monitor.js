'use strict';

/**
 * Automation Monitor Worker
 *
 * Polls ActivePieces flow run data every 15 minutes.
 * Stores performance metrics in flow_versions table.
 * Captures alerts to OpenBrain memory when success rates drop.
 */

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const SUCCESS_THRESHOLD = 0.85; // Alert if below 85%

const ACTIVEPIECES_URL = process.env.ACTIVEPIECES_URL;
const ACTIVEPIECES_API_KEY = process.env.ACTIVEPIECES_API_KEY;

let running = false;

async function apFetch(path) {
  if (!ACTIVEPIECES_URL || !ACTIVEPIECES_API_KEY) return null;

  const res = await fetch(`${ACTIVEPIECES_URL}${path}`, {
    headers: {
      'Authorization': `Bearer ${ACTIVEPIECES_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) return null;
  return res.json();
}

async function checkFlows(db, captureThought) {
  const flowsData = await apFetch('/api/v1/flows?limit=50');
  if (!flowsData?.data?.length) return;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  for (const flow of flowsData.data) {
    try {
      const runsData = await apFetch(`/api/v1/flow-runs?flowId=${flow.id}&limit=100&createdAfter=${since}`);
      const runs = runsData?.data || [];
      if (runs.length === 0) continue;

      const succeeded = runs.filter(r => r.status === 'SUCCEEDED').length;
      const failed = runs.filter(r => r.status === 'FAILED').length;
      const successRate = succeeded / runs.length;
      const durations = runs.filter(r => r.duration).map(r => r.duration);
      const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

      const metrics = {
        success_rate: Math.round(successRate * 100),
        avg_duration_ms: avgDuration,
        total_runs: runs.length,
        succeeded,
        failed,
        measured_at: new Date().toISOString(),
      };

      // Update latest flow version with performance data
      await db.pool.query(
        `UPDATE flow_versions SET performance = $1
         WHERE flow_id = $2 AND version = (SELECT MAX(version) FROM flow_versions WHERE flow_id = $2)`,
        [JSON.stringify(metrics), flow.id]
      );

      // Alert on low success rate
      const flowName = flow.version?.displayName || flow.id;
      if (successRate < SUCCESS_THRESHOLD && captureThought) {
        // Find most common failure
        const failureSteps = {};
        for (const run of runs.filter(r => r.status === 'FAILED')) {
          if (run.steps) {
            for (const [name, step] of Object.entries(run.steps)) {
              if (step.status === 'FAILED') {
                failureSteps[name] = (failureSteps[name] || 0) + 1;
              }
            }
          }
        }
        const topFailure = Object.entries(failureSteps).sort((a, b) => b[1] - a[1])[0];

        await captureThought({
          content: `⚠️ Automation alert: "${flowName}" success rate dropped to ${Math.round(successRate * 100)}% (${failed} failures in ${runs.length} runs, last 24h). ${topFailure ? `Most failures at step: ${topFailure[0]} (${topFailure[1]}x).` : ''} Investigate and consider updating the flow.`,
          hashtags: ['automation', 'alert', flowName.toLowerCase().replace(/\s+/g, '-')],
          access_level: 'internal',
        });

        console.log(`[automation-monitor] Alert: "${flowName}" at ${Math.round(successRate * 100)}% success rate`);
      }
    } catch (err) {
      console.error(`[automation-monitor] Error checking flow ${flow.id}:`, err.message);
    }
  }
}

function start(db, captureThought) {
  if (!ACTIVEPIECES_URL || !ACTIVEPIECES_API_KEY) {
    console.log('[automation-monitor] Skipping: ActivePieces not configured');
    return;
  }

  if (running) return;
  running = true;

  console.log('[automation-monitor] Started (interval: 15min)');

  // Initial check after 2 minutes (let AP warm up)
  setTimeout(() => {
    checkFlows(db, captureThought).catch(err => {
      console.error('[automation-monitor] Check failed:', err.message);
    });
  }, 2 * 60 * 1000);

  // Then every 15 minutes
  setInterval(() => {
    checkFlows(db, captureThought).catch(err => {
      console.error('[automation-monitor] Check failed:', err.message);
    });
  }, INTERVAL_MS);
}

function stop() {
  running = false;
}

module.exports = { start, stop, checkFlows };
