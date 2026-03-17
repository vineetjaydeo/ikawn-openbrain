const { Router } = require('express');
const { requireAuth } = require('../auth');
const { RUHI_FAVICON_LINK, RUHI_ICON_URL } = require('../utils/ruhi-assets');

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
      --bg: #0A0F2E;
      --bg-sidebar: #070B22;
      --bg-input: #111738;
      --bg-hover: #171E45;
      --bg-assistant: transparent;
      --bg-user: #1c1c1e;
      --border: #1C2452;
      --border-light: #252D5E;
      --text: #E8EAF0;
      --text-dim: #9498B0;
      --text-muted: #5C6185;
      --accent: #FFC01C;
      --accent-hover: #F5B000;
      --accent-glow: #FFC01C25;
      --accent-soft: #FFC01C12;
      --danger: #ef4444;
      --success: #22c55e;
      --warm: #f0c878;
      --sidebar-w: 260px;
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

    /* ==================== SIDEBAR ==================== */
    .sidebar {
      position: fixed;
      left: 0; top: 0; bottom: 0;
      width: var(--sidebar-w);
      min-width: var(--sidebar-w);
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
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
      background: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
    }
    .sidebar-brand-icon img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .sidebar-brand-name {
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.02em;
      font-family: 'Parkinsans', 'Google Sans', sans-serif;
    }

    .btn-new-chat {
      width: 100%;
      padding: 10px 14px;
      background: var(--accent-soft);
      border: 1px solid var(--border-light);
      border-radius: 100px;
      color: var(--text);
      font-size: 0.84rem;
      font-family: inherit;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    .btn-new-chat:hover {
      background: var(--accent-glow);
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
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
      padding: 9px 12px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 0.82rem;
      color: var(--text-dim);
      transition: all 0.15s ease;
      position: relative;
    }
    .conv-item:hover { background: var(--bg-hover); color: var(--text); }
    .conv-item.active { background: var(--accent-soft); color: var(--text); border: 1px solid var(--accent-glow); }

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
      width: 100vw;
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
    }
    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 3px; }

    .messages-inner {
      max-width: 860px;
      margin: 0 auto;
      padding: 32px 24px 130px;
      display: flex;
      flex-direction: column;
      gap: 24px;
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
      background: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.3rem;
      font-weight: 700;
      color: #0a0a0a;
      margin-bottom: 4px;
    }
    .welcome-screen h2 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text);
      letter-spacing: -0.02em;
      font-family: 'Parkinsans', 'Google Sans', sans-serif;
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
      line-height: 1.8;
    }
    .msg-row.user { justify-content: flex-end; }

    .msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 600;
      margin-top: 3px;
    }
    .msg-avatar.assistant-avatar {
      background: var(--accent);
      color: #0a0a0a;
    }
    .msg-avatar.user-avatar {
      display: none;
    }

    .msg-bubble {
      font-size: 0.94rem;
      line-height: 1.7;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .msg-row.user .msg-bubble {
      max-width: 75%;
      padding: 12px 20px;
      background: linear-gradient(135deg, rgba(255, 192, 28, 0.18), rgba(245, 158, 11, 0.14));
      color: #e8e0d0;
      border-radius: 20px 20px 6px 20px;
      border: 1px solid rgba(255, 192, 28, 0.25);
      font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 500;
      box-shadow: 0 2px 12px rgba(255, 192, 28, 0.06);
    }
    .msg-row.assistant .msg-bubble {
      max-width: 100%;
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
    .msg-bubble blockquote { border-left: 3px solid var(--accent); padding-left: 14px; color: var(--text-dim); margin: 0.5em 0; }
    .msg-bubble strong { color: var(--text); font-weight: 600; }

    /* ---------- Reply button on hover ---------- */
    .msg-row { position: relative; }
    .msg-reply-btn {
      position: absolute;
      top: 4px;
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
    .msg-row.assistant .msg-reply-btn { right: 8px; }
    .msg-row.user .msg-reply-btn { left: 8px; }
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
      background: #27272a;
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 0.88em;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    }
    .msg-bubble pre {
      background: #09090b;
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
    .typing-content {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      background: var(--bg-assistant);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      border-bottom-left-radius: 4px;
    }
    .typing-label {
      font-size: 0.9rem;
      color: var(--text-dim);
      font-style: italic;
    }
    .typing-dots {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .typing-dots span {
      width: 5px;
      height: 5px;
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
      border: 1px solid rgba(255, 255, 255, 0.06);
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
      max-width: 860px;
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
      border-radius: 24px;
      padding: 10px 16px;
      transition: all 0.25s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .compose:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow), 0 4px 16px rgba(0,0,0,0.2);
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
      color: var(--accent);
      background: var(--accent-soft);
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
      background: linear-gradient(135deg, #FFC01C, #F59E0B);
      color: #0A0F2E;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(255, 192, 28, 0.25);
    }
    .compose-btn.send-btn:hover { background: linear-gradient(135deg, #F5B000, #E8920A); box-shadow: 0 4px 12px rgba(255, 192, 28, 0.35); }
    .compose-btn.send-btn:disabled { opacity: 0.3; cursor: not-allowed; box-shadow: none; }

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
      position: absolute;
      right: 16px;
      top: 12px;
      z-index: 30;
    }
    .share-btn {
      background: none;
      border: 1px solid var(--border-light);
      border-radius: 8px;
      color: var(--text-dim);
      cursor: pointer;
      padding: 6px 12px;
      font-size: 0.78rem;
      font-family: inherit;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }
    .share-btn:hover { background: var(--bg-hover); color: var(--text); border-color: var(--accent); }
    .share-dropdown {
      display: none;
      position: absolute;
      right: 0;
      top: calc(100% + 6px);
      background: var(--bg-sidebar);
      border: 1px solid var(--border-light);
      border-radius: 12px;
      min-width: 240px;
      padding: 6px;
      z-index: 100;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    .share-dropdown.visible { display: block; }
    .share-dropdown-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: none;
      background: none;
      color: var(--text-dim);
      font-size: 0.82rem;
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
      background: var(--bg-sidebar);
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
    .gallery-tab.active { background: rgba(255,192,28,0.15); color: var(--accent); font-weight: 600; }
    .gallery-agent-badge {
      position: absolute;
      bottom: 4px;
      left: 4px;
      background: rgba(10,15,46,0.8);
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

    /* ==================== SIDEBAR OVERLAY (mobile) ==================== */
    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
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

    /* @mention autocomplete */
    .mention-dropdown {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      max-height: 220px;
      overflow-y: auto;
      background: var(--bg-input);
      border: 1px solid var(--border-light);
      border-radius: 12px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
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
      background: rgba(255, 192, 28, 0.1);
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
    .mention-avatar.agent { background: linear-gradient(135deg, var(--accent), #F59E0B); color: #0A0F2E; }
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
          <div class="sidebar-brand-icon"><img src="${RUHI_ICON_URL}" alt="Ruhi"></div>
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
          ${isAdmin ? '<a href="/mission">Mission</a><a href="/admin">Admin</a><a href="/admin/brain-health">Health</a>' : ''}
          <a href="javascript:void(0)" onclick="logout()">Logout</a>
        </div>
        <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">v${require('../../package.json').version}</div>
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

      <div class="share-wrapper" id="share-wrapper" style="display:none">
        <button class="share-btn" onclick="toggleShareMenu(event)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </button>
        <div class="share-dropdown" id="share-dropdown">
          <button class="share-dropdown-item" onclick="copyConversation()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy as Markdown
          </button>
          <button class="share-dropdown-item" onclick="downloadConversation()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download .md
          </button>
          <div class="share-dropdown-divider"></div>
          <button class="share-dropdown-item" id="share-link-btn" onclick="toggleShareLink()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <span id="share-link-text">Create Shareable Link</span>
          </button>
        </div>
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
          html += '<div class="conv-item' + (isActive ? ' active' : '') + '" data-id="' + c.id + '" onclick="loadConversation(\\'' + c.id + '\\')">'
            + '<span class="conv-item-title">' + escapeHtml(c.title || 'New Chat') + '</span>'
            + '<div class="conv-item-actions">'
            + '<button class="conv-action-btn" onclick="event.stopPropagation(); startRename(\\'' + c.id + '\\')" title="Rename">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>'
            + '</button>'
            + '<button class="conv-action-btn danger" onclick="event.stopPropagation(); deleteConversation(\\'' + c.id + '\\')" title="Delete">'
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
      welcome.innerHTML = '<div class="welcome-icon">R</div><h2>Hi, I\u2019m Ruhi</h2><p>Your intelligent commerce copilot. Ask me anything about your brand, business, or creative needs.</p>';
      container.appendChild(welcome);
      currentShareToken = null;
      updateShareUI();
    }

    function renderMessages(messages) {
      const container = document.getElementById('messages-inner');
      container.innerHTML = '';
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
      container.innerHTML =
        '<div class="reply-preview">'
        + '<div class="reply-preview-bar"></div>'
        + '<div class="reply-preview-text"><strong>' + sender + ':</strong> ' + preview + '</div>'
        + '<button class="reply-preview-close" onclick="clearReplyTo()">&times;</button>'
        + '</div>';
      document.getElementById('msg-input').focus();
    }

    function clearReplyTo() {
      replyToContent = null;
      replyToRole = null;
      document.getElementById('reply-preview-container').innerHTML = '';
    }

    function createMessageElement(role, content, attachments) {
      const row = document.createElement('div');
      row.className = 'msg-row ' + role;

      const replyBtn = '<button class="msg-reply-btn" data-role="' + role + '" onclick="setReplyTo(this.dataset.role, this.closest(&quot;.msg-row&quot;).querySelector(&quot;.msg-bubble&quot;).textContent)">Reply</button>';

      if (role === 'assistant') {
        row.innerHTML =
          '<div class="msg-avatar assistant-avatar">R</div>'
          + '<div class="msg-bubble">'
          + renderAttachments(attachments)
          + renderContent(role, content)
          + '</div>'
          + replyBtn;
      } else {
        row.innerHTML =
          replyBtn
          + '<div class="msg-bubble">'
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
          history.pushState(null, '', '/chat/' + conv.id);
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
      clearReplyTo();
      updateSendBtn();
      scrollToBottom(true);

      // Detect @mention client-side for typing indicator
      var mentionMatch = content.match(/@(\w+)/);
      var mentionAgent = mentionMatch ? mentionList.find(function(m) { return m.slug.toLowerCase() === mentionMatch[1].toLowerCase() && m.type === 'agent'; }) : null;
      var typingAvatar = mentionAgent ? mentionAgent.name[0].toUpperCase() : 'R';
      var typingLabel = mentionAgent ? mentionAgent.name + ' is thinking' : 'Thinking';
      if (mentionAgent) window._currentAgentIdentity = { slug: mentionAgent.slug, name: mentionAgent.name, role: mentionAgent.role };

      // Show thinking indicator
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

      // Brief delay so user sees the thinking state
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

        // Keep typing indicator until first chunk arrives
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
                // Update typing indicator to show agent avatar
                const typing = document.getElementById('typing');
                if (typing) {
                  const av = typing.querySelector('.assistant-avatar');
                  if (av) av.textContent = evt.name[0].toUpperCase();
                  const label = typing.querySelector('.typing-label');
                  if (label) label.textContent = evt.name + ' is thinking';
                }
                // Store for message row
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
                bubble.querySelectorAll('pre code').forEach(el => {
                  if (!el.dataset.highlighted) { hljs.highlightElement(el); el.dataset.highlighted = 'true'; }
                });
                scrollToBottom(false);
              } else if (evt.type === 'title' && evt.title) {
                document.getElementById('header-title').textContent = evt.title;
                // Update sidebar
                const conv = conversations.find(c => c.id === activeConvId);
                if (conv) { conv.title = evt.title; renderConversationList(); }
              } else if (evt.type === 'generation_started') {
                // Show generation card inline in chat
                showGenerationCard(evt.generationId, evt.agent, evt.prompt, evt.batchSize);
              } else if (evt.type === 'error') {
                showToast(evt.error || evt.message || 'An error occurred', 'error');
              }
            } catch {}
          }
        }

        if (bubble) {
          // Apply mention pills to final rendered content
          if (typeof renderMentionPills === 'function') bubble.innerHTML = renderMentionPills(bubble.innerHTML);
          bubble.removeAttribute('id');
        }
        if (firstChunk) { const typing = document.getElementById('typing'); if (typing) typing.remove(); }

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

      // Header
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

      // Prompt
      const promptEl = document.createElement('div');
      promptEl.className = 'gen-card-prompt';
      promptEl.textContent = prompt || '';

      // Image placeholders
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

      // Start polling for results
      pollGeneration(generationId, cardId);
    }

    async function pollGeneration(generationId, cardId) {
      const maxAttempts = 60; // 2 minutes at 2s intervals
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
            if (attempts > 5) {
              updateGenCard(cardId, 'error', null, 'Failed to check status');
              return;
            }
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
            // Still processing
            setTimeout(poll, 2000);
          }
        } catch (err) {
          if (attempts > 5) {
            updateGenCard(cardId, 'error', null, 'Connection lost');
            return;
          }
          setTimeout(poll, 3000);
        }
      };

      // First poll after 3s (generation needs time to start)
      setTimeout(poll, 3000);
    }

    function updateGenCard(cardId, status, urls, errorMsg, generationId) {
      const card = document.getElementById(cardId);
      if (!card) return;

      const statusEl = card.querySelector('.gen-card-status');
      const imagesEl = card.querySelector('.gen-card-images');

      if (status === 'completed' && urls) {
        // Update status
        while (statusEl.firstChild) statusEl.removeChild(statusEl.firstChild);
        statusEl.appendChild(document.createTextNode('\u2713 Complete'));
        statusEl.style.color = 'var(--success)';

        // Show images
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

        // Add link to view on iKawn OS
        if (generationId) {
          const link = document.createElement('a');
          link.className = 'gen-card-link';
          link.href = 'https://os.ikawn.com/genie/' + generationId;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = 'View on iKawn OS \u2192';
          card.appendChild(link);
        }

        scrollToBottom(false);
      } else if (status === 'error') {
        while (statusEl.firstChild) statusEl.removeChild(statusEl.firstChild);
        statusEl.appendChild(document.createTextNode('\u2715 Failed'));
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

    /* ==================== GALLERY PICKER ==================== */
    let galleryImages = [];
    let gallerySelected = new Set();
    let galleryFilter = 'all';

    async function openGalleryPicker() {
      gallerySelected.clear();
      galleryFilter = 'all';
      const overlay = document.getElementById('gallery-overlay');
      const body = document.getElementById('gallery-body');
      while (body.firstChild) body.removeChild(body.firstChild);
      // Reset tabs
      document.querySelectorAll('.gallery-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.source === 'all');
      });
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
        while (body.firstChild) body.removeChild(body.firstChild);
        const errDiv = document.createElement('div');
        errDiv.className = 'gallery-empty';
        errDiv.textContent = 'Failed to load images: ' + err.message;
        body.appendChild(errDiv);
      }
    }

    function renderGalleryGrid() {
      const body = document.getElementById('gallery-body');
      while (body.firstChild) body.removeChild(body.firstChild);

      const filtered = galleryFilter === 'all'
        ? galleryImages
        : galleryImages.filter(function(img) {
            return galleryFilter === 'generations' ? img.source === 'generation' : img.source === 'chat';
          });

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
      filtered.forEach(function(img) {
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
        thumb.addEventListener('click', function() { toggleGalleryItem(origIdx, thumb); });
        grid.appendChild(thumb);
      });
      body.appendChild(grid);
    }

    function filterGallery(source, btn) {
      galleryFilter = source;
      document.querySelectorAll('.gallery-tab').forEach(function(t) { t.classList.remove('active'); });
      btn.classList.add('active');
      renderGalleryGrid();
    }

    function closeGalleryPicker() {
      document.getElementById('gallery-overlay').classList.remove('visible');
      gallerySelected.clear();
    }

    function toggleGalleryItem(idx, el) {
      if (gallerySelected.has(idx)) {
        gallerySelected.delete(idx);
        el.classList.remove('selected');
      } else {
        gallerySelected.add(idx);
        el.classList.add('selected');
      }
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
        if (!img) continue;
        // Avoid duplicates
        if (pendingAttachments.some(a => a.url === img.url)) continue;
        pendingAttachments.push({
          type: 'image',
          url: img.url,
          filename: img.filename || 'image',
          preview: img.thumbnail || img.url,
        });
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

    /* ==================== SHARE ==================== */
    let currentShareToken = null;

    function toggleShareMenu(e) {
      e.stopPropagation();
      const dd = document.getElementById('share-dropdown');
      dd.classList.toggle('visible');
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('share-dropdown');
      if (dd && !e.target.closest('.share-wrapper')) {
        dd.classList.remove('visible');
      }
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
      } catch (err) {
        showToast(err.message, 'error');
      }
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
      } catch (err) {
        showToast(err.message, 'error');
      }
      document.getElementById('share-dropdown').classList.remove('visible');
    }

    async function toggleShareLink() {
      if (!activeConvId) return;
      try {
        if (currentShareToken) {
          // Copy existing link
          const url = window.location.origin + '/shared/' + currentShareToken;
          await navigator.clipboard.writeText(url);
          showToast('Link copied to clipboard', 'success');
          document.getElementById('share-dropdown').classList.remove('visible');

          // Show revoke option briefly
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
      } catch (err) {
        showToast(err.message, 'error');
      }
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
        // Reset button
        const linkBtn = document.getElementById('share-link-btn');
        linkBtn.onclick = toggleShareLink;
      } catch (err) {
        showToast(err.message, 'error');
      }
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
    let skillMode = false; // true when showing /skill autocomplete

    // Fetch mentionable entities + tools on page load
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
          skillList = (data.tools || []).map(function(t) {
            return { slug: t.name, name: t.name, role: t.description || t.tier, type: 'skill' };
          });
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
      item.onclick = function() { selectMention(this); };

      const avatar = document.createElement('div');
      avatar.className = 'mention-avatar ' + (m.type === 'skill' ? 'agent' : m.type === 'agent' ? 'agent' : 'person');
      avatar.textContent = m.type === 'skill' ? '/' : m.name[0].toUpperCase();

      const info = document.createElement('div');
      info.className = 'mention-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'mention-name';
      nameEl.textContent = (m.type === 'skill' ? '/' : '@') + m.slug;
      const roleEl = document.createElement('span');
      roleEl.className = 'mention-role';
      roleEl.textContent = m.type === 'skill' ? m.role : (m.name + ' \u2014 ' + m.role);
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
      filtered.forEach(function(m, i) {
        dd.appendChild(buildMentionItem(m, i === 0));
      });
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

    // Listen for input on the textarea to detect @mentions
    document.addEventListener('DOMContentLoaded', function() {
      const input = document.getElementById('msg-input');
      if (!input) return;

      input.addEventListener('input', function() {
        const val = input.value;
        const cursor = input.selectionStart;
        const textBeforeCursor = val.slice(0, cursor);

        // Detect /skill at position 0
        if (val.startsWith('/')) {
          const query = textBeforeCursor.slice(1).toLowerCase();
          if (!query.includes(' ')) {
            skillMode = true;
            mentionStartPos = 0;
            mentionQuery = query;
            var filtered = skillList.filter(function(s) {
              return s.slug.toLowerCase().startsWith(query);
            }).slice(0, 8);
            showMentionDropdown(filtered);
            return;
          }
        }

        skillMode = false;

        // Find the @ symbol before cursor
        const atIdx = textBeforeCursor.lastIndexOf('@');

        if (atIdx >= 0) {
          // Only trigger if @ is at start or preceded by space/newline
          const charBefore = atIdx > 0 ? val[atIdx - 1] : ' ';
          if (charBefore === ' ' || charBefore === '\\n' || atIdx === 0) {
            const query = textBeforeCursor.slice(atIdx + 1).toLowerCase();
            // Don't show dropdown if there's a space in the query (mention already complete)
            if (!query.includes(' ')) {
              mentionStartPos = atIdx;
              mentionQuery = query;
              const filtered = mentionList.filter(function(m) {
                return m.slug.toLowerCase().startsWith(query) || m.name.toLowerCase().startsWith(query);
              }).slice(0, 6);
              showMentionDropdown(filtered);
              return;
            }
          }
        }
        hideMentionDropdown();
      });

      // Handle keyboard nav in mention dropdown
      window.handleInputKey = function(e) {
        const dd = getMentionDropdown();
        if (dd.classList.contains('visible')) {
          const items = dd.querySelectorAll('.mention-item');
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            mentionActiveIdx = Math.min(mentionActiveIdx + 1, items.length - 1);
            items.forEach(function(el, i) { el.classList.toggle('active', i === mentionActiveIdx); });
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            mentionActiveIdx = Math.max(mentionActiveIdx - 1, 0);
            items.forEach(function(el, i) { el.classList.toggle('active', i === mentionActiveIdx); });
            return;
          }
          if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            if (items[mentionActiveIdx]) selectMention(items[mentionActiveIdx]);
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            hideMentionDropdown();
            return;
          }
        }
        // Default: Enter to send
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      };
    });

    // Render @mentions as gold pills in message content
    function renderMentionPills(html) {
      return html.replace(/@(\w+)/g, function(match, slug) {
        var found = mentionList.find(function(m) { return m.slug.toLowerCase() === slug.toLowerCase(); });
        if (found) return '<span class="mention-pill">' + escapeHtml(match) + '</span>';
        return match;
      });
    }

    // Patch renderContent to add mention pills
    var _origRenderContent = renderContent;
    renderContent = function(role, content) {
      var html = _origRenderContent(role, content);
      return renderMentionPills(html);
    };
  </script>
</body>
</html>`;
}

module.exports = router;
