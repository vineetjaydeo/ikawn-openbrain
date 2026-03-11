const { Router } = require('express');
const { pool } = require('../db');
const { RUHI_FAVICON_LINK, RUHI_ICON_URL } = require('../utils/ruhi-assets');

const router = Router();

// Public shared conversation — no auth required
router.get('/shared/:token', async (req, res) => {
  try {
    const { rows: convRows } = await pool.query(
      'SELECT * FROM conversations WHERE share_token = $1',
      [req.params.token]
    );
    if (!convRows.length) {
      return res.status(404).send(notFoundPage());
    }

    const { rows: messages } = await pool.query(
      'SELECT role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [convRows[0].id]
    );

    const { rows: userRows } = await pool.query(
      'SELECT name, email FROM users WHERE id = $1',
      [convRows[0].user_id]
    );
    const authorName = userRows.length ? (userRows[0].name || userRows[0].email) : 'Unknown';

    res.send(sharedPage(convRows[0], messages, authorName));
  } catch (err) {
    console.error('GET /shared/:token error:', err);
    res.status(500).send('Internal server error');
  }
});

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex, nofollow">
  <title>Not Found | Ruhi by iKawn</title>
  ${RUHI_FAVICON_LINK}
  <style>
    body { background: #0A0F2E; color: #E8EAF0; font-family: 'Google Sans', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .msg { text-align: center; }
    .msg h1 { font-size: 2rem; margin-bottom: 8px; }
    .msg p { color: #9498B0; }
    .msg a { color: #FFC01C; text-decoration: none; }
  </style>
</head>
<body>
  <div class="msg">
    <h1>Conversation not found</h1>
    <p>This link may have been revoked or is invalid.</p>
    <p style="margin-top:16px"><a href="/">Go to Ruhi</a></p>
  </div>
</body>
</html>`;
}

function sharedPage(conv, messages, authorName) {
  const title = conv.title || 'Shared Conversation';
  const date = new Date(conv.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Build messages as JSON for safe client-side rendering (avoids XSS)
  const messagesJson = JSON.stringify(messages.map(m => ({
    role: m.role,
    content: m.content || '',
    time: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  })));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)} | Ruhi by iKawn</title>
  ${RUHI_FAVICON_LINK}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Noto+Serif:ital,wght@0,400;0,500;0,600;1,400&family=Parkinsans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github-dark-dimmed.min.css">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0A0F2E;
      color: #E8EAF0;
      font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
    }
    .page-header {
      border-bottom: 1px solid #1C2452;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      max-width: 900px;
      margin: 0 auto;
    }
    .page-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      width: 32px; height: 32px;
      border-radius: 10px;
      background: #FFC01C;
      display: flex; align-items: center; justify-content: center;
      padding: 4px;
    }
    .brand-icon img { width: 100%; height: 100%; object-fit: contain; }
    .page-title {
      font-family: 'Parkinsans', 'Google Sans', sans-serif;
      font-size: 1.1rem;
      font-weight: 600;
      color: #E8EAF0;
    }
    .page-date {
      font-size: 0.78rem;
      color: #5C6185;
    }
    .badge {
      font-size: 0.7rem;
      padding: 4px 10px;
      background: #1C2452;
      border: 1px solid #252D5E;
      border-radius: 100px;
      color: #9498B0;
    }
    .messages-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 24px 80px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .msg-row {
      display: flex;
      gap: 14px;
      line-height: 1.8;
    }
    .msg-row.user { justify-content: flex-end; }
    .msg-avatar {
      width: 28px; height: 28px;
      border-radius: 8px;
      background: #FFC01C;
      color: #0a0a0a;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.7rem; font-weight: 600;
      flex-shrink: 0;
      margin-top: 24px;
    }
    .msg-content { max-width: 100%; min-width: 0; }
    .msg-row.user .msg-content { max-width: 75%; }
    .msg-meta {
      font-size: 0.72rem;
      color: #5C6185;
      margin-bottom: 4px;
      padding: 0 4px;
    }
    .msg-time { margin-left: 6px; }
    .msg-bubble {
      font-size: 0.94rem;
      line-height: 1.7;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .assistant-bubble {
      padding: 4px 0;
      font-family: 'Noto Serif', Georgia, serif;
      color: #E8EAF0;
    }
    .assistant-bubble h1 { font-size: 1.25rem; font-weight: 700; margin: 1em 0 0.4em; font-family: 'Parkinsans', sans-serif; }
    .assistant-bubble h2 { font-size: 1.1rem; font-weight: 600; margin: 0.9em 0 0.35em; font-family: 'Parkinsans', sans-serif; }
    .assistant-bubble h3 { font-size: 1rem; font-weight: 600; margin: 0.8em 0 0.3em; }
    .assistant-bubble p { margin-bottom: 0.65em; }
    .assistant-bubble p:last-child { margin-bottom: 0; }
    .assistant-bubble ul, .assistant-bubble ol { padding-left: 1.4em; margin-bottom: 0.65em; }
    .assistant-bubble li { margin-bottom: 0.25em; }
    .assistant-bubble blockquote { border-left: 3px solid #FFC01C; padding-left: 14px; color: #9498B0; margin: 0.5em 0; }
    .assistant-bubble strong { color: #E8EAF0; font-weight: 600; }
    .assistant-bubble code { background: #111738; padding: 2px 6px; border-radius: 4px; font-size: 0.88em; }
    .assistant-bubble pre { background: #111738; border: 1px solid #1C2452; border-radius: 8px; padding: 14px; overflow-x: auto; margin: 0.5em 0; }
    .assistant-bubble pre code { background: none; padding: 0; }
    .user-bubble {
      padding: 12px 20px;
      background: linear-gradient(135deg, #FFC01C, #F59E0B);
      color: #0A0F2E;
      border-radius: 20px 20px 6px 20px;
      font-family: 'Google Sans', sans-serif;
      font-weight: 500;
      box-shadow: 0 2px 12px rgba(255, 192, 28, 0.15);
    }
    .footer {
      text-align: center;
      padding: 24px;
      border-top: 1px solid #1C2452;
      max-width: 900px;
      margin: 0 auto;
    }
    .footer a {
      color: #FFC01C;
      text-decoration: none;
      font-size: 0.85rem;
    }
    @media (max-width: 768px) {
      .messages-container { padding: 20px 16px 60px; }
      .msg-row.user .msg-content { max-width: 90%; }
    }
  </style>
</head>
<body>
  <div class="page-header">
    <div class="page-header-left">
      <div class="brand-icon"><img src="${RUHI_ICON_URL}" alt="Ruhi"></div>
      <div>
        <div class="page-title">${escapeHtml(title)}</div>
        <div class="page-date">${date}</div>
      </div>
    </div>
    <span class="badge">Shared conversation</span>
  </div>

  <div class="messages-container" id="messages"></div>

  <div class="footer">
    <a href="https://ikawn.com" target="_blank">Powered by Ruhi &mdash; iKawn</a>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11/highlight.min.js"></script>
  <script>
    const MESSAGES = ${messagesJson};
    const AUTHOR = ${JSON.stringify(authorName)};

    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try { return hljs.highlight(code, { language: lang }).value; } catch {}
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true,
    });

    function esc(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    const container = document.getElementById('messages');
    MESSAGES.forEach(m => {
      const row = document.createElement('div');
      row.className = 'msg-row ' + m.role;

      const contentDiv = document.createElement('div');
      contentDiv.className = 'msg-content';

      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      if (m.role === 'user') meta.style.textAlign = 'right';

      const speaker = m.role === 'assistant' ? 'Ruhi' : esc(AUTHOR);
      meta.innerHTML = speaker + ' <span class="msg-time">' + esc(m.time) + '</span>';

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble ' + (m.role === 'assistant' ? 'assistant-bubble' : 'user-bubble');

      if (m.role === 'assistant') {
        try { bubble.innerHTML = marked.parse(m.content); } catch { bubble.textContent = m.content; }
      } else {
        bubble.textContent = m.content;
      }

      contentDiv.appendChild(meta);
      contentDiv.appendChild(bubble);

      if (m.role === 'assistant') {
        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.textContent = 'R';
        row.appendChild(avatar);
      }
      row.appendChild(contentDiv);
      container.appendChild(row);
    });
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = router;
