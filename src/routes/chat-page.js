const { Router } = require('express');
const { requireAuth } = require('../auth');

const router = Router();

router.get('/', requireAuth, (req, res) => {
  res.send(chatPage(req.session.user));
});

function chatPage(user) {
  const isAdmin = user.role === 'admin';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Ruhi</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github-dark-dimmed.min.css">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: #1a1a2e;
      --bg-sidebar: #16162a;
      --bg-input: #232340;
      --bg-hover: #2a2a4a;
      --bg-assistant: #1f1f3a;
      --bg-user: #3b3b6d;
      --border: #2d2d50;
      --border-light: #3a3a60;
      --text: #e8e8f0;
      --text-dim: #a0a0c0;
      --text-muted: #6a6a90;
      --accent: #8b7cf6;
      --accent-hover: #7c6ce6;
      --accent-glow: #8b7cf620;
      --accent-soft: #8b7cf615;
      --danger: #f06060;
      --success: #5cd08a;
      --warm: #f0c878;
      --sidebar-w: 260px;
      --radius: 16px;
      --radius-sm: 10px;
    }

    html, body {
      height: 100%;
      overflow: hidden;
      font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
    }

    /* ==================== LAYOUT ==================== */
    .app {
      display: flex;
      height: 100vh;
      width: 100vw;
    }

    /* ==================== SIDEBAR ==================== */
    .sidebar {
      width: var(--sidebar-w);
      min-width: var(--sidebar-w);
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      transition: transform 0.25s ease;
      z-index: 50;
    }

    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }

    .sidebar-brand-icon {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: linear-gradient(135deg, #8b7cf6, #c084fc);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      font-weight: 700;
      color: #fff;
    }

    .sidebar-brand-name {
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.01em;
    }

    .btn-new-chat {
      width: 100%;
      padding: 10px 14px;
      background: var(--accent-soft);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-sm);
      color: var(--text);
      font-size: 0.875rem;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.15s, border-color 0.15s;
    }
    .btn-new-chat:hover {
      background: var(--bg-hover);
      border-color: var(--accent);
    }
    .btn-new-chat svg { flex-shrink: 0; }

    .sidebar-conversations {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .sidebar-conversations::-webkit-scrollbar { width: 4px; }
    .sidebar-conversations::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 2px; }

    .conv-group-label {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      padding: 14px 8px 6px;
      font-weight: 600;
    }

    .conv-item {
      display: flex;
      align-items: center;
      padding: 9px 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 0.85rem;
      color: var(--text-dim);
      transition: background 0.12s, color 0.12s;
      position: relative;
    }
    .conv-item:hover { background: var(--bg-hover); color: var(--text); }
    .conv-item.active { background: var(--bg-hover); color: var(--text); }

    .conv-item-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .conv-item-actions {
      display: none;
      gap: 2px;
      margin-left: 4px;
      flex-shrink: 0;
    }
    .conv-item:hover .conv-item-actions { display: flex; }

    .conv-action-btn {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-dim);
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.12s, color 0.12s;
    }
    .conv-action-btn:hover { background: var(--border); color: var(--text); }
    .conv-action-btn.danger:hover { color: var(--danger); }

    .conv-rename-input {
      flex: 1;
      background: var(--bg-input);
      border: 1px solid var(--accent);
      border-radius: 4px;
      color: var(--text);
      padding: 2px 6px;
      font-size: 0.85rem;
      font-family: inherit;
      outline: none;
    }

    .sidebar-footer {
      padding: 14px 16px;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .sidebar-footer-user {
      font-size: 0.8rem;
      color: var(--text-dim);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sidebar-footer-links {
      display: flex;
      gap: 12px;
    }
    .sidebar-footer-links a {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.15s;
    }
    .sidebar-footer-links a:hover { color: var(--text); }

    /* ==================== MAIN ==================== */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      position: relative;
    }

    .main-header {
      display: none;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      align-items: center;
      gap: 12px;
    }

    .hamburger {
      background: none;
      border: none;
      color: var(--text);
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
    }

    /* ==================== MESSAGES ==================== */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 0;
      scroll-behavior: smooth;
    }
    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 3px; }

    .messages-inner {
      max-width: 740px;
      margin: 0 auto;
      padding: 32px 24px 130px;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    .welcome-screen {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-dim);
      gap: 12px;
      padding: 80px 20px;
    }
    .welcome-icon {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: linear-gradient(135deg, #8b7cf6, #c084fc);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.3rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
    }
    .welcome-screen h2 {
      font-size: 1.6rem;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.02em;
    }
    .welcome-screen p {
      font-size: 1rem;
      color: var(--text-muted);
      max-width: 360px;
      text-align: center;
      line-height: 1.5;
    }

    /* ---------- Message rows ---------- */
    .msg-row {
      display: flex;
      gap: 14px;
      line-height: 1.7;
    }
    .msg-row.user { justify-content: flex-end; }

    .msg-avatar {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
      margin-top: 2px;
    }
    .msg-avatar.assistant-avatar {
      background: linear-gradient(135deg, #8b7cf6, #c084fc);
      color: #fff;
    }
    .msg-avatar.user-avatar {
      background: var(--bg-user);
      color: #c0c0e8;
    }

    .msg-bubble {
      max-width: 78%;
      padding: 14px 18px;
      border-radius: var(--radius);
      font-size: 1.05rem;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .msg-row.user .msg-bubble {
      background: var(--bg-user);
      color: #e8e8f4;
      border-bottom-right-radius: 4px;
    }
    .msg-row.assistant .msg-bubble {
      background: var(--bg-assistant);
      border: 1px solid var(--border);
      border-bottom-left-radius: 4px;
    }

    /* ---------- Attachments in messages ---------- */
    .msg-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 10px;
    }
    .msg-attachments:empty { display: none; }

    .msg-attach-img {
      width: 120px;
      height: 90px;
      object-fit: cover;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .msg-attach-img:hover { opacity: 0.8; }

    .msg-attach-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 20px;
      font-size: 0.8rem;
      color: var(--text-dim);
    }
    .msg-attach-chip svg { flex-shrink: 0; }

    /* ---------- Markdown in assistant messages ---------- */
    .msg-bubble p { margin-bottom: 0.65em; }
    .msg-bubble p:last-child { margin-bottom: 0; }
    .msg-bubble ul, .msg-bubble ol { padding-left: 1.4em; margin-bottom: 0.65em; }
    .msg-bubble li { margin-bottom: 0.25em; }
    .msg-bubble blockquote { border-left: 3px solid var(--accent); padding-left: 14px; color: var(--text-dim); margin: 0.5em 0; }
    .msg-bubble strong { color: #fff; font-weight: 600; }
    .msg-bubble a { color: #a78bfa; text-decoration: none; }
    .msg-bubble a:hover { text-decoration: underline; }
    .msg-bubble code {
      background: #2a2a4a;
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 0.88em;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    }
    .msg-bubble pre {
      background: #14142a;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 16px;
      overflow-x: auto;
      margin: 0.65em 0;
      position: relative;
    }
    .msg-bubble pre code {
      background: none;
      padding: 0;
      font-size: 0.88em;
      line-height: 1.55;
    }
    .msg-bubble table {
      border-collapse: collapse;
      margin: 0.5em 0;
      width: 100%;
    }
    .msg-bubble th, .msg-bubble td {
      border: 1px solid var(--border);
      padding: 7px 12px;
      text-align: left;
      font-size: 0.9em;
    }
    .msg-bubble th { background: var(--bg-input); color: var(--text-dim); font-weight: 600; }
    .msg-bubble hr { border: none; border-top: 1px solid var(--border); margin: 1em 0; }

    /* ---------- Typing indicator ---------- */
    .typing-indicator {
      display: none;
      gap: 14px;
    }
    .typing-indicator.visible { display: flex; }
    .typing-dots {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 16px 18px;
      background: var(--bg-assistant);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      border-bottom-left-radius: 4px;
    }
    .typing-dots span {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent);
      animation: dotPulse 1.4s ease-in-out infinite;
    }
    .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes dotPulse {
      0%, 60%, 100% { opacity: 0.25; transform: scale(0.8); }
      30% { opacity: 1; transform: scale(1); }
    }

    /* ==================== INPUT AREA ==================== */
    .input-area {
      position: sticky;
      bottom: 0;
      background: linear-gradient(transparent, var(--bg) 20%);
      padding: 8px 20px 20px;
    }

    .input-area-inner {
      max-width: 740px;
      margin: 0 auto;
    }

    /* Pending attachments */
    .pending-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 4px;
    }
    .pending-attachments:empty { display: none; padding: 0; }

    .pending-attach {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .pending-attach-img {
      width: 56px;
      height: 56px;
      object-fit: cover;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
    }
    .pending-attach-doc {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 0.8rem;
      color: var(--text-dim);
    }
    .pending-attach-remove {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--danger);
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      line-height: 1;
      font-weight: 700;
    }

    /* Compose bar */
    .compose {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      background: var(--bg-input);
      border: 1px solid var(--border-light);
      border-radius: var(--radius);
      padding: 10px 14px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .compose:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    .compose-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-dim);
      cursor: pointer;
      border-radius: 8px;
      flex-shrink: 0;
      transition: background 0.12s, color 0.12s;
    }
    .compose-btn:hover { background: var(--bg-hover); color: var(--text); }

    .compose-btn.model-toggle {
      font-size: 0.7rem;
      font-weight: 600;
      font-family: inherit;
      letter-spacing: 0.02em;
      padding: 0 6px;
      width: auto;
      min-width: 36px;
    }
    .compose-btn.model-toggle.secondary-active {
      color: #c084fc;
      background: #c084fc15;
    }

    #msg-input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text);
      font-size: 1.05rem;
      font-family: inherit;
      resize: none;
      outline: none;
      max-height: 200px;
      min-height: 24px;
      line-height: 1.5;
      padding: 6px 0;
    }
    #msg-input::placeholder { color: var(--text-muted); }

    .compose-btn.send-btn {
      background: var(--accent);
      color: #fff;
      border-radius: 10px;
    }
    .compose-btn.send-btn:hover { background: var(--accent-hover); }
    .compose-btn.send-btn:disabled { opacity: 0.35; cursor: not-allowed; }

    .input-hint {
      text-align: center;
      font-size: 0.72rem;
      color: var(--text-muted);
      padding-top: 10px;
    }

    /* ==================== TOAST ==================== */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      padding: 10px 20px;
      border-radius: var(--radius-sm);
      font-size: 0.88rem;
      font-family: inherit;
      z-index: 200;
      opacity: 0;
      transition: transform 0.3s ease, opacity 0.3s ease;
      pointer-events: none;
    }
    .toast.visible { transform: translateX(-50%) translateY(0); opacity: 1; }
    .toast-error { background: var(--danger); color: #fff; }
    .toast-success { background: var(--success); color: #fff; }

    /* ==================== IMAGE LIGHTBOX ==================== */
    .lightbox {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(10,10,30,0.9);
      z-index: 300;
      align-items: center;
      justify-content: center;
      cursor: zoom-out;
    }
    .lightbox.visible { display: flex; }
    .lightbox img {
      max-width: 90vw;
      max-height: 90vh;
      border-radius: var(--radius-sm);
    }

    /* ==================== SIDEBAR OVERLAY (mobile) ==================== */
    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(10,10,30,0.6);
      z-index: 40;
    }
    .sidebar-overlay.visible { display: block; }

    /* ==================== RESPONSIVE ==================== */
    @media (max-width: 768px) {
      .sidebar {
        position: fixed;
        left: 0; top: 0; bottom: 0;
        transform: translateX(-100%);
        width: 280px;
        min-width: 280px;
      }
      .sidebar.open { transform: translateX(0); }
      .main-header { display: flex; }
      .messages-inner { padding: 20px 16px 130px; }
      .input-area { padding: 0 12px 14px; }
      .msg-bubble { max-width: 90%; }
    }
  </style>
</head>
<body>
  <div class="app">
    <!-- Sidebar overlay for mobile -->
    <div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div>

    <!-- Sidebar -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-brand">
          <div class="sidebar-brand-icon">R</div>
          <span class="sidebar-brand-name">Ruhi</span>
        </div>
        <button class="btn-new-chat" onclick="newChat()">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>
          New Chat
        </button>
      </div>
      <div class="sidebar-conversations" id="conv-list"></div>
      <div class="sidebar-footer">
        <div class="sidebar-footer-user">${user.name || user.email}</div>
        <div class="sidebar-footer-links">
          <a href="/settings">Settings</a>
          ${isAdmin ? '<a href="/admin">Admin</a>' : ''}
          <a href="#" onclick="logout(); return false;">Logout</a>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <main class="main">
      <div class="main-header" id="main-header">
        <button class="hamburger" onclick="openSidebar()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span id="header-title" style="font-size:0.95rem;color:var(--text-dim)">New Chat</span>
      </div>

      <div class="messages" id="messages">
        <div class="messages-inner" id="messages-inner">
          <div class="welcome-screen" id="welcome">
            <div class="welcome-icon">R</div>
            <h2>Hi, I'm Ruhi</h2>
            <p>Your intelligent commerce copilot. Ask me anything about your brand, business, or creative needs.</p>
          </div>
        </div>
      </div>

      <div class="input-area">
        <div class="input-area-inner">
          <div class="pending-attachments" id="pending-attachments"></div>
          <div class="compose">
            <button class="compose-btn" onclick="triggerFileUpload()" title="Attach file">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49"/></svg>
            </button>
            <textarea id="msg-input" rows="1" placeholder="Talk to Ruhi..." onkeydown="handleInputKey(event)" oninput="autoGrow(this)"></textarea>
            <button class="compose-btn model-toggle" id="model-toggle" onclick="toggleModel()" title="Toggle model"></button>
            <button class="compose-btn send-btn" id="send-btn" onclick="sendMessage()" title="Send" disabled>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
          <div class="input-hint">Enter to send, Shift+Enter for newline</div>
        </div>
      </div>
    </main>
  </div>

  <!-- File input (hidden) -->
  <input type="file" id="file-input" accept="image/*,application/pdf,text/plain,text/markdown,text/csv" multiple style="display:none" onchange="handleFileSelect(event)">

  <!-- Lightbox -->
  <div class="lightbox" id="lightbox" onclick="closeLightbox()">
    <img id="lightbox-img" src="" alt="">
  </div>

  <!-- Toast -->
  <div class="toast" id="toast"></div>

  <!-- Libraries -->
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11/highlight.min.js"></script>

  <script>
    /* ==================== STATE ==================== */
    const USER = ${JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role })};
    let conversations = [];
    let activeConvId = null;
    let pendingAttachments = []; // { type: 'image'|'document', url, filename, preview }
    let isStreaming = false;
    let useSecondaryModel = false;
    let abortController = null;

    /* ==================== INIT ==================== */
    document.addEventListener('DOMContentLoaded', () => {
      initMarked();
      updateModelToggle();
      loadConversations();

      const input = document.getElementById('msg-input');
      input.addEventListener('paste', handlePaste);
      input.addEventListener('input', () => updateSendBtn());
    });

    function initMarked() {
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
    }

    /* ==================== CONVERSATIONS ==================== */
    async function loadConversations() {
      try {
        const res = await fetch('/api/conversations');
        if (res.status === 401) { window.location.href = '/login'; return; }
        conversations = await res.json();
        renderConversationList();
      } catch (err) {
        showToast('Failed to load conversations', 'error');
      }
    }

    function renderConversationList() {
      const list = document.getElementById('conv-list');
      if (!conversations.length) {
        list.innerHTML = '<div style="padding:20px 8px;text-align:center;color:var(--text-muted);font-size:0.8rem;">No conversations yet</div>';
        return;
      }

      const now = new Date();
      const groups = { today: [], yesterday: [], week: [], month: [], older: [] };

      conversations.forEach(c => {
        const d = new Date(c.updated_at || c.created_at);
        const diff = (now - d) / (1000 * 60 * 60 * 24);
        if (diff < 1 && now.getDate() === d.getDate()) groups.today.push(c);
        else if (diff < 2) groups.yesterday.push(c);
        else if (diff < 7) groups.week.push(c);
        else if (diff < 30) groups.month.push(c);
        else groups.older.push(c);
      });

      const labels = { today: 'Today', yesterday: 'Yesterday', week: 'This Week', month: 'This Month', older: 'Older' };
      let html = '';

      for (const [key, items] of Object.entries(groups)) {
        if (!items.length) continue;
        html += '<div class="conv-group-label">' + labels[key] + '</div>';
        items.forEach(c => {
          const isActive = c.id === activeConvId;
          html += '<div class="conv-item' + (isActive ? ' active' : '') + '" data-id="' + c.id + '" onclick="loadConversation(' + c.id + ')">'
            + '<span class="conv-item-title">' + escapeHtml(c.title || 'New Chat') + '</span>'
            + '<div class="conv-item-actions">'
            + '<button class="conv-action-btn" onclick="event.stopPropagation(); startRename(' + c.id + ')" title="Rename">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>'
            + '</button>'
            + '<button class="conv-action-btn danger" onclick="event.stopPropagation(); deleteConversation(' + c.id + ')" title="Delete">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
            + '</button>'
            + '</div></div>';
        });
      }

      list.innerHTML = html;
    }

    async function newChat() {
      try {
        const res = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!res.ok) throw new Error('Failed to create conversation');
        const conv = await res.json();
        activeConvId = conv.id;
        clearMessages();
        document.getElementById('header-title').textContent = 'New Chat';
        await loadConversations();
        closeSidebar();
        document.getElementById('msg-input').focus();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function loadConversation(id) {
      if (id === activeConvId && document.querySelectorAll('.msg-row').length > 0) {
        closeSidebar();
        return;
      }
      try {
        const res = await fetch('/api/conversations/' + id);
        if (!res.ok) throw new Error('Failed to load conversation');
        const data = await res.json();
        activeConvId = id;
        renderMessages(data.messages || []);
        document.getElementById('header-title').textContent = data.title || 'New Chat';
        renderConversationList();
        closeSidebar();
        scrollToBottom();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function deleteConversation(id) {
      if (!confirm('Delete this conversation?')) return;
      try {
        await fetch('/api/conversations/' + id, { method: 'DELETE' });
        if (activeConvId === id) {
          activeConvId = null;
          clearMessages();
        }
        await loadConversations();
      } catch (err) {
        showToast('Failed to delete', 'error');
      }
    }

    function startRename(id) {
      const item = document.querySelector('.conv-item[data-id="' + id + '"]');
      if (!item) return;
      const titleEl = item.querySelector('.conv-item-title');
      const currentTitle = titleEl.textContent;
      const input = document.createElement('input');
      input.className = 'conv-rename-input';
      input.value = currentTitle;
      titleEl.replaceWith(input);
      input.focus();
      input.select();

      const finish = async () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentTitle) {
          try {
            await fetch('/api/conversations/' + id, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: newTitle })
            });
          } catch {}
        }
        await loadConversations();
        if (activeConvId === id) {
          document.getElementById('header-title').textContent = newTitle || currentTitle;
        }
      };

      input.addEventListener('blur', finish);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentTitle; input.blur(); }
      });
    }

    /* ==================== MESSAGES ==================== */
    function clearMessages() {
      document.getElementById('messages-inner').innerHTML =
        '<div class="welcome-screen" id="welcome"><div class="welcome-icon">R</div><h2>Hi, I\\u2019m Ruhi</h2><p>Your intelligent commerce copilot. Ask me anything about your brand, business, or creative needs.</p></div>';
    }

    function renderMessages(messages) {
      const container = document.getElementById('messages-inner');
      container.innerHTML = '';
      messages.forEach(m => {
        container.appendChild(createMessageElement(m.role, m.content, m.attachments));
      });
    }

    function createMessageElement(role, content, attachments) {
      const row = document.createElement('div');
      row.className = 'msg-row ' + role;

      if (role === 'assistant') {
        row.innerHTML =
          '<div class="msg-avatar assistant-avatar">R</div>'
          + '<div class="msg-bubble">'
          + renderAttachments(attachments)
          + renderContent(role, content)
          + '</div>';
      } else {
        row.innerHTML =
          '<div class="msg-bubble">'
          + renderAttachments(attachments)
          + renderContent(role, content)
          + '</div>'
          + '<div class="msg-avatar user-avatar">' + (USER.name ? USER.name[0].toUpperCase() : USER.email[0].toUpperCase()) + '</div>';
      }

      return row;
    }

    function renderContent(role, content) {
      if (!content) return '';
      if (role === 'assistant') {
        try { return marked.parse(content); } catch { return escapeHtml(content); }
      }
      return escapeHtml(content).replace(/\\n/g, '<br>');
    }

    function renderAttachments(attachments) {
      if (!attachments || !attachments.length) return '';
      let html = '<div class="msg-attachments">';
      attachments.forEach(a => {
        if (a.type === 'image') {
          html += '<img class="msg-attach-img" src="' + escapeHtml(a.url) + '" alt="attachment" onclick="openLightbox(\\'' + escapeHtml(a.url) + '\\')">';
        } else {
          html += '<span class="msg-attach-chip">'
            + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
            + escapeHtml(a.filename || 'file') + '</span>';
        }
      });
      html += '</div>';
      return html;
    }

    /* ==================== SEND MESSAGE ==================== */
    async function sendMessage() {
      const input = document.getElementById('msg-input');
      const content = input.value.trim();
      if (!content && !pendingAttachments.length) return;
      if (isStreaming) return;

      // Ensure we have a conversation
      if (!activeConvId) {
        try {
          const res = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
          if (!res.ok) throw new Error('Failed to create conversation');
          const conv = await res.json();
          activeConvId = conv.id;
          await loadConversations();
        } catch (err) {
          showToast(err.message, 'error');
          return;
        }
      }

      // Clear welcome
      const welcome = document.getElementById('welcome');
      if (welcome) welcome.remove();

      // Add user message to UI
      const attachments = pendingAttachments.map(a => ({ type: a.type, url: a.url, filename: a.filename }));
      const container = document.getElementById('messages-inner');
      container.appendChild(createMessageElement('user', content, attachments));

      // Clear input
      input.value = '';
      autoGrow(input);
      clearPendingAttachments();
      updateSendBtn();
      scrollToBottom();

      // Show typing indicator
      const typingRow = document.createElement('div');
      typingRow.className = 'typing-indicator visible';
      typingRow.id = 'typing';
      typingRow.innerHTML =
        '<div class="msg-avatar assistant-avatar">R</div>'
        + '<div class="typing-dots"><span></span><span></span><span></span></div>';
      container.appendChild(typingRow);
      scrollToBottom();

      isStreaming = true;
      updateSendBtn();

      try {
        abortController = new AbortController();
        const res = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: activeConvId,
            content,
            attachments,
            use_secondary: useSecondaryModel,
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(err.error || 'Request failed');
        }

        // Remove typing indicator and add assistant bubble
        const typing = document.getElementById('typing');
        if (typing) typing.remove();

        const assistantRow = document.createElement('div');
        assistantRow.className = 'msg-row assistant';
        assistantRow.innerHTML =
          '<div class="msg-avatar assistant-avatar">R</div>'
          + '<div class="msg-bubble" id="streaming-bubble"></div>';
        container.appendChild(assistantRow);

        const bubble = document.getElementById('streaming-bubble');
        let fullText = '';

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const evt = JSON.parse(data);
              if (evt.type === 'chunk' && evt.text) {
                fullText += evt.text;
                try { bubble.innerHTML = marked.parse(fullText); } catch { bubble.textContent = fullText; }
                bubble.querySelectorAll('pre code').forEach(el => {
                  if (!el.dataset.highlighted) { hljs.highlightElement(el); el.dataset.highlighted = 'true'; }
                });
                scrollToBottom();
              } else if (evt.type === 'title' && evt.title) {
                document.getElementById('header-title').textContent = evt.title;
                // Update sidebar
                const conv = conversations.find(c => c.id === activeConvId);
                if (conv) { conv.title = evt.title; renderConversationList(); }
              } else if (evt.type === 'error') {
                showToast(evt.error || evt.message || 'An error occurred', 'error');
              }
            } catch {}
          }
        }

        bubble.removeAttribute('id');

      } catch (err) {
        if (err.name === 'AbortError') {
          // User cancelled
        } else {
          showToast(err.message, 'error');
        }
        const typing = document.getElementById('typing');
        if (typing) typing.remove();
      } finally {
        isStreaming = false;
        abortController = null;
        updateSendBtn();
      }
    }

    /* ==================== FILE UPLOAD ==================== */
    function triggerFileUpload() {
      document.getElementById('file-input').click();
    }

    async function handleFileSelect(e) {
      const files = Array.from(e.target.files);
      for (const file of files) {
        await uploadFile(file);
      }
      e.target.value = '';
    }

    async function handlePaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) await uploadFile(file);
        }
      }
    }

    async function uploadFile(file) {
      const isImage = file.type.startsWith('image/');
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        showToast('File exceeds 10MB limit', 'error');
        return;
      }

      try {
        const base64 = await fileToBase64(file);

        const res = await fetch('/api/upload/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: base64,
            filename: file.name,
            contentType: file.type,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Upload failed');
        }

        const result = await res.json();

        const attachment = {
          type: isImage ? 'image' : 'document',
          url: result.url,
          filename: file.name,
          preview: isImage ? URL.createObjectURL(file) : null,
        };

        pendingAttachments.push(attachment);
        renderPendingAttachments();
        updateSendBtn();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function renderPendingAttachments() {
      const container = document.getElementById('pending-attachments');
      container.innerHTML = pendingAttachments.map((a, i) => {
        if (a.type === 'image') {
          return '<div class="pending-attach">'
            + '<img class="pending-attach-img" src="' + (a.preview || a.url) + '" alt="' + escapeHtml(a.filename) + '">'
            + '<button class="pending-attach-remove" onclick="removePendingAttach(' + i + ')">x</button>'
            + '</div>';
        }
        return '<div class="pending-attach">'
          + '<div class="pending-attach-doc">'
          + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
          + escapeHtml(a.filename) + '</div>'
          + '<button class="pending-attach-remove" onclick="removePendingAttach(' + i + ')">x</button>'
          + '</div>';
      }).join('');
    }

    function removePendingAttach(idx) {
      const a = pendingAttachments[idx];
      if (a && a.preview) URL.revokeObjectURL(a.preview);
      pendingAttachments.splice(idx, 1);
      renderPendingAttachments();
      updateSendBtn();
    }

    function clearPendingAttachments() {
      pendingAttachments.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); });
      pendingAttachments = [];
      renderPendingAttachments();
    }

    /* ==================== MODEL TOGGLE ==================== */
    function toggleModel() {
      useSecondaryModel = !useSecondaryModel;
      updateModelToggle();
    }

    function updateModelToggle() {
      const btn = document.getElementById('model-toggle');
      if (useSecondaryModel) {
        btn.textContent = 'PRO';
        btn.classList.add('secondary-active');
        btn.title = 'Using advanced model (click to switch)';
      } else {
        btn.textContent = 'STD';
        btn.classList.remove('secondary-active');
        btn.title = 'Using standard model (click to switch)';
      }
    }

    /* ==================== INPUT HANDLING ==================== */
    function handleInputKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }

    function autoGrow(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }

    function updateSendBtn() {
      const btn = document.getElementById('send-btn');
      const input = document.getElementById('msg-input');
      btn.disabled = isStreaming || (!input.value.trim() && !pendingAttachments.length);
    }

    /* ==================== SIDEBAR ==================== */
    function openSidebar() {
      document.getElementById('sidebar').classList.add('open');
      document.getElementById('sidebar-overlay').classList.add('visible');
    }

    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('visible');
    }

    /* ==================== LIGHTBOX ==================== */
    function openLightbox(url) {
      document.getElementById('lightbox-img').src = url;
      document.getElementById('lightbox').classList.add('visible');
    }

    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('visible');
      document.getElementById('lightbox-img').src = '';
    }

    /* ==================== AUTH ==================== */
    async function logout() {
      await fetch('/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    }

    /* ==================== UTILS ==================== */
    function scrollToBottom() {
      const el = document.getElementById('messages');
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    let toastTimer;
    function showToast(msg, type) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.className = 'toast toast-' + (type || 'error');
      clearTimeout(toastTimer);
      requestAnimationFrame(() => {
        el.classList.add('visible');
        toastTimer = setTimeout(() => el.classList.remove('visible'), 4000);
      });
    }
  </script>
</body>
</html>`;
}

module.exports = router;
