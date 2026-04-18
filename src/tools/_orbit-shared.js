// src/tools/_orbit-shared.js
// Shared helpers for orbit.tool.js and orbit-connections.tool.js.
// Filename starts with "_" and does NOT end in .tool.js so the tool loader ignores it.
'use strict';

const DEFAULT_BASE_URL = 'https://ikawn-os-staging.fly.dev';
const TIMEOUT_MS = 60000;

function baseUrl() {
  return process.env.IKAWN_OS_BASE_URL || DEFAULT_BASE_URL;
}

function apiKey() {
  return process.env.IKAWN_OS_API_KEY;
}

function missingKeyResult(toolName) {
  console.error(`[tool.${toolName}] failed source=config reason=missing_IKAWN_OS_API_KEY`);
  return {
    success: false,
    data: null,
    summary: 'Orbit integration is not connected yet. IKAWN_OS_API_KEY is missing on the server. Ask an admin to set it.',
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestWithRetry({ url, method, body, toolName }) {
  const headers = {
    'Authorization': `Bearer ${apiKey()}`,
    'X-Api-Key': apiKey(),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let attempt = 0;
  let lastErr;
  let lastStatus;

  while (attempt < 2) {
    attempt += 1;
    try {
      const res = await fetchWithTimeout(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      lastStatus = res.status;

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`[tool.${toolName}] ok status=${res.status} attempt=${attempt}`);
        return { ok: true, status: res.status, data };
      }

      // 4xx -> don't retry, surface error immediately
      if (res.status >= 400 && res.status < 500) {
        const text = await res.text().catch(() => '');
        console.error(`[tool.${toolName}] failed source=upstream_4xx status=${res.status} attempt=${attempt}`);
        return { ok: false, status: res.status, error: text || `HTTP ${res.status}`, source: 'upstream_4xx' };
      }

      // 5xx -> retry once (loop continues)
      const text = await res.text().catch(() => '');
      lastErr = text || `HTTP ${res.status}`;
      console.warn(`[tool.${toolName}] retrying source=upstream_5xx status=${res.status} attempt=${attempt}`);
    } catch (err) {
      lastErr = err.message || String(err);
      console.warn(`[tool.${toolName}] retrying source=network attempt=${attempt} err=${lastErr}`);
    }
  }

  console.error(`[tool.${toolName}] failed source=upstream_5xx_or_network status=${lastStatus || 'n/a'} err=${lastErr}`);
  return { ok: false, status: lastStatus || 0, error: lastErr || 'Unknown upstream error', source: 'upstream_5xx_or_network' };
}

module.exports = { baseUrl, apiKey, missingKeyResult, requestWithRetry };
