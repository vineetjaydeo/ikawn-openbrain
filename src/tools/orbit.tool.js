// src/tools/orbit.tool.js
'use strict';

const { baseUrl, apiKey, missingKeyResult, requestWithRetry } = require('./_orbit-shared');

module.exports = {
  name: 'orbit_post',
  description: 'Schedule or immediately publish a social media post via Orbit. Supports Instagram, LinkedIn, X, Facebook, TikTok, YouTube. Use scheduleAt (ISO 8601) for future posts; omit to publish now. Call orbit_check_connections first if uncertain which platforms are connected for the project.',
  tier: 'agent',
  parameters: {
    projectId: { type: 'string', required: true, description: 'Orbit project ID to post under' },
    platforms: {
      type: 'array',
      required: true,
      description: 'Platform slugs to publish to (e.g. ["instagram","linkedin","twitter","facebook","tiktok","youtube"])',
      items: { type: 'string' },
    },
    content: { type: 'string', required: true, description: 'Post copy (max 2200 chars)' },
    mediaUrls: {
      type: 'array',
      required: false,
      description: 'Optional media URLs to attach (images or videos)',
      items: { type: 'string' },
    },
    scheduleAt: { type: 'string', required: false, description: 'ISO 8601 timestamp for scheduled publish; omit to publish immediately' },
  },
  async execute(config, _context) {
    if (!apiKey()) return missingKeyResult('orbit_post');

    if (!config.projectId || typeof config.projectId !== 'string') {
      return { success: false, data: null, summary: 'orbit_post: projectId is required' };
    }
    if (!Array.isArray(config.platforms) || config.platforms.length === 0) {
      return { success: false, data: null, summary: 'orbit_post: platforms must be a non-empty array' };
    }
    if (!config.content || typeof config.content !== 'string') {
      return { success: false, data: null, summary: 'orbit_post: content is required' };
    }
    if (config.content.length > 2200) {
      return { success: false, data: null, summary: `orbit_post: content exceeds 2200 chars (got ${config.content.length})` };
    }

    const body = {
      projectId: config.projectId,
      platforms: config.platforms,
      content: config.content,
    };
    if (Array.isArray(config.mediaUrls) && config.mediaUrls.length > 0) body.mediaUrls = config.mediaUrls;
    if (config.scheduleAt) body.scheduleAt = config.scheduleAt;

    const result = await requestWithRetry({
      url: `${baseUrl()}/api/external/orbit/post`,
      method: 'POST',
      body,
      toolName: 'orbit_post',
    });

    if (!result.ok) {
      return {
        success: false,
        data: { ok: false, error: result.error, source: result.source, status: result.status },
        summary: `Orbit post failed (${result.status}): ${result.error}`,
      };
    }

    const data = result.data || {};
    const postId = data.postId || data.id || null;
    const status = data.status || 'queued';
    const scheduledAt = data.scheduledAt || config.scheduleAt || null;

    const human = scheduledAt
      ? `Scheduled post ${postId || ''} for ${scheduledAt} across ${config.platforms.join(', ')}.`
      : `Posted ${postId || ''} now across ${config.platforms.join(', ')}. Status: ${status}.`;

    return {
      success: true,
      data: { ok: true, postId, status, scheduledAt },
      summary: human.trim(),
    };
  },
};
