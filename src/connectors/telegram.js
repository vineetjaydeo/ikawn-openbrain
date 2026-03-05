const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');
const { uploadToR2 } = require('../utils/storage');
const { extractText } = require('../utils/doc-parser');
const { suggestHashtags } = require('../utils/hashtags');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const CONVERSATION_GAP_MS = 30 * 60 * 1000; // 30 minutes

// In-memory conversation buffer: chatId -> { messages: [], lastMessageAt: Date }
const conversationBuffers = new Map();

// Flush interval — check every 5 minutes for stale conversations
let flushInterval = null;

/**
 * Download a file from Telegram by file_id.
 * Returns { buffer, filePath, mimeType }
 */
async function downloadTelegramFile(fileId) {
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  if (!fileData.ok || !fileData.result?.file_path) return null;

  const filePath = fileData.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
  const res = await fetch(downloadUrl);
  if (!res.ok) return null;

  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type') || 'application/octet-stream';
  return { buffer, filePath, mimeType };
}

/**
 * Upload a Telegram file to R2 and return the public URL.
 */
async function uploadTelegramFileToR2(fileId, prefix) {
  const file = await downloadTelegramFile(fileId);
  if (!file) return null;

  const ext = file.filePath.split('.').pop() || 'bin';
  const key = `maxclaw/${prefix}/${Date.now()}.${ext}`;
  const url = await uploadToR2(key, file.buffer, file.mimeType);
  return { url, buffer: file.buffer, mimeType: file.mimeType, ext };
}

/**
 * Transcribe audio via OpenAI Whisper.
 */
async function transcribeAudio(buffer, ext) {
  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const file = new File([buffer], `audio.${ext}`, { type: `audio/${ext}` });
    const result = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
    });
    return result.text;
  } catch (err) {
    console.error('Whisper transcription failed:', err.message);
    return null;
  }
}

/**
 * Process a single Telegram message into a structured entry.
 * Returns { sender, text, attachments: [{ type, url, extractedText? }] }
 */
async function processMessage(msg) {
  const isBot = msg.from?.is_bot;
  const sender = isBot ? 'MaxClaw' : (msg.from?.first_name || 'Vineet');
  const entry = { sender, text: msg.text || msg.caption || '', attachments: [], timestamp: msg.date };

  try {
    // Photos — take largest resolution
    if (msg.photo?.length > 0) {
      const largest = msg.photo[msg.photo.length - 1];
      const result = await uploadTelegramFileToR2(largest.file_id, 'images');
      if (result) entry.attachments.push({ type: 'image', url: result.url });
    }

    // Documents
    if (msg.document) {
      const result = await uploadTelegramFileToR2(msg.document.file_id, 'documents');
      if (result) {
        const attachment = { type: 'document', url: result.url, filename: msg.document.file_name || 'unknown' };
        // Try to extract text
        const text = await extractText(result.buffer, result.mimeType);
        if (text) attachment.extractedText = text.slice(0, 4000);
        entry.attachments.push(attachment);
      }
    }

    // Voice messages
    if (msg.voice) {
      const result = await uploadTelegramFileToR2(msg.voice.file_id, 'voice');
      if (result) {
        const attachment = { type: 'voice', url: result.url };
        const transcript = await transcribeAudio(result.buffer, result.ext);
        if (transcript) {
          attachment.transcript = transcript;
          entry.text = entry.text ? `${entry.text}\n[Voice]: ${transcript}` : `[Voice]: ${transcript}`;
        }
        entry.attachments.push(attachment);
      }
    }

    // Video
    if (msg.video) {
      const result = await uploadTelegramFileToR2(msg.video.file_id, 'videos');
      if (result) entry.attachments.push({ type: 'video', url: result.url });
    }

    // Stickers — skip, low value
    if (msg.sticker && !msg.text && !msg.photo && !msg.document && !msg.voice && !msg.video) {
      entry.text = `[Sticker: ${msg.sticker.emoji || '?'}]`;
    }
  } catch (err) {
    console.error('Error processing Telegram attachments:', err.message);
  }

  return entry;
}

/**
 * Flush a conversation buffer to a single memory entry.
 */
