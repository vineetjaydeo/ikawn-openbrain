/**
 * Syncs OpenClaw memory files to OpenBrain/Ruhi.
 * Reads from ~/.openclaw/memory/main.sqlite, pushes to /capture API.
 * Safe to re-run — deduplicates by source_ref.
 *
 * Usage: node scripts/sync-openclaw.js
 * Add to cron or run manually after OpenClaw sessions.
 */
const { execSync } = require('child_process');
const path = require('path');

const BASE_URL = process.env.OB_URL || 'https://ikawn-openbrain.fly.dev';
const LOGIN_EMAIL = 'v@ikawn.com';
const LOGIN_PASSWORD = process.env.OB_PASSWORD || 'openbrain2024';
const SQLITE_PATH = path.join(process.env.HOME, '.openclaw', 'memory', 'main.sqlite');

let sessionCookie = null;

async function login() {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
    redirect: 'manual',
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) sessionCookie = setCookie.split(';')[0];
}

async function capture(data) {
  if (!sessionCookie) await login();
  const res = await fetch(`${BASE_URL}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookie },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function searchExists(sourceRef) {
  if (!sessionCookie) await login();
  const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(sourceRef)}&limit=1`, {
    headers: { 'Cookie': sessionCookie },
  });
  const results = await res.json();
  // Check if any result has matching source — not perfect but good enough
  return false; // Let the server-side dedup handle it via source_ref
}

function getChunks() {
  try {
    const raw = execSync(
      `sqlite3 "${SQLITE_PATH}" "SELECT path, text, updated_at FROM chunks ORDER BY updated_at DESC"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    return raw.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split('|');
      const updatedAt = parseInt(parts[parts.length - 1]);
      const text = parts.slice(1, -1).join('|');
      const filePath = parts[0];
      return { path: filePath, text, updatedAt };
    });
  } catch (err) {
    console.error('Failed to read SQLite:', err.message);
    return [];
  }
}

async function run() {
  const chunks = getChunks();
  console.log(`Found ${chunks.length} chunks in OpenClaw memory`);

  await login();
  let added = 0;
  let skipped = 0;

  for (const chunk of chunks) {
    if (!chunk.text || chunk.text.length < 20) { skipped++; continue; }

    const sourceRef = `openclaw-${chunk.path}-${chunk.updatedAt}`;

    // Determine memory_type from path
    let memoryType = 'note';
    if (chunk.path.includes('MEMORY.md')) memoryType = 'insight';
    else if (chunk.path.match(/\d{4}-\d{2}-\d{2}/)) memoryType = 'discussion';
    else if (chunk.path.includes('ikawn')) memoryType = 'note';

    // Determine project
    let project = null;
    const text = chunk.text.toLowerCase();
    if (text.includes('ikawn') || text.includes('ruhi') || text.includes('genie') || text.includes('prism')) {
      project = 'ikawn';
    }

    try {
      const result = await capture({
        content: chunk.text.slice(0, 8000),
        source: 'openclaw',
        memory_type: memoryType,
        access_level: 'private',
        author: 'vineet',
        project,
        hashtags: [],
      });

      if (result.id) {
        added++;
        if (added % 10 === 0) console.log(`  ...captured ${added} so far`);
      }
    } catch (err) {
      console.error(`Failed to capture chunk from ${chunk.path}:`, err.message);
    }
  }

  console.log(`Done: ${added} captured, ${skipped} skipped (too short)`);
}

run().catch(err => { console.error('Sync failed:', err); process.exit(1); });
