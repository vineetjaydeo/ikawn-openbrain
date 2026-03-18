const { Router } = require('express');
const { requireAuth } = require('../auth');
const { RUHI_FAVICON_LINK, RUHI_ICON_URL } = require('../utils/ruhi-assets');
const { SPACETIME_CSS, SPACETIME_HTML, SPACETIME_JS } = require('../utils/spacetime-bg');

const router = Router();

router.get('/', requireAuth, (req, res) => {
  res.send(chatPage(req.session.user));
});

router.get('/chat/:id', requireAuth, (req, res) => {
  res.send(chatPage(req.session.user));
});

function chatPage(user) {
  const isAdmin = user.role === 'admin';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="robots" content="noindex, nofollow">
  <title>OpenBrain | Ruhi by iKawn</title>
  ${RUHI_FAVICON_LINK}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Noto+Serif:ital,wght@0,400;0,500;0,600;1,400&family=Parkinsans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github-dark-dimmed.min.css">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: rgb(5,5,5);
      --bg-sidebar: rgb(5,5,5);
      --bg-input: rgb(32,32,32);
      --bg-hover: rgb(28,28,28);
      --bg-assistant: transparent;
      --bg-user: rgba(255,255,255,0.05);
      --border: rgb(40,40,40);
      --border-light: rgb(50,50,50);
      --text: rgb(230,230,230);
      --text-dim: rgb(160,160,160);
      --text-muted: rgb(100,100,100);
      --accent: #FFC01C;
      --accent-hover: #F5B000;
      --accent-glow: rgba(255,192,28,0.15);
      --accent-soft: rgba(255,192,28,0.08);
      --danger: #ef4444;
      --success: #22c55e;
      --warm: #f0c878;
      --rail-w: 48px;
      --panel-w: 220px;
      --radius: 16px;
      --radius-sm: 12px;
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

    /* ==================== SIDEBAR RAIL (always visible) ==================== */
    .sidebar-rail {
      position: fixed;
      left: 0; top: 0; bottom: 0;
      width: var(--rail-w);
      background: var(--bg-sidebar);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 0;
      z-index: 60;
      border-right: 1px solid var(--border);
      cursor: pointer;
    }

    .rail-logo {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      margin-bottom: 20px;
      flex-shrink: 0;
      font-size: 1.1rem;
      color: rgb(5,5,5);
      font-weight: 700;
    }

    .rail-nav {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      flex: 1;
    }

    .rail-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      border-radius: 10px;
      transition: all 0.15s;
      position: relative;
    }
    .rail-btn:hover { background: var(--bg-hover); color: var(--text); }
    .rail-btn.active { background: var(--bg-hover); color: var(--text); }
    .rail-btn svg { width: 18px; height: 18px; }

    .rail-bottom {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .rail-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-dim);
      cursor: pointer;
    }

    /* ==================== SIDEBAR PANEL (overlay, toggled) ==================== */
    .sidebar-panel {
      position: fixed;
      left: var(--rail-w);
      top: 0; bottom: 0;
      width: var(--panel-w);
      background: rgb(12,12,12);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      z-index: 55;
      transform: translateX(-100%);
      opacity: 0;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
    }
    .sidebar-panel.open {
      transform: translateX(0);
      opacity: 1;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 14px 10px;
    }
    .panel-brand {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text);
      font-family: 'Parkinsans', 'Google Sans', sans-serif;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .panel-brand .sparkle { color: var(--accent); font-size: 1.1rem; }
    .panel-collapse {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      font-size: 0.8rem;
      transition: color 0.15s;
    }
    .panel-collapse:hover { color: var(--text); }

    .panel-nav {
      padding: 4px 8px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .panel-nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      color: var(--text-dim);
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      background: none;
      font-family: inherit;
      width: 100%;
      text-align: left;
      transition: all 0.15s;
    }
    .panel-nav-item:hover { background: var(--bg-hover); color: var(--text); }
    .panel-nav-item.active { background: var(--bg-hover); color: var(--text); }
    .panel-nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }

    .panel-divider {
      height: 1px;
      background: var(--border);
      margin: 4px 12px;
    }

    .panel-section-label {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      padding: 10px 14px 4px;
      font-weight: 600;
    }

    .panel-conversations {
      flex: 1;
      overflow-y: auto;
      padding: 0 6px 8px;
    }
    .panel-conversations::-webkit-scrollbar { width: 3px; }
    .panel-conversations::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

    .conv-group-label {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      padding: 10px 8px 4px;
      font-weight: 600;
    }

    .conv-item {
      display: flex;
      align-items: center;
      padding: 7px 10px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.78rem;
      color: var(--text-dim);
      transition: all 0.12s;
      position: relative;
    }
    .conv-item:hover { background: var(--bg-hover); color: var(--text); }
    .conv-item.active { background: var(--accent-soft); color: var(--text); }

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
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-muted);
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
      font-size: 0.78rem;
      font-family: inherit;
      outline: none;
    }

    .panel-footer {
      padding: 10px 14px;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .panel-footer-user {
      font-size: 0.75rem;
      color: var(--text-dim);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .panel-footer-links {
      display: flex;
      gap: 10px;
    }
    .panel-footer-links a {
      font-size: 0.72rem;
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.15s;
    }
    .panel-footer-links a:hover { color: var(--text); }

    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 50;
    }
    .sidebar-overlay.visible { display: block; }

    /* ==================== MAIN ==================== */
    .main {
      margin-left: var(--rail-w);
      width: calc(100vw - var(--rail-w));
      display: flex;
      flex-direction: column;
      min-width: 0;
      position: relative;
    }

    .main-header {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 10px 16px;
      gap: 8px;
      min-height: 44px;
    }
    .main-header-title {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.85rem;
      color: var(--text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 300px;
      pointer-events: none;
    }

    .header-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.15s;
    }
    .header-btn:hover { background: var(--bg-hover); color: var(--text); }

    /* ==================== MESSAGES ==================== */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 0;
    }
    .messages::-webkit-scrollbar { width: 5px; }
    .messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    .messages-inner {
      max-width: 768px;
      margin: 0 auto;
      padding: 24px 24px 140px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* ==================== SPACETIME BACKGROUND ==================== */
    ${SPACETIME_CSS}

    .welcome-screen {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      min-height: 60vh;
      gap: 16px;
    }
    .welcome-logo {
      font-size: 3.2rem;
      font-weight: 700;
      color: var(--text);
      font-family: 'Parkinsans', 'Google Sans', sans-serif;
      letter-spacing: -0.03em;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .welcome-logo .sparkle {
      color: var(--accent);
      font-size: 2rem;
    }
    .welcome-tagline {
      font-size: 2rem;
      color: var(--text-dim);
      z-index: 1;
      font-family: 'Noto Serif', Georgia, serif;
      font-style: italic;
      font-weight: 400;
    }

    /* ---------- Message rows ---------- */
    .msg-row {
      display: flex;
      gap: 14px;
      line-height: 1.75;
      position: relative;
    }

    .msg-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.65rem;
      font-weight: 600;
      margin-top: 2px;
    }
    .msg-avatar.assistant-avatar {
      background: var(--accent);
      color: rgb(5,5,5);
    }
    .msg-avatar.user-avatar {
      background: var(--border);
      color: var(--text-dim);
    }

    .msg-bubble {
      font-size: 0.94rem;
      line-height: 1.75;
      word-wrap: break-word;
      overflow-wrap: break-word;
      flex: 1;
      min-width: 0;
    }
    .msg-row.user .msg-bubble {
      padding: 12px 16px;
      background: var(--bg-user);
      border-radius: 14px;
      color: var(--text);
      font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .msg-row.assistant .msg-bubble {
      padding: 4px 0;
      background: transparent;
      border: none;
      font-family: 'Noto Serif', Georgia, serif;
      color: var(--text);
    }

    /* ---------- Markdown heading type scale ---------- */
    .msg-bubble h1 { font-size: 1.25rem; font-weight: 700; margin: 1em 0 0.4em; font-family: 'Parkinsans', 'Google Sans', sans-serif; color: var(--text); letter-spacing: -0.02em; }
    .msg-bubble h2 { font-size: 1.1rem; font-weight: 600; margin: 0.9em 0 0.35em; font-family: 'Parkinsans', 'Google Sans', sans-serif; color: var(--text); letter-spacing: -0.01em; }
    .msg-bubble h3 { font-size: 1rem; font-weight: 600; margin: 0.8em 0 0.3em; font-family: 'Google Sans', sans-serif; color: var(--text); }
    .msg-bubble h4, .msg-bubble h5, .msg-bubble h6 { font-size: 0.94rem; font-weight: 600; margin: 0.7em 0 0.25em; font-family: 'Google Sans', sans-serif; color: var(--text-dim); }

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
    .msg-bubble blockquote {
      border-left: 3px solid var(--accent); padding: 12px 14px; color: var(--text-dim);
      margin: 0.5em 0; background: #111; border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      position: relative;
    }
    .msg-bubble blockquote .copy-btn {
      position: absolute; top: 6px; right: 6px; opacity: 0; transition: opacity 0.15s;
    }
    .msg-bubble blockquote:hover .copy-btn { opacity: 1; }
    .msg-bubble strong { color: var(--text); font-weight: 600; }

    /* ---------- Reply button on hover ---------- */
    .msg-reply-btn {
      position: absolute;
      top: 4px;
      right: 8px;
      opacity: 0;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-muted);
      padding: 3px 8px;
      font-size: 0.7rem;
      cursor: pointer;
      transition: opacity 0.15s, background 0.15s;
      z-index: 2;
    }
    .msg-row:hover .msg-reply-btn { opacity: 1; }
    .msg-reply-btn:hover { background: var(--bg-hover); color: var(--text); }

    /* ---------- Reply preview bar ---------- */
    .reply-preview {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      margin-bottom: 8px;
      font-size: 0.85rem;
      color: var(--text-dim);
    }
    .reply-preview-bar {
      width: 3px;
      height: 20px;
      background: var(--accent);
      border-radius: 2px;
      flex-shrink: 0;
    }
    .reply-preview-text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .reply-preview-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px 6px;
      font-size: 1rem;
      line-height: 1;
    }
    .reply-preview-close:hover { color: var(--danger); }
    .msg-bubble a { color: var(--accent); text-decoration: none; }
    .msg-bubble a:hover { text-decoration: underline; }
    .msg-bubble code {
      background: rgb(30,30,30);
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 0.88em;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    }
    .msg-bubble .code-block-wrapper {
      position: relative;
      margin: 0.65em 0;
    }
    .msg-bubble pre {
      background: rgb(12,12,12);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      overflow-x: auto;
      margin: 0;
      padding: 16px;
    }
    .msg-bubble pre code {
      background: none;
      padding: 0;
      display: block;
      font-size: 0.88em;
      line-height: 1.55;
    }

    /* Copy button — pinned top-right of wrapper, sticky on scroll */
    .code-copy-btn {
      position: absolute; top: 8px; right: 8px; z-index: 2;
      position: sticky; top: 8px;
      display: inline-flex; align-items: center;
      background: rgba(30,30,30,0.9); border: 1px solid var(--border);
      color: var(--text-dim); cursor: pointer;
      padding: 5px 6px; border-radius: 4px;
      opacity: 0; transition: opacity 0.15s;
    }
    .code-block-wrapper:hover .code-copy-btn { opacity: 1; }
    .code-copy-btn:hover { color: var(--text); background: rgba(50,50,50,0.95); }
    .code-copy-btn.copied { color: #22c55e; border-color: #22c55e40; }

    /* Blockquote copy btn */
    .copy-btn {
      display: inline-flex; align-items: center; gap: 4px;
      background: rgba(30,30,30,0.9); border: 1px solid var(--border);
      color: var(--text-dim); font-size: 0.72rem; font-family: inherit;
      cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all 0.15s;
    }
    .copy-btn:hover { color: var(--text); background: rgba(50,50,50,0.95); }
    .copy-btn.copied { color: #22c55e; }
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
    .typing-content {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 0;
    }
    .typing-label {
      font-size: 0.88rem;
      color: var(--text-dim);
      font-style: italic;
    }
    .typing-dots {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .typing-dots span {
      width: 4px;
      height: 4px;
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

    /* ==================== GENERATION CARD ==================== */
    .gen-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-top: 8px;
      max-width: 520px;
    }
    .gen-card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    .gen-card-agent {
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--accent);
    }
    .gen-card-status {
      font-size: 0.75rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .gen-card-status .spinner {
      width: 12px; height: 12px;
      border: 2px solid var(--border-light);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .gen-card-prompt {
      font-size: 0.82rem;
      color: var(--text-dim);
      margin-bottom: 12px;
      font-style: italic;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .gen-card-images {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .gen-card-images.single { grid-template-columns: 1fr; }
    .gen-card-images img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .gen-card-images img:hover { opacity: 0.85; }
    .gen-card-placeholder {
      aspect-ratio: 1;
      background: var(--bg-hover);
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gen-card-placeholder .shimmer {
      width: 40px; height: 40px;
      border: 3px solid var(--border-light);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    .gen-card-error {
      color: var(--danger);
      font-size: 0.82rem;
      padding: 12px;
      text-align: center;
    }
    .gen-card-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      font-size: 0.78rem;
      color: var(--accent);
      text-decoration: none;
      transition: opacity 0.15s;
    }
    .gen-card-link:hover { opacity: 0.8; }

    /* ==================== INPUT AREA ==================== */
    .input-area {
      position: sticky;
      bottom: 0;
      background: linear-gradient(transparent, var(--bg) 20%);
      padding: 8px 20px 20px;
    }

    .input-area-inner {
      max-width: 768px;
      margin: 0 auto;
      position: relative;
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
    /* Upload loading state */
    .pending-attach.uploading { opacity: 0.5; pointer-events: none; }
    .pending-attach-loading {
      width: 56px; height: 56px;
      display: flex; align-items: center; justify-content: center;
      background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm);
    }
    .pending-attach-loading .spinner {
      width: 20px; height: 20px; border: 2px solid var(--border);
      border-top-color: var(--accent); border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Drag overlay */
    .drag-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(229,168,25,0.08);
      border: 2px dashed var(--accent);
      display: flex; align-items: center; justify-content: center;
      pointer-events: none; opacity: 0; transition: opacity 0.15s;
    }
    .drag-overlay.visible { opacity: 1; }
    .drag-overlay-label {
      font-size: 1.1rem; font-weight: 600; color: var(--accent);
      background: var(--bg-main); padding: 12px 24px; border-radius: 12px;
    }

    /* File-type doc chips (pending + message) */
    .pending-attach-doc .file-icon { flex-shrink: 0; }
    .msg-attach-chip .file-icon { flex-shrink: 0; }

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
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 10px 14px;
      transition: all 0.2s ease;
    }
    .compose:focus-within {
      border-color: rgb(70,70,70);
      box-shadow: 0 0 0 2px rgba(255,255,255,0.04);
    }

    .compose-btn {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-muted);
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
      min-width: 34px;
    }
    .compose-btn.model-toggle.secondary-active {
      color: var(--accent);
      background: var(--accent-soft);
    }

    #msg-input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text);
      font-size: 0.98rem;
      font-family: inherit;
      resize: none;
      outline: none;
      max-height: 200px;
      min-height: 24px;
      line-height: 1.5;
      padding: 5px 0;
    }
    #msg-input::placeholder { color: var(--text-muted); }

    .compose-btn.send-btn {
      background: transparent;
      color: var(--text-muted);
      border-radius: 10px;
    }
    .compose-btn.send-btn:hover { color: var(--text); background: var(--bg-hover); }
    .compose-btn.send-btn:disabled { opacity: 0.25; cursor: not-allowed; }
    .compose-btn.send-btn.has-content {
      background: var(--accent);
      color: rgb(5,5,5);
    }
    .compose-btn.send-btn.has-content:hover {
      background: var(--accent-hover);
    }

    .input-hint {
      text-align: center;
      font-size: 0.7rem;
      color: var(--text-muted);
      padding-top: 8px;
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
      background: rgba(0,0,0,0.9);
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

    /* ==================== SHARE DROPDOWN ==================== */
    .share-wrapper {
      position: relative;
      z-index: 30;
    }
    .share-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      cursor: pointer;
      padding: 5px 10px;
      font-size: 0.75rem;
      font-family: inherit;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s;
    }
    .share-btn:hover { background: var(--bg-hover); color: var(--text); }
    .share-dropdown {
      display: none;
      position: absolute;
      right: 0;
      top: calc(100% + 6px);
      background: rgb(18,18,18);
      border: 1px solid var(--border);
      border-radius: 12px;
      min-width: 220px;
      padding: 6px;
      z-index: 100;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .share-dropdown.visible { display: block; }
    .share-dropdown-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border: none;
      background: none;
      color: var(--text-dim);
      font-size: 0.8rem;
      font-family: inherit;
      cursor: pointer;
      border-radius: 8px;
      width: 100%;
      text-align: left;
      transition: background 0.12s, color 0.12s;
    }
    .share-dropdown-item:hover { background: var(--bg-hover); color: var(--text); }
    .share-dropdown-item svg { flex-shrink: 0; }
    .share-dropdown-divider {
      height: 1px;
      background: var(--border);
      margin: 4px 8px;
    }
    .share-dropdown-item.active { color: var(--accent); }
    .share-dropdown-item.danger { color: var(--danger); }
    .share-dropdown-item.danger:hover { background: rgba(239,68,68,0.1); }

    /* ==================== GALLERY PICKER ==================== */
    .gallery-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      z-index: 200;
      align-items: center;
      justify-content: center;
    }
    .gallery-overlay.visible { display: flex; }
    .gallery-modal {
      background: rgb(18,18,18);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      width: 90%;
      max-width: 640px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .gallery-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .gallery-header h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--text);
    }
    .gallery-close {
      background: none;
      border: none;
      color: var(--text-dim);
      cursor: pointer;
      font-size: 1.2rem;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .gallery-close:hover { background: var(--bg-hover); color: var(--text); }
    .gallery-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 10px;
    }
    .gallery-thumb {
      position: relative;
      aspect-ratio: 1;
      border-radius: var(--radius-sm);
      overflow: hidden;
      cursor: pointer;
      border: 2px solid transparent;
      transition: border-color 0.15s, transform 0.15s;
    }
    .gallery-thumb:hover { border-color: var(--accent); transform: scale(1.03); }
    .gallery-thumb.selected { border-color: var(--accent); }
    .gallery-thumb.selected::after {
      content: '\\2713';
      position: absolute;
      top: 4px;
      right: 4px;
      background: var(--accent);
      color: #000;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 700;
    }
    .gallery-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .gallery-tabs {
      display: flex;
      gap: 4px;
      padding: 0 16px 8px;
      border-bottom: 1px solid var(--border);
    }
    .gallery-tab {
      background: none;
      border: none;
      color: var(--text-dim);
      font-size: 0.8rem;
      padding: 6px 14px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .gallery-tab:hover { background: var(--bg-hover); color: var(--text); }
    .gallery-tab.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
    .gallery-agent-badge {
      position: absolute;
      bottom: 4px;
      left: 4px;
      background: rgba(5,5,5,0.8);
      color: var(--accent);
      font-size: 0.6rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .gallery-empty {
      text-align: center;
      color: var(--text-dim);
      padding: 40px 20px;
      font-size: 0.9rem;
    }
    .gallery-footer {
      padding: 12px 20px;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .gallery-count {
      font-size: 0.82rem;
      color: var(--text-dim);
    }
    .gallery-add-btn {
      background: var(--accent);
      color: #000;
      border: none;
      border-radius: 8px;
      padding: 8px 20px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .gallery-add-btn:hover { opacity: 0.85; }
    .gallery-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .gallery-loading {
      text-align: center;
      padding: 40px;
      color: var(--text-dim);
    }

    /* @mention autocomplete */
    .mention-dropdown {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      max-height: 220px;
      overflow-y: auto;
      background: rgb(18,18,18);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
      z-index: 100;
      display: none;
      margin-bottom: 8px;
    }
    .mention-dropdown.visible { display: block; }
    .mention-dropdown * { color: var(--text); }
    .mention-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .mention-item:hover, .mention-item.active {
      background: rgba(255, 192, 28, 0.08);
    }
    .mention-item:first-child { border-radius: 12px 12px 0 0; }
    .mention-item:last-child { border-radius: 0 0 12px 12px; }
    .mention-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      flex-shrink: 0;
    }
    .mention-avatar.agent { background: linear-gradient(135deg, var(--accent), #F59E0B); color: rgb(5,5,5); }
    .mention-avatar.person { background: var(--border); color: var(--text); }
    .mention-info { display: flex; flex-direction: column; }
    .mention-name { font-size: 0.85rem; font-weight: 600; color: var(--text); }
    .mention-role { font-size: 0.72rem; color: var(--text-dim); }

    /* Gold mention pills in messages */
    .mention-pill {
      display: inline-block;
      background: linear-gradient(135deg, rgba(255,192,28,0.2), rgba(245,158,11,0.15));
      color: var(--accent);
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 0.85em;
      font-weight: 600;
      font-family: 'Google Sans', sans-serif;
      border: 1px solid rgba(255,192,28,0.3);
    }

    /* ==================== RESPONSIVE ==================== */
    @media (max-width: 768px) {
      .sidebar-rail { width: 0; display: none; }
      .sidebar-panel { left: 0; width: 280px; }
      .main { margin-left: 0; width: 100vw; }
      .messages-inner { padding: 20px 16px 140px; }
      .input-area { padding: 0 12px 14px; }
      .mobile-hamburger { display: flex !important; }
    }
    @media (min-width: 769px) {
      .mobile-hamburger { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="app">
    <!-- Sidebar overlay -->
    <div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div>

    <!-- Icon Rail (always visible on desktop) -->
    <nav class="sidebar-rail" id="sidebar-rail" onclick="toggleSidebar()">
      <div class="rail-logo" title="Ruhi">
        \u2726
      </div>

      <div class="rail-nav">
        <button class="rail-btn active" onclick="event.stopPropagation(); goHome()" title="Chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button class="rail-btn" onclick="event.stopPropagation(); toggleSidebar()" title="History">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </button>
        ${isAdmin ? `<button class="rail-btn" onclick="event.stopPropagation(); window.location.href='/mission'" title="Mission Control">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </button>` : ''}
      </div>

      <div class="rail-bottom">
        ${isAdmin ? `<button class="rail-btn" onclick="event.stopPropagation(); window.location.href='/admin/brain-health'" title="Brain Health">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        </button>` : ''}
        <div class="rail-avatar" onclick="event.stopPropagation(); toggleSidebar()" title="${user.name || user.email}">
          ${(user.name || user.email || '?')[0].toUpperCase()}
        </div>
      </div>
    </nav>

    <!-- Expanded Sidebar Panel (toggled) -->
    <aside class="sidebar-panel" id="sidebar-panel">
      <div class="panel-header">
        <div class="panel-brand"><span class="sparkle">\u2726</span> Ruhi</div>
        <button class="panel-collapse" onclick="closeSidebar()" title="Collapse">&laquo;</button>
      </div>

      <div class="panel-nav">
        <button class="panel-nav-item active" onclick="goHome(); closeSidebar();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Chat
        </button>
        ${isAdmin ? `<button class="panel-nav-item" onclick="window.location.href='/mission'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          Mission Control
        </button>` : ''}
      </div>

      <div class="panel-divider"></div>
      <div class="panel-section-label">History</div>

      <div class="panel-conversations" id="conv-list"></div>

      <div class="panel-footer">
        <div class="panel-footer-user">${user.name || user.email}</div>
        <div class="panel-footer-links">
          <a href="/settings">Settings</a>
          ${isAdmin ? '<a href="/admin">Admin</a>' : ''}
          <a href="javascript:void(0)" onclick="logout()">Logout</a>
        </div>
        <div style="font-size: 0.6rem; color: var(--text-muted); margin-top: 2px;">v${require('../../package.json').version}</div>
      </div>
    </aside>

    <!-- Main -->
    <main class="main">
      <div class="main-header" id="main-header">
        <button class="header-btn mobile-hamburger" onclick="toggleSidebar()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span class="main-header-title" id="header-title"></span>
        <div id="share-wrapper" class="share-wrapper" style="display:none">
          <button class="share-btn" onclick="toggleShareMenu(event)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          <div class="share-dropdown" id="share-dropdown">
            <button class="share-dropdown-item" onclick="copyConversation()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy as Markdown
            </button>
            <button class="share-dropdown-item" onclick="downloadConversation()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download .md
            </button>
            <div class="share-dropdown-divider"></div>
            <button class="share-dropdown-item" id="share-link-btn" onclick="toggleShareLink()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span id="share-link-text">Create Shareable Link</span>
            </button>
          </div>
        </div>
        <button class="header-btn" onclick="newChat()" title="New Chat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <div class="messages" id="messages">
        <div class="messages-inner" id="messages-inner">
          <div class="welcome-screen" id="welcome">
            ${SPACETIME_HTML}
            <div class="welcome-logo"><span class="sparkle">\u2726</span> Ruhi</div>
            <div class="welcome-tagline" id="welcome-tagline"></div>
          </div>
        </div>
      </div>

      <div class="input-area">
        <div class="input-area-inner">
          <div id="reply-preview-container"></div>
          <div class="pending-attachments" id="pending-attachments"></div>
          <div id="mention-dropdown" class="mention-dropdown"></div>
          <div class="compose">
            <button class="compose-btn" onclick="triggerFileUpload()" title="Attach file">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49"/></svg>
            </button>
            <button class="compose-btn" onclick="openGalleryPicker()" title="Choose from gallery">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </button>
            <textarea id="msg-input" rows="1" placeholder="Talk to Ruhi..." onkeydown="handleInputKey(event)" oninput="autoGrow(this)"></textarea>
            <button class="compose-btn model-toggle" id="model-toggle" onclick="toggleModel()" title="Toggle model"></button>
            <button class="compose-btn send-btn" id="send-btn" onclick="sendMessage()" title="Send" disabled style="display:none">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            </button>
          </div>
          <div class="input-hint">Enter to send \u00b7 Shift+Enter for newline</div>
        </div>
      </div>
    </main>
  </div>

  <!-- Drag overlay -->
  <div class="drag-overlay" id="drag-overlay"><div class="drag-overlay-label">Drop files here</div></div>

  <!-- File input (hidden) -->
  <input type="file" id="file-input" accept="image/*,application/pdf,text/plain,text/markdown,text/csv" multiple style="display:none" onchange="handleFileSelect(event)">

  <!-- Gallery Picker -->
  <div class="gallery-overlay" id="gallery-overlay" onclick="if(event.target===this)closeGalleryPicker()">
    <div class="gallery-modal">
      <div class="gallery-header">
        <h3>Choose from Gallery</h3>
        <button class="gallery-close" onclick="closeGalleryPicker()">&times;</button>
      </div>
      <div class="gallery-tabs" id="gallery-tabs">
        <button class="gallery-tab active" data-source="all" onclick="filterGallery('all',this)">All</button>
        <button class="gallery-tab" data-source="generations" onclick="filterGallery('generations',this)">Generations</button>
        <button class="gallery-tab" data-source="chat" onclick="filterGallery('chat',this)">Chat</button>
      </div>
      <div class="gallery-body" id="gallery-body">
        <div class="gallery-loading">Loading images...</div>
      </div>
      <div class="gallery-footer">
        <span class="gallery-count" id="gallery-count">0 selected</span>
        <button class="gallery-add-btn" id="gallery-add-btn" disabled onclick="addGallerySelection()">Add Selected</button>
      </div>
    </div>
  </div>

  <!-- Lightbox -->
  <div class="lightbox" id="lightbox" onclick="closeLightbox()">
    <img id="lightbox-img" src="" alt="">
  </div>

  <!-- Toast -->
  <div class="toast" id="toast"></div>

  <!-- Libraries -->
  <script src="https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11/highlight.min.js"></script>

  <script>
    /* ==================== STATE ==================== */
    const USER = ${JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role })};
    let conversations = [];
    let activeConvId = null;
    let pendingAttachments = [];
    let isStreaming = false;
    let useSecondaryModel = false;
    let abortController = null;
    let sidebarOpen = false;

    /* ==================== INIT ==================== */
    document.addEventListener('DOMContentLoaded', () => {
      initMarked();
      updateModelToggle();
      initSpacetimeBg();
      setGreeting();
      loadConversations().then(() => {
        const match = window.location.pathname.match(/^\\/chat\\/([a-f0-9-]+)$/);
        if (match) loadConversation(match[1]);
      });

      window.addEventListener('popstate', () => {
        const match = window.location.pathname.match(/^\\/chat\\/([a-f0-9-]+)$/);
        if (match) loadConversation(match[1]);
        else { activeConvId = null; clearMessages(); renderConversationList(); }
      });

      const input = document.getElementById('msg-input');
      input.addEventListener('paste', handlePaste);
      input.addEventListener('input', () => updateSendBtn());
    });

    function initMarked() {
      var copyIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

      var renderer = new marked.Renderer();
      renderer.code = function(token) {
        var code = token.text || token;
        var lang = token.lang || '';
        var highlighted;
        if (lang && hljs.getLanguage(lang)) {
          try { highlighted = hljs.highlight(code, { language: lang }).value; } catch(e) { highlighted = escapeHtml(code); }
        } else {
          try { highlighted = hljs.highlightAuto(code).value; } catch(e) { highlighted = escapeHtml(code); }
        }
        var langClass = lang ? ' language-' + escapeHtml(lang) : '';
        return '<div class="code-block-wrapper">'
          + '<button class="code-copy-btn" onclick="copyCodeBlock(this)">' + copyIcon + '</button>'
          + '<pre><code class="hljs' + langClass + '" data-highlighted="true">' + highlighted + '</code></pre>'
          + '</div>';
      };
      marked.setOptions({ renderer: renderer, breaks: true, gfm: true });
    }

    function addCopyToBlockquotes(container) {
      container.querySelectorAll('blockquote').forEach(function(bq) {
        if (bq.querySelector('.copy-btn')) return;
        var btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.setAttribute('onclick', 'copyBlockquote(this)');
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'; // safe: hardcoded SVG
        bq.appendChild(btn);
      });
    }

    function copyBlockquote(btn) {
      var bq = btn.closest('blockquote');
      var text = bq.textContent.trim();
      navigator.clipboard.writeText(text).then(function() {
        btn.classList.add('copied');
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'; // safe: hardcoded SVG
        setTimeout(function() {
          btn.classList.remove('copied');
          btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'; // safe: hardcoded SVG
        }, 2000);
      });
    }

    function copyCodeBlock(btn) {
      var wrapper = btn.closest('.code-block-wrapper');
      var codeEl = wrapper.querySelector('code');
      var text = codeEl.textContent;
      var copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      var checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
      navigator.clipboard.writeText(text).then(function() {
        btn.classList.add('copied');
        btn.innerHTML = checkIcon; // safe: hardcoded SVG
        setTimeout(function() {
          btn.classList.remove('copied');
          btn.innerHTML = copyIcon; // safe: hardcoded SVG
        }, 2000);
      });
    }

    /* ==================== SPACETIME BACKGROUND ==================== */
    function initSpacetimeBg() {
      ${SPACETIME_JS}
    }

    /* ==================== GREETING ==================== */
    function setGreeting() {
      const el = document.getElementById('welcome-tagline');
      if (!el) return;
      const h = new Date().getHours();
      const day = new Date().getDay();
      const name = USER.name ? USER.name.split(' ')[0] : '';
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

      // Check recent conversation titles for context
      const recentTitles = conversations.slice(0, 5).map(c => (c.title || '').toLowerCase()).join(' ');
      const hasDesign = /design|ui|ux|layout|brand/.test(recentTitles);
      const hasCode = /code|bug|fix|deploy|api|server/.test(recentTitles);
      const hasBiz = /client|revenue|pitch|investor|pricing/.test(recentTitles);
      const hasContent = /content|post|campaign|social|copy/.test(recentTitles);

      // Contextual greetings based on recent work
      if (hasDesign && Math.random() < 0.4) {
        el.textContent = pick([
          'Ready to make something beautiful' + (name ? ', ' + name : '') + '?',
          'Back for more design work' + (name ? ', ' + name : '') + '?',
        ]);
        return;
      }
      if (hasCode && Math.random() < 0.4) {
        el.textContent = pick([
          'Let\\'s ship something' + (name ? ', ' + name : ''),
          'Ready to build' + (name ? ', ' + name : '') + '?',
        ]);
        return;
      }
      if (hasBiz && Math.random() < 0.4) {
        el.textContent = pick([
          'Let\\'s grow the business' + (name ? ', ' + name : ''),
          'Strategy time' + (name ? ', ' + name : '') + '?',
        ]);
        return;
      }
      if (hasContent && Math.random() < 0.4) {
        el.textContent = pick([
          'What are we creating today' + (name ? ', ' + name : '') + '?',
          'Content mode activated' + (name ? ', ' + name : ''),
        ]);
        return;
      }

      // Time-based greetings with variety
      let pool;
      if (h < 5) {
        pool = [
          'Burning the midnight oil' + (name ? ', ' + name : '') + '?',
          'The world is quiet. Perfect time to think.',
          'Late night, big ideas' + (name ? ', ' + name : '') + '?',
          'Can\\'t sleep, or won\\'t sleep?',
        ];
      } else if (h < 12) {
        pool = [
          'Good morning' + (name ? ', ' + name : ''),
          'Fresh day, fresh start' + (name ? ', ' + name : ''),
          'Morning' + (name ? ', ' + name : '') + '. What\\'s on your mind?',
          'Rise and create' + (name ? ', ' + name : ''),
          day === 1 ? 'Happy Monday' + (name ? ', ' + name : '') + '. Let\\'s make it count.' : null,
          day === 5 ? 'Friday morning' + (name ? ', ' + name : '') + '. Let\\'s finish strong.' : null,
        ].filter(Boolean);
      } else if (h < 17) {
        pool = [
          'Good afternoon' + (name ? ', ' + name : ''),
          'What are we working on' + (name ? ', ' + name : '') + '?',
          'Afternoon focus time' + (name ? ', ' + name : ''),
          'How can I help this afternoon?',
          'Let\\'s pick up where we left off' + (name ? ', ' + name : ''),
        ];
      } else if (h < 21) {
        pool = [
          'Good evening' + (name ? ', ' + name : ''),
          'Evening' + (name ? ', ' + name : '') + '. What\\'s next?',
          'Winding down or ramping up' + (name ? ', ' + name : '') + '?',
          'Still going strong' + (name ? ', ' + name : '') + '?',
        ];
      } else {
        pool = [
          'Working late' + (name ? ', ' + name : '') + '?',
          'Night owl mode' + (name ? ', ' + name : ''),
          'One more thing before bed?',
          'The best ideas come at night' + (name ? ', ' + name : ''),
        ];
      }

      el.textContent = pick(pool);
    }

    /* ==================== SIDEBAR ==================== */
    function toggleSidebar() {
      if (sidebarOpen) closeSidebar();
      else openSidebar();
    }

    function openSidebar() {
      sidebarOpen = true;
      document.getElementById('sidebar-panel').classList.add('open');
      document.getElementById('sidebar-overlay').classList.add('visible');
    }

    function closeSidebar() {
      sidebarOpen = false;
      document.getElementById('sidebar-panel').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('visible');
    }

    function goHome() {
      if (!activeConvId) return;
      activeConvId = null;
      clearMessages();
      history.pushState(null, '', '/');
      renderConversationList();
      closeSidebar();
    }

    /* ==================== CONVERSATIONS ==================== */
    async function loadConversations() {
      try {
        const res = await fetch('/api/conversations', { headers: { 'Accept': 'application/json' } });
        if (res.status === 401 || res.redirected) { window.location.href = '/login'; return; }
        conversations = await res.json();
        renderConversationList();
      } catch (err) {
        showToast('Failed to load conversations', 'error');
      }
    }

    function renderConversationList() {
      const list = document.getElementById('conv-list');
      if (!conversations.length) {
        list.textContent = '';
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:16px 8px;text-align:center;color:var(--text-muted);font-size:0.75rem;';
        empty.textContent = 'No conversations yet';
        list.appendChild(empty);
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

      // Build DOM safely without innerHTML
      const frag = document.createDocumentFragment();
      for (const [key, items] of Object.entries(groups)) {
        if (!items.length) continue;
        const groupLabel = document.createElement('div');
        groupLabel.className = 'conv-group-label';
        groupLabel.textContent = labels[key];
        frag.appendChild(groupLabel);

        items.forEach(c => {
          const isActive = c.id === activeConvId;
          const item = document.createElement('div');
          item.className = 'conv-item' + (isActive ? ' active' : '');
          item.dataset.id = c.id;
          item.addEventListener('click', () => loadConversation(c.id));

          const title = document.createElement('span');
          title.className = 'conv-item-title';
          title.textContent = c.title || 'New Chat';
          item.appendChild(title);

          const actions = document.createElement('div');
          actions.className = 'conv-item-actions';

          const renameBtn = document.createElement('button');
          renameBtn.className = 'conv-action-btn';
          renameBtn.title = 'Rename';
          renameBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
          renameBtn.addEventListener('click', (e) => { e.stopPropagation(); startRename(c.id); });
          actions.appendChild(renameBtn);

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'conv-action-btn danger';
          deleteBtn.title = 'Delete';
          deleteBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
          deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteConversation(c.id); });
          actions.appendChild(deleteBtn);

          item.appendChild(actions);
          frag.appendChild(item);
        });
      }

      list.textContent = '';
      list.appendChild(frag);
    }

    async function newChat() {
      try {
        const res = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!res.ok) throw new Error('Failed to create conversation');
        const conv = await res.json();
        activeConvId = conv.id;
        currentShareToken = null;
        clearMessages();
        document.getElementById('header-title').textContent = 'New Chat';
        history.pushState(null, '', '/chat/' + conv.id);
        await loadConversations();
        updateShareUI();
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
        currentShareToken = data.share_token || null;
        renderMessages(data.messages || []);
        document.getElementById('header-title').textContent = data.title || 'New Chat';
        if (window.location.pathname !== '/chat/' + id) {
          history.pushState(null, '', '/chat/' + id);
        }
        renderConversationList();
        updateShareUI();
        closeSidebar();
        scrollToBottom(true);
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
          history.pushState(null, '', '/');
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
      const container = document.getElementById('messages-inner');
      container.textContent = '';
      const welcome = document.createElement('div');
      welcome.className = 'welcome-screen';
      welcome.id = 'welcome';
      const stars = document.createElement('canvas');
      stars.className = 'spacetime-canvas';
      stars.id = 'spacetime-gl';
      const logo = document.createElement('div');
      logo.className = 'welcome-logo';
      const sparkle = document.createElement('span');
      sparkle.className = 'sparkle';
      sparkle.textContent = '\\u2726';
      logo.appendChild(sparkle);
      logo.appendChild(document.createTextNode(' Ruhi'));
      const tagline = document.createElement('div');
      tagline.className = 'welcome-tagline';
      tagline.id = 'welcome-tagline';
      welcome.appendChild(stars);
      welcome.appendChild(logo);
      welcome.appendChild(tagline);
      container.appendChild(welcome);
      initSpacetimeBg();
      setGreeting();
      currentShareToken = null;
      updateShareUI();
    }

    function renderMessages(messages) {
      const container = document.getElementById('messages-inner');
      container.textContent = '';
      messages.forEach(m => {
        container.appendChild(createMessageElement(m.role, m.content, m.attachments));
      });
    }

    let replyToContent = null;
    let replyToRole = null;

    function setReplyTo(role, content) {
      replyToContent = content;
      replyToRole = role;
      const container = document.getElementById('reply-preview-container');
      const sender = role === 'assistant' ? 'Ruhi' : 'You';
      const preview = content.replace(/<[^>]*>/g, '').slice(0, 120);

      container.textContent = '';
      const div = document.createElement('div');
      div.className = 'reply-preview';
      const bar = document.createElement('div');
      bar.className = 'reply-preview-bar';
      const textEl = document.createElement('div');
      textEl.className = 'reply-preview-text';
      const strong = document.createElement('strong');
      strong.textContent = sender + ':';
      textEl.appendChild(strong);
      textEl.appendChild(document.createTextNode(' ' + preview));
      const closeBtn = document.createElement('button');
      closeBtn.className = 'reply-preview-close';
      closeBtn.textContent = '\\u00d7';
      closeBtn.addEventListener('click', clearReplyTo);
      div.appendChild(bar);
      div.appendChild(textEl);
      div.appendChild(closeBtn);
      container.appendChild(div);

      document.getElementById('msg-input').focus();
    }

    function clearReplyTo() {
      replyToContent = null;
      replyToRole = null;
      document.getElementById('reply-preview-container').textContent = '';
    }

    function createMessageElement(role, content, attachments) {
      const row = document.createElement('div');
      row.className = 'msg-row ' + role;

      const avatarChar = role === 'assistant' ? 'R' : (USER.name ? USER.name[0].toUpperCase() : USER.email[0].toUpperCase());
      const avatarClass = role === 'assistant' ? 'assistant-avatar' : 'user-avatar';

      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar ' + avatarClass;
      avatar.textContent = avatarChar;

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.innerHTML = renderAttachments(attachments) + renderContent(role, content);
      addCopyToBlockquotes(bubble);

      const replyBtn = document.createElement('button');
      replyBtn.className = 'msg-reply-btn';
      replyBtn.textContent = 'Reply';
      replyBtn.dataset.role = role;
      replyBtn.addEventListener('click', function() {
        setReplyTo(role, bubble.textContent);
      });

      row.appendChild(avatar);
      row.appendChild(bubble);
      row.appendChild(replyBtn);
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
            + '<span class="file-icon">' + getFileIcon(a.filename || 'file') + '</span>'
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

      if (!activeConvId) {
        try {
          const res = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
          if (!res.ok) throw new Error('Failed to create conversation');
          const conv = await res.json();
          activeConvId = conv.id;
          history.pushState(null, '', '/chat/' + conv.id);
          await loadConversations();
        } catch (err) {
          showToast(err.message, 'error');
          return;
        }
      }

      const welcome = document.getElementById('welcome');
      if (welcome) welcome.remove();

      const attachments = pendingAttachments.map(a => ({ type: a.type, url: a.url, filename: a.filename, name: a.name, extracted_text: a.extracted_text || undefined }));
      const container = document.getElementById('messages-inner');
      container.appendChild(createMessageElement('user', content, attachments));

      input.value = '';
      autoGrow(input);
      clearPendingAttachments();
      clearReplyTo();
      updateSendBtn();
      scrollToBottom(true);

      var mentionMatch = content.match(/@(\\w+)/);
      var mentionAgent = mentionMatch ? mentionList.find(function(m) { return m.slug.toLowerCase() === mentionMatch[1].toLowerCase() && m.type === 'agent'; }) : null;
      var typingAvatar = mentionAgent ? mentionAgent.name[0].toUpperCase() : 'R';
      var typingLabel = mentionAgent ? mentionAgent.name + ' is thinking' : 'Thinking';
      if (mentionAgent) window._currentAgentIdentity = { slug: mentionAgent.slug, name: mentionAgent.name, role: mentionAgent.role };

      const typingRow = document.createElement('div');
      typingRow.className = 'typing-indicator visible';
      typingRow.id = 'typing';
      const typingAv = document.createElement('div');
      typingAv.className = 'msg-avatar assistant-avatar';
      typingAv.textContent = typingAvatar;
      const typingContent = document.createElement('div');
      typingContent.className = 'typing-content';
      const typingLabelEl = document.createElement('span');
      typingLabelEl.className = 'typing-label';
      typingLabelEl.textContent = typingLabel;
      const typingDots = document.createElement('div');
      typingDots.className = 'typing-dots';
      typingDots.appendChild(document.createElement('span'));
      typingDots.appendChild(document.createElement('span'));
      typingDots.appendChild(document.createElement('span'));
      typingContent.appendChild(typingLabelEl);
      typingContent.appendChild(typingDots);
      typingRow.appendChild(typingAv);
      typingRow.appendChild(typingContent);
      container.appendChild(typingRow);
      scrollToBottom(true);

      isStreaming = true;
      updateSendBtn();

      await new Promise(r => setTimeout(r, 350));

      try {
        abortController = new AbortController();
        const res = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: activeConvId,
            content: replyToContent
              ? '[Replying to ' + (replyToRole === 'assistant' ? 'Ruhi' : 'my previous message') + ': "' + replyToContent.slice(0, 200) + '"]\\n\\n' + content
              : content,
            attachments,
            use_secondary: useSecondaryModel,
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(err.error || 'Request failed');
        }

        let assistantRow = null;
        let bubble = null;
        let fullText = '';
        let firstChunk = true;

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
              if (evt.type === 'agent_identity') {
                const typing = document.getElementById('typing');
                if (typing) {
                  const av = typing.querySelector('.assistant-avatar');
                  if (av) av.textContent = evt.name[0].toUpperCase();
                  const label = typing.querySelector('.typing-label');
                  if (label) label.textContent = evt.name + ' is thinking';
                }
                window._currentAgentIdentity = evt;
              } else if (evt.type === 'chunk' && evt.text) {
                if (firstChunk) {
                  firstChunk = false;
                  const typing = document.getElementById('typing');
                  if (typing) typing.remove();
                  assistantRow = document.createElement('div');
                  assistantRow.className = 'msg-row assistant';
                  const agentId = window._currentAgentIdentity;
                  const avatarChar = agentId ? agentId.name[0].toUpperCase() : 'R';
                  const avatarEl = document.createElement('div');
                  avatarEl.className = 'msg-avatar assistant-avatar';
                  avatarEl.textContent = avatarChar;
                  if (agentId) avatarEl.title = agentId.name + ' (' + agentId.role + ')';
                  const bubbleEl = document.createElement('div');
                  bubbleEl.className = 'msg-bubble';
                  bubbleEl.id = 'streaming-bubble';
                  assistantRow.appendChild(avatarEl);
                  assistantRow.appendChild(bubbleEl);
                  container.appendChild(assistantRow);
                  bubble = document.getElementById('streaming-bubble');
                  window._currentAgentIdentity = null;
                }
                fullText += evt.text;
                try { bubble.innerHTML = marked.parse(fullText); } catch { bubble.textContent = fullText; }
                scrollToBottom(false);
              } else if (evt.type === 'title' && evt.title) {
                document.getElementById('header-title').textContent = evt.title;
                const conv = conversations.find(c => c.id === activeConvId);
                if (conv) { conv.title = evt.title; renderConversationList(); }
              } else if (evt.type === 'generation_started') {
                showGenerationCard(evt.generationId, evt.agent, evt.prompt, evt.batchSize);
              } else if (evt.type === 'error') {
                showToast(evt.error || evt.message || 'An error occurred', 'error');
              }
            } catch {}
          }
        }

        if (bubble) {
          if (typeof renderMentionPills === 'function') bubble.innerHTML = renderMentionPills(bubble.innerHTML);
          addCopyToBlockquotes(bubble);
          bubble.removeAttribute('id');
        }
        if (firstChunk) { const typing = document.getElementById('typing'); if (typing) typing.remove(); }

      } catch (err) {
        if (err.name === 'AbortError') {} else { showToast(err.message, 'error'); }
        const typing = document.getElementById('typing');
        if (typing) typing.remove();
      } finally {
        isStreaming = false;
        abortController = null;
        updateSendBtn();
      }
    }

    /* ==================== GENERATION CARD ==================== */
    function showGenerationCard(generationId, agent, prompt, batchSize) {
      const container = document.getElementById('messages-inner');
      if (!container) return;

      const cardId = 'gen-' + generationId;
      const card = document.createElement('div');
      card.className = 'msg-row assistant';

      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar assistant-avatar';
      avatar.textContent = 'R';

      const genCard = document.createElement('div');
      genCard.className = 'gen-card';
      genCard.id = cardId;

      const header = document.createElement('div');
      header.className = 'gen-card-header';
      const agentLabel = document.createElement('span');
      agentLabel.className = 'gen-card-agent';
      agentLabel.textContent = (agent || 'genie').toUpperCase();
      const statusLabel = document.createElement('span');
      statusLabel.className = 'gen-card-status';
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      statusLabel.appendChild(spinner);
      statusLabel.appendChild(document.createTextNode(' Generating...'));
      header.appendChild(agentLabel);
      header.appendChild(statusLabel);

      const promptEl = document.createElement('div');
      promptEl.className = 'gen-card-prompt';
      promptEl.textContent = prompt || '';

      const imagesEl = document.createElement('div');
      imagesEl.className = 'gen-card-images';
      const count = batchSize || 4;
      for (let i = 0; i < count; i++) {
        const ph = document.createElement('div');
        ph.className = 'gen-card-placeholder';
        const shim = document.createElement('div');
        shim.className = 'shimmer';
        ph.appendChild(shim);
        imagesEl.appendChild(ph);
      }

      genCard.appendChild(header);
      genCard.appendChild(promptEl);
      genCard.appendChild(imagesEl);
      card.appendChild(avatar);
      card.appendChild(genCard);
      container.appendChild(card);
      scrollToBottom(false);
      pollGeneration(generationId, cardId);
    }

    async function pollGeneration(generationId, cardId) {
      const maxAttempts = 60;
      let attempts = 0;

      const poll = async () => {
        attempts++;
        if (attempts > maxAttempts) {
          updateGenCard(cardId, 'error', null, 'Generation timed out');
          return;
        }

        try {
          const res = await fetch('/api/actions/status/' + generationId);
          if (!res.ok) {
            if (attempts > 5) { updateGenCard(cardId, 'error', null, 'Failed to check status'); return; }
            setTimeout(poll, 3000);
            return;
          }

          const data = await res.json();
          const imageUrls = data.resultUrls || data.urls || [];
          if ((data.status === 'complete' || data.status === 'completed') && imageUrls.length > 0) {
            updateGenCard(cardId, 'completed', imageUrls, null, generationId);
          } else if (data.status === 'failed' || data.status === 'error') {
            updateGenCard(cardId, 'error', null, data.error || 'Generation failed');
          } else {
            setTimeout(poll, 2000);
          }
        } catch (err) {
          if (attempts > 5) { updateGenCard(cardId, 'error', null, 'Connection lost'); return; }
          setTimeout(poll, 3000);
        }
      };

      setTimeout(poll, 3000);
    }

    function updateGenCard(cardId, status, urls, errorMsg, generationId) {
      const card = document.getElementById(cardId);
      if (!card) return;

      const statusEl = card.querySelector('.gen-card-status');
      const imagesEl = card.querySelector('.gen-card-images');

      if (status === 'completed' && urls) {
        while (statusEl.firstChild) statusEl.removeChild(statusEl.firstChild);
        statusEl.appendChild(document.createTextNode('\\u2713 Complete'));
        statusEl.style.color = 'var(--success)';

        if (urls.length === 1) imagesEl.classList.add('single');
        while (imagesEl.firstChild) imagesEl.removeChild(imagesEl.firstChild);
        urls.forEach(url => {
          const img = document.createElement('img');
          img.src = url;
          img.alt = 'Generated image';
          img.loading = 'lazy';
          img.addEventListener('click', () => window.open(url, '_blank'));
          imagesEl.appendChild(img);
        });

        if (generationId) {
          const link = document.createElement('a');
          link.className = 'gen-card-link';
          link.href = 'https://os.ikawn.com/genie/' + generationId;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = 'View on iKawn OS \\u2192';
          card.appendChild(link);
        }
        scrollToBottom(false);
      } else if (status === 'error') {
        while (statusEl.firstChild) statusEl.removeChild(statusEl.firstChild);
        statusEl.appendChild(document.createTextNode('\\u2715 Failed'));
        statusEl.style.color = 'var(--danger)';
        while (imagesEl.firstChild) imagesEl.removeChild(imagesEl.firstChild);
        const errDiv = document.createElement('div');
        errDiv.className = 'gen-card-error';
        errDiv.textContent = errorMsg || 'Unknown error';
        imagesEl.appendChild(errDiv);
      }
    }

    /* ==================== FILE UPLOAD ==================== */
    function triggerFileUpload() {
      document.getElementById('file-input').click();
    }

    async function handleFileSelect(e) {
      const files = Array.from(e.target.files);
      for (const file of files) await uploadFile(file);
      e.target.value = '';
    }

    async function handlePaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file') {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) await uploadFile(file);
        }
      }
    }

    (function initDragDrop() {
      var dragCounter = 0;
      var overlay = document.getElementById('drag-overlay');
      document.body.addEventListener('dragenter', function(e) {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) overlay.classList.add('visible');
      });
      document.body.addEventListener('dragleave', function(e) {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) { dragCounter = 0; overlay.classList.remove('visible'); }
      });
      document.body.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      document.body.addEventListener('drop', async function(e) {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.remove('visible');
        var files = Array.from(e.dataTransfer.files);
        for (var f of files) await uploadFile(f);
      });
    })();

    async function uploadFile(file) {
      const isImage = file.type.startsWith('image/');
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) { showToast('File exceeds 10MB limit', 'error'); return; }

      // Add placeholder immediately for visual feedback
      const placeholderIdx = pendingAttachments.length;
      pendingAttachments.push({
        type: isImage ? 'image' : 'document',
        url: null,
        name: file.name,
        filename: file.name,
        preview: isImage ? URL.createObjectURL(file) : null,
        uploading: true,
      });
      renderPendingAttachments();

      try {
        const base64 = await fileToBase64(file);
        var ct = file.type;
        if (!ct || ct === 'application/octet-stream') {
          var ext = file.name.split('.').pop().toLowerCase();
          var mimeMap = { md: 'text/markdown', txt: 'text/plain', csv: 'text/csv', json: 'application/json', pdf: 'application/pdf' };
          ct = mimeMap[ext] || 'application/octet-stream';
        }

        const res = await fetch('/api/upload/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: base64, filename: file.name, contentType: ct }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Upload failed');
        }

        const result = await res.json();
        pendingAttachments[placeholderIdx] = {
          type: isImage ? 'image' : 'document',
          url: result.url,
          name: file.name,
          filename: file.name,
          preview: isImage ? URL.createObjectURL(file) : null,
          extracted_text: result.extracted_text || null,
          uploading: false,
        };
        renderPendingAttachments();
        updateSendBtn();
      } catch (err) {
        // Remove the placeholder on failure
        pendingAttachments.splice(placeholderIdx, 1);
        renderPendingAttachments();
        showToast(err.message, 'error');
      }
    }

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function getFileIcon(filename) {
      var ext = (filename || '').split('.').pop().toLowerCase();
      var svgBase = 'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2"';
      var filePath = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>';
      var icons = {
        pdf:  '<svg ' + svgBase + ' stroke="#ef4444">' + filePath + '<path d="M9 15h2m-2-3h4"/></svg>',
        csv:  '<svg ' + svgBase + ' stroke="#22c55e">' + filePath + '<line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',
        md:   '<svg ' + svgBase + ' stroke="#a78bfa">' + filePath + '</svg>',
        txt:  '<svg ' + svgBase + ' stroke="#94a3b8">' + filePath + '<line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>',
        json: '<svg ' + svgBase + ' stroke="#f59e0b">' + filePath + '</svg>',
      };
      return icons[ext] || '<svg ' + svgBase + ' stroke="currentColor">' + filePath + '</svg>';
    }

    function renderPendingAttachments() {
      var container = document.getElementById('pending-attachments');
      container.textContent = '';
      pendingAttachments.forEach(function(a, i) {
        var wrap = document.createElement('div');
        wrap.className = 'pending-attach' + (a.uploading ? ' uploading' : '');

        if (a.type === 'image') {
          var imgWrap = document.createElement('div');
          imgWrap.style.cssText = 'position:relative;display:inline-block';
          var img = document.createElement('img');
          img.className = 'pending-attach-img';
          img.src = a.preview || a.url;
          img.alt = a.filename;
          imgWrap.appendChild(img);
          if (a.uploading) {
            var spinOverlay = document.createElement('div');
            spinOverlay.className = 'pending-attach-loading';
            spinOverlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.4)';
            var sp = document.createElement('div'); sp.className = 'spinner';
            spinOverlay.appendChild(sp);
            imgWrap.appendChild(spinOverlay);
          }
          wrap.appendChild(imgWrap);
        } else {
          if (a.uploading) {
            var loadBox = document.createElement('div');
            loadBox.className = 'pending-attach-loading';
            var sp2 = document.createElement('div'); sp2.className = 'spinner';
            loadBox.appendChild(sp2);
            wrap.appendChild(loadBox);
          }
          var doc = document.createElement('div');
          doc.className = 'pending-attach-doc';
          var iconSpan = document.createElement('span');
          iconSpan.className = 'file-icon';
          iconSpan.innerHTML = getFileIcon(a.filename); // safe: hardcoded SVGs only
          doc.appendChild(iconSpan);
          doc.appendChild(document.createTextNode(a.filename));
          wrap.appendChild(doc);
        }

        if (!a.uploading) {
          var removeBtn = document.createElement('button');
          removeBtn.className = 'pending-attach-remove';
          removeBtn.textContent = 'x';
          removeBtn.addEventListener('click', function() { removePendingAttach(i); });
          wrap.appendChild(removeBtn);
        }
        container.appendChild(wrap);
      });
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

    /* ==================== GALLERY PICKER ==================== */
    let galleryImages = [];
    let gallerySelected = new Set();
    let galleryFilter = 'all';

    async function openGalleryPicker() {
      gallerySelected.clear();
      galleryFilter = 'all';
      const overlay = document.getElementById('gallery-overlay');
      const body = document.getElementById('gallery-body');
      body.textContent = '';
      document.querySelectorAll('.gallery-tab').forEach(t => t.classList.toggle('active', t.dataset.source === 'all'));
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'gallery-loading';
      loadingDiv.textContent = 'Loading images...';
      body.appendChild(loadingDiv);
      overlay.classList.add('visible');
      updateGalleryFooter();

      try {
        const res = await fetch('/api/gallery?limit=100');
        if (!res.ok) throw new Error('Failed to load gallery');
        const data = await res.json();
        galleryImages = data.images || [];
        renderGalleryGrid();
      } catch (err) {
        body.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'gallery-empty';
        errDiv.textContent = 'Failed to load images: ' + err.message;
        body.appendChild(errDiv);
      }
    }

    function renderGalleryGrid() {
      const body = document.getElementById('gallery-body');
      body.textContent = '';

      const filtered = galleryFilter === 'all'
        ? galleryImages
        : galleryImages.filter(img => galleryFilter === 'generations' ? img.source === 'generation' : img.source === 'chat');

      if (filtered.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'gallery-empty';
        if (galleryImages.length === 0) {
          emptyDiv.textContent = 'No images found. Generate them on ';
          const link = document.createElement('a');
          link.href = 'https://os.ikawn.com';
          link.target = '_blank';
          link.textContent = 'os.ikawn.com';
          link.style.color = 'var(--accent)';
          emptyDiv.appendChild(link);
        } else {
          emptyDiv.textContent = 'No images in this category.';
        }
        body.appendChild(emptyDiv);
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'gallery-grid';
      filtered.forEach(img => {
        const origIdx = galleryImages.indexOf(img);
        const thumb = document.createElement('div');
        thumb.className = 'gallery-thumb' + (gallerySelected.has(origIdx) ? ' selected' : '');
        thumb.dataset.idx = origIdx;
        const imgEl = document.createElement('img');
        imgEl.src = img.thumbnail || img.url;
        imgEl.alt = img.filename || 'image';
        imgEl.loading = 'lazy';
        thumb.appendChild(imgEl);
        if (img.source === 'generation' && img.agent) {
          const badge = document.createElement('span');
          badge.className = 'gallery-agent-badge';
          badge.textContent = img.agent;
          thumb.appendChild(badge);
        }
        thumb.addEventListener('click', () => toggleGalleryItem(origIdx, thumb));
        grid.appendChild(thumb);
      });
      body.appendChild(grid);
    }

    function filterGallery(source, btn) {
      galleryFilter = source;
      document.querySelectorAll('.gallery-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      renderGalleryGrid();
    }

    function closeGalleryPicker() {
      document.getElementById('gallery-overlay').classList.remove('visible');
      gallerySelected.clear();
    }

    function toggleGalleryItem(idx, el) {
      if (gallerySelected.has(idx)) { gallerySelected.delete(idx); el.classList.remove('selected'); }
      else { gallerySelected.add(idx); el.classList.add('selected'); }
      updateGalleryFooter();
    }

    function updateGalleryFooter() {
      const count = gallerySelected.size;
      document.getElementById('gallery-count').textContent = count + ' selected';
      document.getElementById('gallery-add-btn').disabled = count === 0;
    }

    function addGallerySelection() {
      for (const idx of gallerySelected) {
        const img = galleryImages[idx];
        if (!img || pendingAttachments.some(a => a.url === img.url)) continue;
        pendingAttachments.push({ type: 'image', url: img.url, filename: img.filename || 'image', preview: img.thumbnail || img.url });
      }
      renderPendingAttachments();
      updateSendBtn();
      closeGalleryPicker();
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
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    function autoGrow(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }

    function updateSendBtn() {
      const btn = document.getElementById('send-btn');
      const input = document.getElementById('msg-input');
      const hasContent = input.value.trim() || pendingAttachments.length;
      btn.disabled = isStreaming || !hasContent;
      btn.style.display = hasContent ? '' : 'none';
      btn.classList.toggle('has-content', !!hasContent && !isStreaming);
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

    /* ==================== SHARE ==================== */
    let currentShareToken = null;

    function toggleShareMenu(e) {
      e.stopPropagation();
      document.getElementById('share-dropdown').classList.toggle('visible');
    }

    document.addEventListener('click', (e) => {
      const dd = document.getElementById('share-dropdown');
      if (dd && !e.target.closest('.share-wrapper')) dd.classList.remove('visible');
    });

    function updateShareUI() {
      const wrapper = document.getElementById('share-wrapper');
      wrapper.style.display = activeConvId ? '' : 'none';
      const linkBtn = document.getElementById('share-link-btn');
      const linkText = document.getElementById('share-link-text');
      if (currentShareToken) {
        linkText.textContent = 'Copy Shared Link';
        linkBtn.className = 'share-dropdown-item active';
      } else {
        linkText.textContent = 'Create Shareable Link';
        linkBtn.className = 'share-dropdown-item';
      }
    }

    async function copyConversation() {
      if (!activeConvId) return;
      try {
        const res = await fetch('/api/conversations/' + activeConvId + '/markdown');
        if (!res.ok) throw new Error('Failed to export');
        const data = await res.json();
        await navigator.clipboard.writeText(data.markdown);
        showToast('Copied to clipboard', 'success');
      } catch (err) { showToast(err.message, 'error'); }
      document.getElementById('share-dropdown').classList.remove('visible');
    }

    async function downloadConversation() {
      if (!activeConvId) return;
      try {
        const res = await fetch('/api/conversations/' + activeConvId + '/markdown');
        if (!res.ok) throw new Error('Failed to export');
        const data = await res.json();
        const blob = new Blob([data.markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (data.title || 'conversation').replace(/[^a-zA-Z0-9 _-]/g, '') + '.md';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Downloaded', 'success');
      } catch (err) { showToast(err.message, 'error'); }
      document.getElementById('share-dropdown').classList.remove('visible');
    }

    async function toggleShareLink() {
      if (!activeConvId) return;
      try {
        if (currentShareToken) {
          const url = window.location.origin + '/shared/' + currentShareToken;
          await navigator.clipboard.writeText(url);
          showToast('Link copied to clipboard', 'success');
          document.getElementById('share-dropdown').classList.remove('visible');
          const linkBtn = document.getElementById('share-link-btn');
          const linkText = document.getElementById('share-link-text');
          linkText.textContent = 'Revoke Shared Link';
          linkBtn.className = 'share-dropdown-item danger';
          linkBtn.onclick = revokeShareLink;
          return;
        }
        const res = await fetch('/api/conversations/' + activeConvId + '/share', { method: 'POST' });
        if (!res.ok) throw new Error('Failed to create link');
        const data = await res.json();
        currentShareToken = data.share_token;
        const url = window.location.origin + '/shared/' + currentShareToken;
        await navigator.clipboard.writeText(url);
        showToast('Shareable link created & copied', 'success');
        updateShareUI();
      } catch (err) { showToast(err.message, 'error'); }
      document.getElementById('share-dropdown').classList.remove('visible');
    }

    async function revokeShareLink() {
      if (!activeConvId) return;
      try {
        const res = await fetch('/api/conversations/' + activeConvId + '/share', { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to revoke');
        currentShareToken = null;
        showToast('Shared link revoked', 'success');
        updateShareUI();
        document.getElementById('share-link-btn').onclick = toggleShareLink;
      } catch (err) { showToast(err.message, 'error'); }
      document.getElementById('share-dropdown').classList.remove('visible');
    }

    /* ==================== AUTH ==================== */
    async function logout() {
      await fetch('/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    }

    /* ==================== UTILS ==================== */
    function isNearBottom() {
      const el = document.getElementById('messages');
      return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    }

    function scrollToBottom(force) {
      if (!force && !isNearBottom()) return;
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

    /* ==================== @MENTION AUTOCOMPLETE ==================== */
    let mentionList = [];
    let mentionActiveIdx = -1;
    let mentionQuery = '';
    let mentionStartPos = -1;
    let skillList = [];
    let skillMode = false;

    (async function loadMentions() {
      try {
        const res = await fetch('/api/mission/mentions', { headers: { 'Accept': 'application/json' } });
        if (res.ok) mentionList = await res.json();
      } catch (_) {}
    })();
    (async function loadSkills() {
      try {
        const res = await fetch('/api/mission/tools', { headers: { 'Accept': 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          skillList = (data.tools || []).map(t => ({ slug: t.name, name: t.name, role: t.description || t.tier, type: 'skill' }));
        }
      } catch (_) {}
    })();

    function getMentionDropdown() { return document.getElementById('mention-dropdown'); }

    function buildMentionItem(m, isActive) {
      const item = document.createElement('div');
      item.className = 'mention-item' + (isActive ? ' active' : '');
      item.dataset.slug = m.slug;
      item.dataset.name = m.name;
      item.dataset.mtype = m.type || 'agent';
      item.addEventListener('click', () => selectMention(item));

      const avatar = document.createElement('div');
      avatar.className = 'mention-avatar ' + (m.type === 'skill' || m.type === 'agent' ? 'agent' : 'person');
      avatar.textContent = m.type === 'skill' ? '/' : m.name[0].toUpperCase();

      const info = document.createElement('div');
      info.className = 'mention-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'mention-name';
      nameEl.textContent = (m.type === 'skill' ? '/' : '@') + m.slug;
      const roleEl = document.createElement('span');
      roleEl.className = 'mention-role';
      roleEl.textContent = m.type === 'skill' ? m.role : (m.name + ' \\u2014 ' + m.role);
      info.appendChild(nameEl);
      info.appendChild(roleEl);

      item.appendChild(avatar);
      item.appendChild(info);
      return item;
    }

    function showMentionDropdown(filtered) {
      const dd = getMentionDropdown();
      if (!filtered.length) { dd.classList.remove('visible'); return; }
      mentionActiveIdx = 0;
      dd.replaceChildren();
      filtered.forEach((m, i) => dd.appendChild(buildMentionItem(m, i === 0)));
      dd.classList.add('visible');
    }

    function hideMentionDropdown() {
      getMentionDropdown().classList.remove('visible');
      mentionStartPos = -1;
      mentionQuery = '';
      mentionActiveIdx = -1;
    }

    function selectMention(el) {
      const slug = el?.dataset?.slug;
      if (!slug) return;
      const isSkill = el?.dataset?.mtype === 'skill';
      const input = document.getElementById('msg-input');
      const before = input.value.slice(0, mentionStartPos);
      const after = input.value.slice(input.selectionStart);
      const prefix = isSkill ? '/' : '@';
      input.value = before + prefix + slug + ' ' + after;
      hideMentionDropdown();
      input.focus();
      const pos = before.length + slug.length + 2;
      input.setSelectionRange(pos, pos);
      autoGrow(input);
      updateSendBtn();
    }

    document.addEventListener('DOMContentLoaded', function() {
      const input = document.getElementById('msg-input');
      if (!input) return;

      input.addEventListener('input', function() {
        const val = input.value;
        const cursor = input.selectionStart;
        const textBeforeCursor = val.slice(0, cursor);

        if (val.startsWith('/')) {
          const query = textBeforeCursor.slice(1).toLowerCase();
          if (!query.includes(' ')) {
            skillMode = true;
            mentionStartPos = 0;
            mentionQuery = query;
            showMentionDropdown(skillList.filter(s => s.slug.toLowerCase().startsWith(query)).slice(0, 8));
            return;
          }
        }

        skillMode = false;
        const atIdx = textBeforeCursor.lastIndexOf('@');

        if (atIdx >= 0) {
          const charBefore = atIdx > 0 ? val[atIdx - 1] : ' ';
          if (charBefore === ' ' || charBefore === '\\n' || atIdx === 0) {
            const query = textBeforeCursor.slice(atIdx + 1).toLowerCase();
            if (!query.includes(' ')) {
              mentionStartPos = atIdx;
              mentionQuery = query;
              showMentionDropdown(mentionList.filter(m => m.slug.toLowerCase().startsWith(query) || m.name.toLowerCase().startsWith(query)).slice(0, 6));
              return;
            }
          }
        }
        hideMentionDropdown();
      });

      window.handleInputKey = function(e) {
        const dd = getMentionDropdown();
        if (dd.classList.contains('visible')) {
          const items = dd.querySelectorAll('.mention-item');
          if (e.key === 'ArrowDown') { e.preventDefault(); mentionActiveIdx = Math.min(mentionActiveIdx + 1, items.length - 1); items.forEach((el, i) => el.classList.toggle('active', i === mentionActiveIdx)); return; }
          if (e.key === 'ArrowUp') { e.preventDefault(); mentionActiveIdx = Math.max(mentionActiveIdx - 1, 0); items.forEach((el, i) => el.classList.toggle('active', i === mentionActiveIdx)); return; }
          if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); if (items[mentionActiveIdx]) selectMention(items[mentionActiveIdx]); return; }
          if (e.key === 'Escape') { e.preventDefault(); hideMentionDropdown(); return; }
        }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      };
    });

    function renderMentionPills(html) {
      return html.replace(/@(\\w+)/g, function(match, slug) {
        var found = mentionList.find(m => m.slug.toLowerCase() === slug.toLowerCase());
        if (found) return '<span class="mention-pill">' + escapeHtml(match) + '</span>';
        return match;
      });
    }

    var _origRenderContent = renderContent;
    renderContent = function(role, content) {
      return renderMentionPills(_origRenderContent(role, content));
    };
  </script>
</body>
</html>`;
}

module.exports = router;