async function flushConversation(chatId) {
  const buffer = conversationBuffers.get(chatId);
  if (!buffer || buffer.messages.length === 0) return;

  const messages = buffer.messages;
  conversationBuffers.delete(chatId);

  // Build conversation content
  const firstDate = new Date(messages[0].timestamp * 1000);
  const dateStr = firstDate.toISOString().replace('T', ' ').slice(0, 16);

  const lines = [`[MaxClaw Conversation] ${dateStr}`, ''];
  const allAttachmentUrls = [];

  for (const msg of messages) {
    let line = `${msg.sender}: ${msg.text}`;

    for (const att of msg.attachments) {
      if (att.type === 'image') line += `\n  [Image: ${att.url}]`;
      else if (att.type === 'document') {
        line += `\n  [Document: ${att.filename}] ${att.url}`;
        if (att.extractedText) line += `\n  [Extracted text]: ${att.extractedText.slice(0, 1000)}`;
      }
      else if (att.type === 'voice') line += `\n  [Voice message: ${att.url}]`;
      else if (att.type === 'video') line += `\n  [Video: ${att.url}]`;
      allAttachmentUrls.push(att.url);
    }

    lines.push(line);
  }

  const content = lines.join('\n').slice(0, 8000);

  // Dedup by first message timestamp + chatId
  const sourceRef = `maxclaw-${chatId}-${messages[0].timestamp}`;
  const existing = await pool.query('SELECT id FROM memories WHERE source_ref = $1', [sourceRef]);
  if (existing.rows.length > 0) return;

  const embedding = await getEmbedding(content);
  const hashtags = await suggestHashtags(content);

  await pool.query(
    `INSERT INTO memories (content, embedding, source, memory_type, source_ref, project, author, access_level, hashtags)
     VALUES ($1, $2, 'maxclaw', 'discussion', $3, $4, $5, 'private', $6)
     RETURNING id`,
    [content, embedding, sourceRef, null, 'vineet', hashtags.length > 0 ? hashtags : null]
  );

  // Log ingestion
  await pool.query(
    `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('maxclaw', 'success', 1)`
  );

  console.log(`MaxClaw conversation flushed: ${messages.length} messages, ref=${sourceRef}`);
}

/**
 * Handle an incoming Telegram webhook update.
 */
async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const now = Date.now();

  // Check if we need to flush the previous conversation (gap > 30 min)
  const buffer = conversationBuffers.get(chatId);
  if (buffer && (now - buffer.lastMessageAt) > CONVERSATION_GAP_MS) {
    await flushConversation(chatId);
  }

  // Process the message
  const entry = await processMessage(msg);

  // Add to buffer
  if (!conversationBuffers.has(chatId)) {
    conversationBuffers.set(chatId, { messages: [], lastMessageAt: now });
  }
  const conv = conversationBuffers.get(chatId);
  conv.messages.push(entry);
  conv.lastMessageAt = now;
}

/**
 * Register the Telegram webhook.
 */
async function registerWebhook(baseUrl) {
  if (!BOT_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN not set, skipping Telegram webhook registration');
    return;
  }

  const webhookUrl = `${baseUrl}/webhooks/telegram/${BOT_TOKEN}`;
  try {
    const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'edited_message'] }),
    });
    const data = await res.json();
    if (data.ok) {
      console.log('Telegram webhook registered:', webhookUrl.replace(BOT_TOKEN, '***'));
    } else {
      console.error('Telegram webhook registration failed:', data.description);
    }
  } catch (err) {
    console.error('Telegram webhook registration error:', err.message);
  }
}

/**
 * Start periodic flush check — flushes stale conversations every 5 minutes.
 */
function startFlushTimer() {
  flushInterval = setInterval(async () => {
    const now = Date.now();
    for (const [chatId, buffer] of conversationBuffers.entries()) {
      if ((now - buffer.lastMessageAt) > CONVERSATION_GAP_MS) {
        try {
          await flushConversation(chatId);
        } catch (err) {
          console.error(`Error flushing conversation ${chatId}:`, err.message);
        }
      }
    }
  }, 5 * 60 * 1000);
}

function stopFlushTimer() {
  if (flushInterval) clearInterval(flushInterval);
}

/**
 * Handle a MaxClaw self-report (direct POST from MaxClaw).
 */
async function handleSelfReport({ content, project, hashtags }) {
  if (!content || typeof content !== 'string') {
    throw new Error('content is required');
  }

  const sourceRef = `maxclaw-report-${Date.now()}`;
  const embedding = await getEmbedding(content);
  const autoHashtags = hashtags || await suggestHashtags(content);

  const result = await pool.query(
    `INSERT INTO memories (content, embedding, source, memory_type, source_ref, project, author, access_level, hashtags)
     VALUES ($1, $2, 'maxclaw', 'note', $3, $4, $5, 'private', $6)
     RETURNING id, content, source, created_at`,
    [content.slice(0, 8000), embedding, sourceRef, project || null, 'maxclaw', Array.isArray(autoHashtags) && autoHashtags.length > 0 ? autoHashtags : null]
  );

  await pool.query(
    `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('maxclaw', 'success', 1)`
  );

  return result.rows[0];
}

module.exports = { handleUpdate, registerWebhook, startFlushTimer, stopFlushTimer, handleSelfReport };
