/**
 * One-time backfill script for vault_items table.
 * Populates from messages (attachments) and generations (output_urls).
 *
 * Usage: node scripts/vault-backfill.js
 * Requires DATABASE_URL env var.
 */

try { require('dotenv').config(); } catch (_) { /* dotenv not required */ }

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function normalizeFileType(mimeOrUrl) {
  if (!mimeOrUrl) return 'other';

  const mime = mimeOrUrl.toLowerCase();

  // Check MIME types first
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (mime === 'text/csv') return 'csv';
  if (mime.startsWith('image/')) return 'image';

  // Fall back to URL extension
  const extMatch = mimeOrUrl.match(/\.(\w+)(?:\?|#|$)/i);
  if (extMatch) {
    const ext = extMatch[1].toLowerCase();
    const extMap = {
      pdf: 'pdf',
      pptx: 'pptx',
      docx: 'docx',
      xlsx: 'xlsx',
      csv: 'csv',
      png: 'image',
      jpg: 'image',
      jpeg: 'image',
      gif: 'image',
      webp: 'image',
      svg: 'image',
      txt: 'text',
      md: 'text',
    };
    if (extMap[ext]) return extMap[ext];
  }

  return 'other';
}

async function backfillFromMessages() {
  let count = 0;

  const { rows: messages } = await pool.query(`
    SELECT m.id, m.conversation_id, m.attachments, m.brand_id, m.created_at, c.user_id
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.attachments IS NOT NULL
      AND m.attachments != '[]'::jsonb
      AND m.attachments != 'null'::jsonb
  `);

  for (const msg of messages) {
    const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];

    for (const att of attachments) {
      const url = att.url || att.file_url;
      if (!url) continue;

      const filename = att.filename || att.name || url.split('/').pop().split('?')[0] || 'unknown';
      const fileType = normalizeFileType(att.mime || att.content_type || url);

      try {
        await pool.query(`
          INSERT INTO vault_items (file_url, filename, file_type, source, source_ref, brand_id, user_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (file_url) WHERE deleted_at IS NULL DO NOTHING
        `, [
          url,
          filename,
          fileType,
          'message',
          'msg-' + msg.id,
          msg.brand_id,
          msg.user_id,
          msg.created_at,
        ]);
        count++;
      } catch (err) {
        console.error(`Error inserting attachment from message ${msg.id}: ${err.message}`);
      }
    }
  }

  return count;
}

async function backfillFromGenerations() {
  let count = 0;

  const { rows: generations } = await pool.query(`
    SELECT id, brand_id, agent_name, output_urls, output_metadata, created_at
    FROM generations
    WHERE output_urls IS NOT NULL
      AND array_length(output_urls, 1) > 0
  `);

  for (const gen of generations) {
    const urls = gen.output_urls || [];
    const metadata = gen.output_metadata || {};

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (!url) continue;

      const filename = url.split('/').pop().split('?')[0] || 'generated-file';
      const fileType = normalizeFileType(url);

      try {
        await pool.query(`
          INSERT INTO vault_items (file_url, filename, file_type, source, source_ref, brand_id, user_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (file_url) WHERE deleted_at IS NULL DO NOTHING
        `, [
          url,
          filename,
          fileType,
          gen.agent_name || 'generation',
          'gen-' + gen.id,
          gen.brand_id,
          null,
          gen.created_at,
        ]);
        count++;
      } catch (err) {
        console.error(`Error inserting output from generation ${gen.id}: ${err.message}`);
      }
    }
  }

  return count;
}

async function main() {
  console.log('Starting vault backfill...');

  const msgCount = await backfillFromMessages();
  console.log(`Backfilled ${msgCount} items from messages.`);

  const genCount = await backfillFromGenerations();
  console.log(`Backfilled ${genCount} items from generations.`);

  console.log(`Done. Total: ${msgCount} from messages, ${genCount} from generations.`);

  await pool.end();
}

main().catch(err => {
  console.error('Backfill failed:', err);
  pool.end();
  process.exit(1);
});
