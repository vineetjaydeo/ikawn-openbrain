// src/tools/orbit-connections.tool.js
'use strict';

const { baseUrl, apiKey, missingKeyResult, requestWithRetry } = require('./_orbit-shared');

module.exports = {
  name: 'orbit_check_connections',
  description: 'Check which social accounts are connected and healthy for an Orbit project. Returns a per-platform status array. Call this BEFORE orbit_post if uncertain which platforms are connected, to avoid publishing failures.',
  tier: 'agent',
  parameters: {
    projectId: { type: 'string', required: true, description: 'Orbit project ID to inspect' },
  },
  async execute(config, _context) {
    if (!apiKey()) return missingKeyResult('orbit_check_connections');

    if (!config.projectId || typeof config.projectId !== 'string') {
      return { success: false, data: null, summary: 'orbit_check_connections: projectId is required' };
    }

    const url = `${baseUrl()}/api/external/orbit/connections?projectId=${encodeURIComponent(config.projectId)}`;
    const result = await requestWithRetry({
      url,
      method: 'GET',
      toolName: 'orbit_check_connections',
    });

    if (!result.ok) {
      return {
        success: false,
        data: { ok: false, error: result.error, source: result.source, status: result.status },
        summary: `Orbit connections check failed (${result.status}): ${result.error}`,
      };
    }

    const data = result.data || {};
    const connections = Array.isArray(data.connections) ? data.connections : (Array.isArray(data) ? data : []);

    const summaryLine = connections.length === 0
      ? `No social connections found for project ${config.projectId}.`
      : `Project ${config.projectId} connections: ${connections.map(c => `${c.platform || c.provider || '?'}=${c.status || (c.healthy ? 'healthy' : 'unknown')}`).join(', ')}.`;

    return {
      success: true,
      data: { ok: true, connections },
      summary: summaryLine,
    };
  },
};
