const { pool } = require('../db');
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
  const key = `openclaw/${prefix}/${Date.now()}.${ext}`;
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
  const sender = isBot ? 'Ruhi' : (msg.from?.first_name || 'Vineet');
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

  const lines = [`[Telegram Conversation] ${dateStr}`, ''];
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
  const sourceRef = `openclaw-${chatId}-${messages[0].timestamp}`;
  const existing = await pool.query('SELECT id FROM memories WHERE source_ref = $1', [sourceRef]);
  if (existing.rows.length > 0) return;

  const hashtags = await suggestHashtags(content);

  await pool.query(
    `INSERT INTO memories (content, source, memory_type, source_ref, project, author, access_level, hashtags, brand_id, embedding_status)
     VALUES ($1, 'openclaw-telegram', 'discussion', $2, $3, $4, 'private', $5, 'ikawn', 'pending')
     RETURNING id`,
    [content, sourceRef, null, 'vineet', hashtags.length > 0 ? hashtags : null]
  );

  // Log ingestion
  await pool.query(
    `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('openclaw-telegram', 'success', 1)`
  );

  console.log(`Telegram conversation flushed: ${messages.length} messages, ref=${sourceRef}`);
}

/**
 * Save a single message directly to the database as a memory.
 * No in-memory buffering — survives machine restarts on Fly.io.
 */
async function saveMessageToDB(msg, entry) {
  const sourceRef = `openclaw-msg-${msg.message_id}`;

  // Dedup by telegram message_id
  const existing = await pool.query('SELECT id FROM memories WHERE source_ref = $1', [sourceRef]);
  if (existing.rows.length > 0) return;

  const date = new Date(msg.date * 1000);
  const dateStr = date.toISOString().replace('T', ' ').slice(0, 16);

  let content = `[Telegram] ${dateStr}\n${entry.sender}: ${entry.text}`;

  for (const att of entry.attachments) {
    if (att.type === 'image') content += `\n[Image: ${att.url}]`;
    else if (att.type === 'document') {
      content += `\n[Document: ${att.filename}] ${att.url}`;
      if (att.extractedText) content += `\n[Extracted]: ${att.extractedText.slice(0, 1000)}`;
    }
    else if (att.type === 'voice') content += `\n[Voice: ${att.url}]`;
    else if (att.type === 'video') content += `\n[Video: ${att.url}]`;
  }

  const hashtags = await suggestHashtags(content);

  await pool.query(
    `INSERT INTO memories (content, source, memory_type, source_ref, project, author, access_level, hashtags, brand_id, embedding_status)
     VALUES ($1, 'openclaw-telegram', 'discussion', $2, $3, $4, 'private', $5, 'ikawn', 'pending')`,
    [content.slice(0, 8000), sourceRef, null, entry.sender.toLowerCase(), hashtags.length > 0 ? hashtags : null]
  );

  await pool.query(
    `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('openclaw-telegram', 'success', 1)`
  );

  console.log(`Telegram message saved: ${entry.sender} msg_id=${msg.message_id}`);
}

/**
 * Handle an incoming Telegram webhook update.
 */
async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg) return;

  // Process the message (download media, transcribe voice, etc.)
  const entry = await processMessage(msg);

  // Save directly to DB — no buffering
  await saveMessageToDB(msg, entry);
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
 * Handle an OpenClaw self-report (direct POST from OpenClaw).
 */
async function handleSelfReport({ content, project, hashtags }) {
  if (!content || typeof content !== 'string') {
    throw new Error('content is required');
  }

  const sourceRef = `openclaw-report-${Date.now()}`;
  const autoHashtags = hashtags || await suggestHashtags(content);

  const result = await pool.query(
    `INSERT INTO memories (content, source, memory_type, source_ref, project, author, access_level, hashtags, brand_id, embedding_status)
     VALUES ($1, 'openclaw', 'note', $2, $3, $4, 'private', $5, 'ikawn', 'pending')
     RETURNING id, content, source, created_at`,
    [content.slice(0, 8000), sourceRef, project || null, 'openclaw', Array.isArray(autoHashtags) && autoHashtags.length > 0 ? autoHashtags : null]
  );

  await pool.query(
    `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('openclaw', 'success', 1)`
  );

  return result.rows[0];
}

module.exports = { handleUpdate, registerWebhook, startFlushTimer, stopFlushTimer, handleSelfReport };
