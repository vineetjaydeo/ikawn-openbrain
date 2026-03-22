// src/tools/automation.tool.js
'use strict';

const ACTIVEPIECES_URL = process.env.ACTIVEPIECES_URL;
const ACTIVEPIECES_API_KEY = process.env.ACTIVEPIECES_API_KEY;

async function apFetch(path, options = {}) {
  if (!ACTIVEPIECES_URL || !ACTIVEPIECES_API_KEY) {
    throw new Error('ActivePieces not configured: missing ACTIVEPIECES_URL or ACTIVEPIECES_API_KEY');
  }

  const url = `${ACTIVEPIECES_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACTIVEPIECES_API_KEY}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ActivePieces API error: ${res.status} ${text}`);
  }

  return res.json();
}

module.exports = {
  name: 'manage_automation',
  description: 'Manage ActivePieces automation flows: list, create, update, monitor, toggle, and rollback flows. Use this to orchestrate deterministic process automations.',
  tier: 'agent',
  parameters: {
    action: {
      type: 'string',
      required: true,
      description: 'Action to perform',
      enum: [
        'list_flows',
        'get_flow',
        'get_flow_runs',
        'get_run_details',
        'get_flow_metrics',
        'toggle_flow',
        'update_flow',
        'rollback_flow',
        'update_flow_config',
      ],
    },
    flow_id: { type: 'string', required: false, description: 'ActivePieces flow ID (required for most actions)' },
    flow_config: { type: 'object', required: false, description: 'For update_flow_config: the config object to set' },
    run_id: { type: 'string', required: false, description: 'Flow run ID (for get_run_details)' },
    enabled: { type: 'boolean', required: false, description: 'Enable/disable flow (for toggle_flow)' },
    status_filter: { type: 'string', required: false, description: 'Filter runs by status: SUCCEEDED, FAILED, RUNNING' },
    limit: { type: 'number', required: false, description: 'Max results to return (default 10)' },
    period: { type: 'string', required: false, description: 'Time period for metrics: 24h, 7d, 30d (default 7d)' },
    changes: { type: 'string', required: false, description: 'JSON string of flow definition changes (for update_flow)' },
    reason: { type: 'string', required: false, description: 'Reason for update/rollback' },
    version: { type: 'number', required: false, description: 'Target version number (for rollback_flow)' },
  },

  async execute(config, context) {
    if (!ACTIVEPIECES_URL || !ACTIVEPIECES_API_KEY) {
      return {
        success: false,
        data: null,
        summary: 'ActivePieces is not configured. Set ACTIVEPIECES_URL and ACTIVEPIECES_API_KEY environment variables.',
      };
    }

    const action = config.action;

    try {
      switch (action) {
        case 'list_flows': {
          const data = await apFetch('/api/v1/flows?limit=50');
          const flows = (data.data || []).map(f => ({
            id: f.id,
            name: f.version?.displayName || f.displayName || 'Unnamed',
            status: f.status,
            created: f.created,
            updated: f.updated,
          }));
          return {
            success: true,
            data: { flows, total: flows.length },
            summary: `Found ${flows.length} automation flow(s).`,
          };
        }

        case 'get_flow': {
          if (!config.flow_id) return { success: false, data: null, summary: 'flow_id is required' };
          const flow = await apFetch(`/api/v1/flows/${config.flow_id}`);
          return {
            success: true,
            data: {
              id: flow.id,
              name: flow.version?.displayName || 'Unnamed',
              status: flow.status,
              trigger: flow.version?.trigger,
              stepsCount: Object.keys(flow.version?.actions || {}).length,
            },
            summary: `Flow "${flow.version?.displayName}": ${flow.status}, ${Object.keys(flow.version?.actions || {}).length} steps.`,
          };
        }

        case 'get_flow_runs': {
          if (!config.flow_id) return { success: false, data: null, summary: 'flow_id is required' };
          const limit = config.limit || 10;
          let path = `/api/v1/flow-runs?flowId=${config.flow_id}&limit=${limit}`;
          if (config.status_filter) path += `&status=${config.status_filter}`;

          const data = await apFetch(path);
          const runs = (data.data || []).map(r => ({
            id: r.id,
            status: r.status,
            startTime: r.startTime,
            finishTime: r.finishTime,
            duration: r.duration,
            error: r.steps ? Object.values(r.steps).find(s => s.status === 'FAILED')?.errorMessage : null,
          }));
          return {
            success: true,
            data: { runs, total: data.total || runs.length },
            summary: `${runs.length} run(s) for flow ${config.flow_id}. Status breakdown: ${summarizeRunStatuses(runs)}.`,
          };
        }

        case 'get_run_details': {
          if (!config.run_id) return { success: false, data: null, summary: 'run_id is required' };
          const run = await apFetch(`/api/v1/flow-runs/${config.run_id}`);
          const steps = Object.entries(run.steps || {}).map(([name, step]) => ({
            name,
            status: step.status,
            duration: step.duration,
            error: step.errorMessage || null,
            output: step.output ? JSON.stringify(step.output).slice(0, 200) : null,
          }));
          return {
            success: true,
            data: { id: run.id, status: run.status, steps },
            summary: `Run ${run.id}: ${run.status}. ${steps.length} steps. ${steps.filter(s => s.status === 'FAILED').length} failed.`,
          };
        }

        case 'get_flow_metrics': {
          if (!config.flow_id) return { success: false, data: null, summary: 'flow_id is required' };
          const period = config.period || '7d';
          const periodMs = period === '24h' ? 86400000 : period === '7d' ? 604800000 : 2592000000;
          const since = new Date(Date.now() - periodMs).toISOString();

          // Fetch recent runs for metrics calculation
          const data = await apFetch(`/api/v1/flow-runs?flowId=${config.flow_id}&limit=100&createdAfter=${since}`);
          const runs = data.data || [];

          if (runs.length === 0) {
            return { success: true, data: { runs: 0 }, summary: `No runs in the last ${period}.` };
          }

          const succeeded = runs.filter(r => r.status === 'SUCCEEDED').length;
          const failed = runs.filter(r => r.status === 'FAILED').length;
          const successRate = Math.round((succeeded / runs.length) * 100);
          const durations = runs.filter(r => r.duration).map(r => r.duration);
          const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

          // Find most common failure step
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
          const topFailureStep = Object.entries(failureSteps).sort((a, b) => b[1] - a[1])[0];

          return {
            success: true,
            data: {
              period,
              total_runs: runs.length,
              succeeded,
              failed,
              success_rate: successRate,
              avg_duration_ms: avgDuration,
              top_failure_step: topFailureStep ? { step: topFailureStep[0], count: topFailureStep[1] } : null,
            },
            summary: `${period}: ${runs.length} runs, ${successRate}% success rate, avg ${Math.round(avgDuration / 1000)}s. ${topFailureStep ? `Most failures at: ${topFailureStep[0]} (${topFailureStep[1]}x).` : 'No failures.'}`,
          };
        }

        case 'toggle_flow': {
          if (!config.flow_id) return { success: false, data: null, summary: 'flow_id is required' };
          if (config.enabled == null) return { success: false, data: null, summary: 'enabled is required' };

          const status = config.enabled ? 'ENABLED' : 'DISABLED';
          await apFetch(`/api/v1/flows/${config.flow_id}`, {
            method: 'POST',
            body: JSON.stringify({ type: 'STATUS', request: { status } }),
          });
          return {
            success: true,
            data: { flow_id: config.flow_id, status },
            summary: `Flow ${config.flow_id} is now ${status}.`,
          };
        }

        case 'update_flow': {
          if (!config.flow_id) return { success: false, data: null, summary: 'flow_id is required' };
          if (!config.changes) return { success: false, data: null, summary: 'changes (JSON string) is required' };

          let changes;
          try {
            changes = JSON.parse(config.changes);
          } catch {
            return { success: false, data: null, summary: 'changes must be a valid JSON string' };
          }

          // 1. Snapshot current version before updating
          const current = await apFetch(`/api/v1/flows/${config.flow_id}`);
          await snapshotFlowVersion(config.flow_id, current, config.reason || 'Pre-update snapshot', context);

          // 2. Apply changes
          const updated = await apFetch(`/api/v1/flows/${config.flow_id}`, {
            method: 'POST',
            body: JSON.stringify(changes),
          });

          return {
            success: true,
            data: { flow_id: config.flow_id, updated: true },
            summary: `Flow ${config.flow_id} updated. Reason: ${config.reason || 'No reason provided'}. Previous version snapshotted.`,
          };
        }

        case 'rollback_flow': {
          if (!config.flow_id) return { success: false, data: null, summary: 'flow_id is required' };
          if (!config.version) return { success: false, data: null, summary: 'version number is required' };

          // Look up the target version from flow_versions table
          const { pool } = require('../db');
          const result = await pool.query(
            'SELECT definition FROM flow_versions WHERE flow_id = $1 AND version = $2',
            [config.flow_id, config.version]
          );

          if (!result.rows.length) {
            return { success: false, data: null, summary: `Version ${config.version} not found for flow ${config.flow_id}` };
          }

          // Snapshot current before rollback
          const current = await apFetch(`/api/v1/flows/${config.flow_id}`);
          await snapshotFlowVersion(config.flow_id, current, `Pre-rollback snapshot (rolling back to v${config.version})`, context);

          // Apply old version
          const definition = result.rows[0].definition;
          await apFetch(`/api/v1/flows/${config.flow_id}`, {
            method: 'POST',
            body: JSON.stringify(definition),
          });

          return {
            success: true,
            data: { flow_id: config.flow_id, rolled_back_to: config.version },
            summary: `Flow ${config.flow_id} rolled back to version ${config.version}. Reason: ${config.reason || 'No reason provided'}.`,
          };
        }

        case 'update_flow_config': {
          if (!config.flow_id) return { success: false, data: null, summary: 'flow_id is required' };
          if (!config.flow_config) return { success: false, data: null, summary: 'flow_config is required' };
          const { pool: dbPool } = require('../db');
          const fcResult = await dbPool.query(
            `INSERT INTO flow_configs (flow_id, config, updated_by)
             VALUES ($1, $2, 'lucy')
             ON CONFLICT (flow_id) DO UPDATE SET
               config = $2, updated_by = 'lucy', updated_at = NOW()
             RETURNING flow_id, config, updated_at`,
            [config.flow_id, JSON.stringify(config.flow_config)]
          );
          return { success: true, data: fcResult.rows[0], summary: 'Updated config for flow ' + config.flow_id };
        }

        default:
          return { success: false, data: null, summary: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { success: false, data: null, summary: `manage_automation failed: ${err.message}` };
    }
  },
};

function summarizeRunStatuses(runs) {
  const counts = {};
  for (const r of runs) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }
  return Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ');
}

/**
 * Save a flow version snapshot to the flow_versions table.
 */
async function snapshotFlowVersion(flowId, flowData, reason, context) {
  try {
    const { pool } = require('../db');

    // Get next version number
    const maxResult = await pool.query(
      'SELECT COALESCE(MAX(version), 0) as max_version FROM flow_versions WHERE flow_id = $1',
      [flowId]
    );
    const nextVersion = (maxResult.rows[0]?.max_version || 0) + 1;

    await pool.query(
      `INSERT INTO flow_versions (flow_id, version, display_name, definition, created_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        flowId,
        nextVersion,
        flowData.version?.displayName || 'Unnamed',
        JSON.stringify(flowData),
        context?.channel || 'agent',
        reason,
      ]
    );
  } catch (err) {
    console.error('[automation.tool] Failed to snapshot flow version:', err.message);
  }
}
