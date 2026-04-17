const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const { RUHI_FAVICON_LINK, INSTANCE_NAME } = require('../utils/ruhi-assets');

router.get('/vault', requireAuth, (req, res) => {
  res.send(vaultPage(req.session.user));
});

function vaultPage(user) {
  const isAdmin = user.role === 'admin';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="robots" content="noindex, nofollow">
  <title>Vault | ${INSTANCE_NAME}</title>
  ${RUHI_FAVICON_LINK}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Parkinsans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: #0a0a0a;
      --bg-alt: #111;
      --bg-sidebar: rgb(8,8,8);
      --bg-input: rgb(32,32,32);
      --bg-hover: rgba(255,255,255,0.06);
      --border: rgba(255,255,255,0.08);
      --border-solid: rgb(40,40,40);
      --text: #e8e8e8;
      --text-dim: rgba(255,255,255,0.45);
      --text-muted: rgb(100,100,100);
      --accent: #FFC01C;
      --accent-hover: #F5B000;
      --accent-glow: rgba(255,192,28,0.15);
      --accent-soft: rgba(255,192,28,0.08);
      --danger: #ef4444;
      --success: #22c55e;
      --radius: 16px;
      --radius-sm: 12px;
      --rail-w: 48px;
      --folder-w: 200px;
      --detail-w: 360px;
    }

    html, body {
      height: 100%;
      overflow: hidden;
      font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
    }

    /* ==================== KEYFRAMES ==================== */
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideInRight {
      from { opacity: 0; transform: translateX(24px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes slideInLeft {
      from { opacity: 0; transform: translateX(-24px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes scaleOut {
      to { opacity: 0; transform: scale(0.9); }
    }

    /* ==================== SCROLLBAR ==================== */
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }

    /* ==================== LAYOUT ==================== */
    .app {
      display: flex;
      height: 100vh;
      width: 100vw;
    }

    /* ==================== SIDEBAR RAIL ==================== */
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
      border-right: 1px solid var(--border-solid);
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
    .rail-btn.active { background: var(--accent-soft); color: var(--accent); }
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
      background: var(--border-solid);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-dim);
      cursor: pointer;
    }

    /* ==================== FOLDER SIDEBAR ==================== */
    .folder-sidebar {
      position: fixed;
      left: var(--rail-w);
      top: 0; bottom: 0;
      width: var(--folder-w);
      background: var(--bg);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      z-index: 50;
      overflow: hidden;
    }

    .folder-header {
      padding: 16px 14px 8px;
      font-family: 'Parkinsans', 'Google Sans', sans-serif;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .folder-header .sparkle { color: var(--accent); font-size: 1.1rem; }

    .folder-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .folder-item {
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
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      touch-action: manipulation;
    }
    .folder-item:active { transform: scale(0.96); }
    .folder-item svg { width: 16px; height: 16px; flex-shrink: 0; }
    .folder-item .folder-count {
      margin-left: auto;
      font-size: 0.72rem;
      color: var(--text-muted);
      min-width: 20px;
      text-align: right;
    }
    .folder-item.active { background: var(--bg-hover); color: var(--text); }

    @media (hover: hover) {
      .folder-item:hover { background: var(--bg-hover); color: var(--text); }
    }

    .folder-add-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      color: var(--text-muted);
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      background: none;
      font-family: inherit;
      width: 100%;
      text-align: left;
      border-top: 1px solid var(--border);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      touch-action: manipulation;
    }
    .folder-add-btn:active { transform: scale(0.96); }
    @media (hover: hover) {
      .folder-add-btn:hover { color: var(--accent); }
    }
    .folder-add-btn svg { width: 14px; height: 14px; }

    /* ==================== MAIN CONTENT ==================== */
    .main-content {
      margin-left: calc(var(--rail-w) + var(--folder-w));
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      position: relative;
    }

    /* ==================== TOOLBAR ==================== */
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .toolbar-search {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0 12px;
      height: 36px;
      flex: 1;
      min-width: 160px;
      max-width: 320px;
      transition: border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .toolbar-search:focus-within { border-color: var(--accent); }
    .toolbar-search svg { width: 15px; height: 15px; color: var(--text-muted); flex-shrink: 0; }
    .toolbar-search input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: var(--text);
      font-family: inherit;
      font-size: 0.82rem;
    }
    .toolbar-search input::placeholder { color: var(--text-muted); }

    .toolbar-select {
      height: 36px;
      padding: 0 10px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text-dim);
      font-family: inherit;
      font-size: 0.78rem;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      padding-right: 28px;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .toolbar-select:focus { border-color: var(--accent); outline: none; }

    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
    }

    .view-toggle {
      display: flex;
      align-items: center;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .view-toggle-btn {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: none;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .view-toggle-btn.active { background: var(--bg-hover); color: var(--text); }
    @media (hover: hover) {
      .view-toggle-btn:hover { color: var(--text); }
    }
    .view-toggle-btn svg { width: 16px; height: 16px; }

    .upload-btn {
      height: 36px;
      padding: 0 14px;
      background: var(--accent);
      color: #000;
      border: none;
      border-radius: var(--radius-sm);
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      touch-action: manipulation;
    }
    .upload-btn:active { transform: scale(0.96); }
    @media (hover: hover) {
      .upload-btn:hover { background: var(--accent-hover); }
    }
    .upload-btn svg { width: 15px; height: 15px; }

    /* ==================== BULK ACTION BAR ==================== */
    .bulk-bar {
      display: none;
      align-items: center;
      gap: 10px;
      padding: 8px 20px;
      background: var(--accent-soft);
      border-bottom: 1px solid var(--border);
      font-size: 0.8rem;
      color: var(--text);
      animation: fadeInUp 0.2s ease;
    }
    .bulk-bar.visible { display: flex; }
    .bulk-bar-count { font-weight: 600; color: var(--accent); }
    .bulk-bar-btn {
      padding: 4px 10px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-dim);
      font-family: inherit;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @media (hover: hover) {
      .bulk-bar-btn:hover { color: var(--text); border-color: var(--text-muted); }
    }
    .bulk-bar-btn.danger { color: var(--danger); }
    .bulk-bar-cancel {
      margin-left: auto;
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-family: inherit;
      font-size: 0.78rem;
    }

    /* ==================== FILE GRID ==================== */
    .file-area {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }

    .file-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }

    .file-card {
      background: var(--bg-alt);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      overflow: hidden;
      position: relative;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      touch-action: manipulation;
      opacity: 0;
      animation: fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .file-card:active { transform: scale(0.96); }
    @media (hover: hover) {
      .file-card:hover {
        border-color: var(--accent);
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px var(--accent-glow);
      }
    }

    .file-card-check {
      position: absolute;
      top: 8px;
      left: 8px;
      width: 20px;
      height: 20px;
      border-radius: 6px;
      border: 1.5px solid rgba(255,255,255,0.2);
      background: rgba(0,0,0,0.4);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 5;
      cursor: pointer;
      transition: all 0.15s;
    }
    .file-card-check.visible { display: flex; }
    .file-card-check.checked {
      background: var(--accent);
      border-color: var(--accent);
    }
    .file-card-check svg { width: 12px; height: 12px; color: #000; opacity: 0; }
    .file-card-check.checked svg { opacity: 1; }

    .file-card-thumb {
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }
    .file-card-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .file-card-thumb .type-icon {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .file-card-thumb .type-icon-badge {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .file-card-info {
      padding: 10px 12px;
    }
    .file-card-name {
      font-size: 0.82rem;
      font-weight: 500;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
    }
    .file-card-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      font-size: 0.72rem;
      color: var(--text-dim);
    }
    .file-card-type-badge {
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .file-card-star {
      position: absolute;
      top: 8px;
      right: 8px;
      color: var(--accent);
      font-size: 0.85rem;
      display: none;
    }
    .file-card-star.visible { display: block; }

    /* ==================== FILE LIST (table) ==================== */
    .file-list-header {
      display: none;
      grid-template-columns: 28px 1fr 72px 100px 72px 100px 60px;
      gap: 8px;
      padding: 8px 12px;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      user-select: none;
    }
    .file-list-header.active { display: grid; }
    .file-list-header span { display: flex; align-items: center; gap: 4px; }
    @media (hover: hover) {
      .file-list-header span:hover { color: var(--text-dim); }
    }

    .file-list-row {
      display: grid;
      grid-template-columns: 28px 1fr 72px 100px 72px 100px 60px;
      gap: 8px;
      padding: 6px 12px;
      align-items: center;
      min-height: 44px;
      font-size: 0.8rem;
      color: var(--text-dim);
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: all 0.15s;
      touch-action: manipulation;
      opacity: 0;
      animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .file-list-row:active { background: var(--bg-hover); }
    @media (hover: hover) {
      .file-list-row:hover { background: var(--bg-hover); }
    }
    .file-list-row .row-icon {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.55rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .file-list-row .row-name {
      font-weight: 500;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-list-row .row-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .row-action-btn {
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: none;
      color: var(--text-muted);
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.15s;
    }
    @media (hover: hover) {
      .row-action-btn:hover { background: var(--bg-hover); color: var(--text); }
    }
    .row-action-btn svg { width: 14px; height: 14px; }

    /* ==================== DETAIL PANEL ==================== */
    .detail-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 80;
    }
    .detail-overlay.open { display: block; }

    .detail-panel {
      position: fixed;
      right: 0; top: 0; bottom: 0;
      width: var(--detail-w);
      background: var(--bg);
      border-left: 1px solid var(--border);
      z-index: 90;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      opacity: 0;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
      overflow-y: auto;
    }
    .detail-panel.open {
      transform: translateX(0);
      opacity: 1;
    }

    .detail-close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: var(--bg-hover);
      color: var(--text-dim);
      cursor: pointer;
      border-radius: 8px;
      z-index: 5;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @media (hover: hover) {
      .detail-close:hover { background: var(--border-solid); color: var(--text); }
    }
    .detail-close svg { width: 16px; height: 16px; }

    .detail-preview {
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-alt);
      border-bottom: 1px solid var(--border);
      overflow: hidden;
    }
    .detail-preview img {
      max-width: 100%;
      max-height: 300px;
      object-fit: contain;
    }
    .detail-preview .type-icon {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .detail-preview .type-icon-badge {
      width: 64px;
      height: 64px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .detail-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 16px; }

    .detail-filename {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text);
      cursor: text;
      padding: 4px 0;
      border-bottom: 1px solid transparent;
      transition: border-color 0.2s;
      word-break: break-word;
    }
    .detail-filename:hover { border-bottom-color: var(--border); }
    .detail-filename-input {
      width: 100%;
      font-size: 1rem;
      font-weight: 600;
      color: var(--text);
      background: var(--bg-input);
      border: 1px solid var(--accent);
      border-radius: 8px;
      padding: 6px 10px;
      font-family: inherit;
      outline: none;
    }

    .detail-meta { display: flex; flex-direction: column; gap: 8px; }
    .detail-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.8rem;
    }
    .detail-meta-label { color: var(--text-muted); }
    .detail-meta-value { color: var(--text-dim); font-weight: 500; }

    .detail-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .detail-tag {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      background: var(--bg-hover);
      border-radius: 20px;
      font-size: 0.72rem;
      color: var(--text-dim);
    }
    .detail-tag-remove {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.85rem;
      line-height: 1;
      padding: 0;
    }
    @media (hover: hover) {
      .detail-tag-remove:hover { color: var(--danger); }
    }
    .detail-tag-add {
      padding: 3px 10px;
      background: none;
      border: 1px dashed var(--border);
      border-radius: 20px;
      font-size: 0.72rem;
      color: var(--text-muted);
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @media (hover: hover) {
      .detail-tag-add:hover { border-color: var(--accent); color: var(--accent); }
    }

    .detail-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .detail-action-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: var(--bg-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text-dim);
      font-family: inherit;
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      touch-action: manipulation;
      text-decoration: none;
    }
    .detail-action-btn:active { transform: scale(0.96); }
    @media (hover: hover) {
      .detail-action-btn:hover { background: var(--bg-hover); color: var(--text); border-color: rgba(255,255,255,0.12); }
    }
    .detail-action-btn svg { width: 16px; height: 16px; flex-shrink: 0; }
    .detail-action-btn.danger { color: var(--danger); }
    .detail-action-btn.accent { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
    @media (hover: hover) {
      .detail-action-btn.accent:hover { background: var(--accent-glow); }
    }

    .detail-move-dropdown {
      display: none;
      flex-direction: column;
      gap: 2px;
      padding: 6px;
      background: var(--bg-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      margin-top: -4px;
    }
    .detail-move-dropdown.open { display: flex; }
    .detail-move-option {
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 0.78rem;
      color: var(--text-dim);
      cursor: pointer;
      border: none;
      background: none;
      font-family: inherit;
      text-align: left;
      transition: all 0.15s;
    }
    @media (hover: hover) {
      .detail-move-option:hover { background: var(--bg-hover); color: var(--text); }
    }

    /* ==================== EMPTY STATES ==================== */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 60px 20px;
      text-align: center;
      animation: fadeInUp 0.4s ease;
    }
    .empty-state-icon {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: var(--accent-soft);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }
    .empty-state-icon svg { width: 24px; height: 24px; }
    .empty-state-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text);
    }
    .empty-state-text {
      font-size: 0.82rem;
      color: var(--text-muted);
      max-width: 280px;
      line-height: 1.5;
    }
    .empty-state-btn {
      padding: 8px 18px;
      background: var(--accent);
      color: #000;
      border: none;
      border-radius: 10px;
      font-family: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 4px;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @media (hover: hover) {
      .empty-state-btn:hover { background: var(--accent-hover); }
    }

    .empty-state-link {
      background: none;
      border: none;
      color: var(--accent);
      font-family: inherit;
      font-size: 0.82rem;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    /* ==================== LOAD MORE ==================== */
    .load-more-wrap {
      display: flex;
      justify-content: center;
      padding: 16px;
    }
    .load-more-btn {
      padding: 8px 24px;
      background: var(--bg-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text-dim);
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @media (hover: hover) {
      .load-more-btn:hover { border-color: var(--accent); color: var(--text); }
    }

    /* ==================== MOBILE HAMBURGER ==================== */
    .mobile-hamburger {
      display: none;
      position: fixed;
      top: 10px;
      left: 10px;
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: var(--bg-alt);
      border: 1px solid var(--border);
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 70;
      color: var(--text-dim);
      touch-action: manipulation;
    }
    .mobile-hamburger svg { width: 18px; height: 18px; }

    .folder-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 45;
    }
    .folder-overlay.open { display: block; }

    /* ==================== CONFIRM DIALOG ==================== */
    .confirm-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 200;
      align-items: center;
      justify-content: center;
    }
    .confirm-overlay.open { display: flex; }
    .confirm-dialog {
      background: var(--bg-alt);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      max-width: 340px;
      width: 90%;
      animation: scaleIn 0.2s ease;
    }
    .confirm-title { font-size: 0.95rem; font-weight: 600; margin-bottom: 8px; }
    .confirm-text { font-size: 0.82rem; color: var(--text-dim); margin-bottom: 16px; line-height: 1.5; }
    .confirm-buttons { display: flex; gap: 8px; justify-content: flex-end; }
    .confirm-btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border);
      transition: all 0.15s;
    }
    .confirm-cancel { background: var(--bg-input); color: var(--text-dim); }
    .confirm-danger { background: var(--danger); color: #fff; border-color: var(--danger); }

    /* ==================== MOBILE RESPONSIVE ==================== */
    @media (max-width: 768px) {
      .sidebar-rail { display: none; }
      .mobile-hamburger { display: flex; }

      .folder-sidebar {
        left: 0;
        width: 260px;
        transform: translateX(-100%);
        opacity: 0;
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
        z-index: 50;
      }
      .folder-sidebar.open {
        transform: translateX(0);
        opacity: 1;
      }

      .main-content {
        margin-left: 0;
        padding-top: 52px;
      }

      .toolbar {
        padding: 8px 12px;
        gap: 6px;
      }
      .toolbar-search { max-width: none; }

      .file-grid {
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 8px;
      }

      .file-area { padding: 12px; }

      .file-list-header,
      .file-list-row {
        grid-template-columns: 24px 1fr 60px 60px;
      }
      .file-list-header span:nth-child(4),
      .file-list-header span:nth-child(5),
      .file-list-header span:nth-child(7),
      .file-list-row > :nth-child(4),
      .file-list-row > :nth-child(5),
      .file-list-row > :nth-child(7) {
        display: none;
      }

      .detail-panel {
        width: 100%;
        top: auto;
        bottom: 0;
        max-height: 85vh;
        border-radius: var(--radius) var(--radius) 0 0;
        border-left: none;
        border-top: 1px solid var(--border);
        transform: translateY(100%);
      }
      .detail-panel.open {
        transform: translateY(0);
      }
    }

    @media (min-width: 769px) {
      .mobile-hamburger { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="app">
    <!-- Mobile hamburger -->
    <button class="mobile-hamburger" onclick="toggleFolderSidebar()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>

    <!-- Folder overlay (mobile) -->
    <div class="folder-overlay" id="folder-overlay" onclick="closeFolderSidebar()"></div>

    <!-- Sidebar Rail -->
    <nav class="sidebar-rail">
      <div class="rail-logo" title="${INSTANCE_NAME}" onclick="window.location.href='/'">
        \u2726
      </div>
      <div class="rail-nav">
        <button class="rail-btn" onclick="window.location.href='/'" title="Chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button class="rail-btn active" title="Vault">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M10 6V2h4v4"/></svg>
        </button>
        <button class="rail-btn" onclick="window.location.href='/reports'" title="Reports">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </button>
        ${isAdmin ? `<button class="rail-btn" onclick="window.location.href='/mission'" title="Mission Control"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></button>` : ''}
      </div>
      <div class="rail-bottom">
        ${isAdmin ? `<button class="rail-btn" onclick="window.location.href='/admin/brain-health'" title="Brain Health"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></button>` : ''}
        <div class="rail-avatar" title="${user.name || user.email}">
          ${(user.name || user.email || '?')[0].toUpperCase()}
        </div>
      </div>
    </nav>

    <!-- Folder Sidebar -->
    <aside class="folder-sidebar" id="folder-sidebar">
      <div class="folder-header">
        <span class="sparkle">\u2726</span> Vault
      </div>
      <div class="folder-list" id="folder-list"></div>
      <button class="folder-add-btn" onclick="createFolder()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Folder
      </button>
    </aside>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="search-input" placeholder="Search files..." oninput="onSearchInput()" />
        </div>
        <select class="toolbar-select" id="type-filter" onchange="setFilter('type', this.value)">
          <option value="">All Types</option>
          <option value="pdf">PDF</option>
          <option value="pptx">PPTX</option>
          <option value="docx">DOCX</option>
          <option value="xlsx">XLSX</option>
          <option value="csv">CSV</option>
          <option value="image">Image</option>
          <option value="chart">Chart</option>
          <option value="text">Text</option>
        </select>
        <select class="toolbar-select" id="source-filter" onchange="setFilter('source', this.value)">
          <option value="">All Sources</option>
          <option value="upload">Uploads</option>
          <option value="generated">Generated</option>
        </select>
        <div class="toolbar-right">
          <select class="toolbar-select" id="sort-select" onchange="setSort(this.value)">
            <option value="created_at-desc">Newest</option>
            <option value="created_at-asc">Oldest</option>
            <option value="filename-asc">Name A-Z</option>
            <option value="filename-desc">Name Z-A</option>
            <option value="file_size-desc">Largest</option>
          </select>
          <div class="view-toggle">
            <button class="view-toggle-btn active" id="view-grid-btn" onclick="switchView('grid')" title="Grid view">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </button>
            <button class="view-toggle-btn" id="view-list-btn" onclick="switchView('list')" title="List view">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
          <button class="upload-btn" onclick="uploadFromVault()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload
          </button>
        </div>
      </div>

      <!-- Bulk action bar -->
      <div class="bulk-bar" id="bulk-bar">
        <span class="bulk-bar-count" id="bulk-count">0</span> selected
        <button class="bulk-bar-btn" onclick="bulkMove()">Move</button>
        <button class="bulk-bar-btn" onclick="bulkStar()">Star</button>
        <button class="bulk-bar-btn danger" onclick="bulkDelete()">Delete</button>
        <button class="bulk-bar-cancel" onclick="clearSelection()">Cancel</button>
      </div>

      <!-- File area -->
      <div class="file-area" id="file-area">
        <div class="file-grid" id="file-grid"></div>
        <div class="file-list-header" id="file-list-header">
          <span></span>
          <span onclick="setSort('filename-asc')">Name</span>
          <span onclick="setSort('file_type-asc')">Type</span>
          <span>Folder</span>
          <span onclick="setSort('file_size-desc')">Size</span>
          <span onclick="setSort('created_at-desc')">Date</span>
          <span></span>
        </div>
        <div id="file-list-body"></div>
        <div class="load-more-wrap" id="load-more-wrap" style="display:none">
          <button class="load-more-btn" onclick="loadMore()">Load More</button>
        </div>
      </div>
    </div>

    <!-- Detail overlay -->
    <div class="detail-overlay" id="detail-overlay" onclick="closeDetail()"></div>

    <!-- Detail panel -->
    <div class="detail-panel" id="detail-panel">
      <button class="detail-close" onclick="closeDetail()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="detail-preview" id="detail-preview"></div>
      <div class="detail-body" id="detail-body"></div>
    </div>

    <!-- Confirm dialog -->
    <div class="confirm-overlay" id="confirm-overlay">
      <div class="confirm-dialog">
        <div class="confirm-title" id="confirm-title"></div>
        <div class="confirm-text" id="confirm-text"></div>
        <div class="confirm-buttons">
          <button class="confirm-btn confirm-cancel" onclick="closeConfirm()">Cancel</button>
          <button class="confirm-btn confirm-danger" id="confirm-action">Confirm</button>
        </div>
      </div>
    </div>

    <!-- Hidden file input -->
    <input type="file" id="file-input" multiple style="display:none" onchange="handleFileUpload(this.files)" />
  </div>

  <script>
    /* ==================== STATE ==================== */
    var vaultItems = [];
    var folders = [];
    var stats = { total: 0, byType: {}, bySource: {}, starred: 0 };
    var currentFolder = null;
    var currentView = localStorage.getItem('vault-view') || 'grid';
    var selectedIds = new Set();
    var activeDetailItem = null;
    var searchTimeout = null;
    var filters = { type: '', source: '', q: '', starred: false };
    var sortField = 'created_at';
    var sortOrder = 'desc';
    var offset = 0;
    var total = 0;
    var PAGE_SIZE = 50;

    /* ==================== TYPE CONFIG ==================== */
    var TYPE_COLORS = {
      pdf: '#ef4444',
      pptx: '#f97316',
      docx: '#3b82f6',
      xlsx: '#22c55e',
      csv: '#22c55e',
      chart: '#a855f7',
      image: '#06b6d4',
      text: '#9ca3af',
      other: '#6b7280'
    };

    function getTypeColor(type) {
      return TYPE_COLORS[type] || TYPE_COLORS.other;
    }

    function getTypeLabel(type) {
      if (!type) return 'FILE';
      var labels = { pdf: 'PDF', pptx: 'PPTX', docx: 'DOCX', xlsx: 'XLSX', csv: 'CSV', chart: 'CHART', image: 'IMG', text: 'TXT' };
      return labels[type] || type.toUpperCase().slice(0, 4);
    }

    function isImageType(item) {
      if (item.file_type === 'image') return true;
      if (item.mime_type && item.mime_type.startsWith('image/')) return true;
      return false;
    }

    function formatSize(bytes) {
      if (!bytes || bytes === 0) return '--';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatDate(dateStr) {
      if (!dateStr) return '--';
      var d = new Date(dateStr);
      var now = new Date();
      var diff = now - d;
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
      var opts = { month: 'short', day: 'numeric' };
      if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
      return d.toLocaleDateString('en-US', opts);
    }

    /* ==================== UTILS ==================== */
    function escHtml(str) {
      if (!str) return '';
      var div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    }

    /* ==================== API ==================== */
    function apiFetch(url, options) {
      options = options || {};
      var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
      // Remove Content-Type for FormData
      if (options.body instanceof FormData) delete headers['Content-Type'];
      return fetch(url, Object.assign({}, options, { headers: headers }))
        .then(function(res) {
          if (!res.ok) {
            return res.json().catch(function() { return { error: 'Request failed' }; }).then(function(err) {
              throw new Error(err.error || 'Request failed');
            });
          }
          return res.json();
        });
    }

    function loadVaultItems(append) {
      var params = new URLSearchParams();
      if (filters.type) params.set('type', filters.type);
      if (filters.source) params.set('source', filters.source);
      if (filters.q) params.set('q', filters.q);
      if (filters.starred) params.set('starred', 'true');
      if (currentFolder) params.set('folder', currentFolder);
      params.set('sort', sortField);
      params.set('order', sortOrder);
      params.set('limit', PAGE_SIZE);
      params.set('offset', append ? offset : 0);

      return apiFetch('/api/vault?' + params.toString())
        .then(function(data) {
          if (append) {
            vaultItems = vaultItems.concat(data.items);
          } else {
            vaultItems = data.items;
            offset = 0;
          }
          total = data.total;
          offset = vaultItems.length;
          renderFiles();
        })
        .catch(function(err) {
          console.error('Failed to load vault items:', err);
        });
    }

    function loadFolders() {
      return apiFetch('/api/vault/folders')
        .then(function(data) {
          folders = data.folders || [];
          renderFolders();
        })
        .catch(function(err) {
          console.error('Failed to load folders:', err);
        });
    }

    function loadStats() {
      return apiFetch('/api/vault/stats')
        .then(function(data) {
          stats = data;
          renderFolderCounts();
        })
        .catch(function(err) {
          console.error('Failed to load stats:', err);
        });
    }

    /* ==================== RENDER: FOLDERS ==================== */
    function renderFolders() {
      var list = document.getElementById('folder-list');
      var html = '';

      html += folderItemHtml(null, 'All Files', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>');
      html += folderItemHtml('__starred__', 'Starred', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>');

      for (var i = 0; i < folders.length; i++) {
        html += folderItemHtml(folders[i].name, folders[i].name, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>');
      }

      list.textContent = '';
      list.insertAdjacentHTML('beforeend', html);
      renderFolderCounts();
    }

    function folderItemHtml(key, label, icon) {
      var active = (key === null && !currentFolder && !filters.starred) ||
                   (key === '__starred__' && filters.starred) ||
                   (key !== null && key !== '__starred__' && currentFolder === key);
      var escapedLabel = escHtml(label);
      var dataFolder = key || 'all';
      var onclick = key === null ? 'selectFolder(null)' : "selectFolder('" + escHtml(key) + "')";
      return '<button class="folder-item' + (active ? ' active' : '') + '" onclick="' + onclick + '">' +
        icon + ' ' + escapedLabel +
        '<span class="folder-count" data-folder="' + escHtml(dataFolder) + '"></span></button>';
    }

    function renderFolderCounts() {
      var allCount = document.querySelector('[data-folder="all"]');
      if (allCount) allCount.textContent = stats.total || '';

      var starredCount = document.querySelector('[data-folder="__starred__"]');
      if (starredCount) starredCount.textContent = stats.starred || '';
    }

    function selectFolder(key) {
      if (key === '__starred__') {
        currentFolder = null;
        filters.starred = true;
      } else {
        currentFolder = key;
        filters.starred = false;
      }
      loadVaultItems();
      renderFolders();
      closeFolderSidebar();
    }

    /* ==================== RENDER: FILES ==================== */
    function renderFiles() {
      var grid = document.getElementById('file-grid');
      var listHeader = document.getElementById('file-list-header');
      var listBody = document.getElementById('file-list-body');
      var loadMoreWrap = document.getElementById('load-more-wrap');

      // Remove any existing empty state
      var emptyEl = document.getElementById('empty-state');
      if (emptyEl) emptyEl.remove();

      if (vaultItems.length === 0) {
        grid.textContent = '';
        grid.style.display = 'none';
        listHeader.classList.remove('active');
        listBody.textContent = '';
        loadMoreWrap.style.display = 'none';

        var hasFilters = filters.type || filters.source || filters.q;
        var area = document.getElementById('file-area');
        var emptyDiv = document.createElement('div');
        emptyDiv.id = 'empty-state';
        emptyDiv.className = 'empty-state';

        if (hasFilters) {
          emptyDiv.innerHTML = '<div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><div class="empty-state-title">No files match your filters</div><div class="empty-state-text">Try adjusting your search or filter criteria.</div><button class="empty-state-link" onclick="clearFilters()">Clear all filters</button>';
        } else if (currentFolder && currentFolder !== 'All Files') {
          emptyDiv.innerHTML = '<div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div><div class="empty-state-title">This folder is empty</div><div class="empty-state-text">Move files here from the main view or upload new ones.</div>';
        } else {
          emptyDiv.innerHTML = '<div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M10 6V2h4v4"/></svg></div><div class="empty-state-title">Your vault is empty</div><div class="empty-state-text">Upload files or generate content in chat to start building your vault.</div><button class="empty-state-btn" onclick="uploadFromVault()">Upload Files</button>';
        }
        area.insertBefore(emptyDiv, area.firstChild);
        return;
      }

      loadMoreWrap.style.display = offset < total ? 'flex' : 'none';

      if (currentView === 'grid') {
        grid.style.display = 'grid';
        listHeader.classList.remove('active');
        listBody.textContent = '';
        var gridHtml = '';
        for (var i = 0; i < vaultItems.length; i++) {
          gridHtml += renderGridCard(vaultItems[i], i);
        }
        grid.textContent = '';
        grid.insertAdjacentHTML('beforeend', gridHtml);
      } else {
        grid.style.display = 'none';
        grid.textContent = '';
        listHeader.classList.add('active');
        var listHtml = '';
        for (var j = 0; j < vaultItems.length; j++) {
          listHtml += renderListRow(vaultItems[j], j);
        }
        listBody.textContent = '';
        listBody.insertAdjacentHTML('beforeend', listHtml);
      }
    }

    function renderGridCard(item, index) {
      var color = getTypeColor(item.file_type);
      var label = getTypeLabel(item.file_type);
      var delay = Math.min(index * 0.03, 0.5);
      var checked = selectedIds.has(item.id);
      var showCheck = selectedIds.size > 0;

      var thumb;
      if (isImageType(item) && item.file_url) {
        thumb = '<img src="' + escHtml(item.file_url) + '" alt="" loading="lazy" />';
      } else {
        thumb = '<div class="type-icon"><div class="type-icon-badge" style="background:' + color + '20;color:' + color + '">' + label + '</div></div>';
      }

      return '<div class="file-card" style="animation-delay:' + delay + 's" onclick="onCardClick(event, \\'' + item.id + '\\')">' +
        '<div class="file-card-check ' + (showCheck ? 'visible ' : '') + (checked ? 'checked' : '') + '" onclick="event.stopPropagation(); toggleSelect(\\'' + item.id + '\\')">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' +
        '</div>' +
        (item.starred ? '<span class="file-card-star visible">&#9733;</span>' : '') +
        '<div class="file-card-thumb" style="background:' + color + '08">' + thumb + '</div>' +
        '<div class="file-card-info">' +
          '<div class="file-card-name">' + escHtml(item.filename || 'Untitled') + '</div>' +
          '<div class="file-card-meta">' +
            '<span class="file-card-type-badge" style="background:' + color + '18;color:' + color + '">' + label + '</span>' +
            '<span>' + formatDate(item.created_at) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    function renderListRow(item, index) {
      var color = getTypeColor(item.file_type);
      var label = getTypeLabel(item.file_type);
      var delay = Math.min(index * 0.03, 0.5);
      var starFill = item.starred ? 'var(--accent)' : 'none';

      return '<div class="file-list-row" style="animation-delay:' + delay + 's" onclick="openDetail(vaultItems[' + index + '])">' +
        '<div class="row-icon" style="background:' + color + '20;color:' + color + '">' + label.slice(0, 3) + '</div>' +
        '<div class="row-name">' + escHtml(item.filename || 'Untitled') + '</div>' +
        '<span>' + label + '</span>' +
        '<span>' + escHtml(item.folder || 'All Files') + '</span>' +
        '<span>' + formatSize(item.file_size) + '</span>' +
        '<span>' + formatDate(item.created_at) + '</span>' +
        '<div class="row-actions">' +
          '<button class="row-action-btn" onclick="event.stopPropagation(); toggleStar(\\'' + item.id + '\\')" title="Star"><svg viewBox="0 0 24 24" fill="' + starFill + '" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>' +
        '</div>' +
      '</div>';
    }

    /* ==================== DETAIL PANEL ==================== */
    function openDetail(item) {
      activeDetailItem = item;
      var panel = document.getElementById('detail-panel');
      var overlay = document.getElementById('detail-overlay');
      var preview = document.getElementById('detail-preview');
      var body = document.getElementById('detail-body');

      var color = getTypeColor(item.file_type);
      var label = getTypeLabel(item.file_type);

      // Preview
      if (isImageType(item) && item.file_url) {
        preview.textContent = '';
        var img = document.createElement('img');
        img.src = item.file_url;
        img.alt = '';
        preview.appendChild(img);
      } else {
        preview.textContent = '';
        preview.insertAdjacentHTML('beforeend', '<div class="type-icon"><div class="type-icon-badge" style="background:' + color + '20;color:' + color + '">' + label + '</div><span style="font-size:0.75rem;color:var(--text-muted)">' + label + ' Document</span></div>');
      }

      // Tags
      var tags = Array.isArray(item.tags) ? item.tags : [];
      var tagsHtml = '<div class="detail-tags">';
      for (var t = 0; t < tags.length; t++) {
        var tagEsc = escHtml(tags[t]);
        tagsHtml += '<span class="detail-tag">' + tagEsc + '<button class="detail-tag-remove" onclick="removeTag(\\'' + item.id + '\\', \\'' + tagEsc + '\\')">&times;</button></span>';
      }
      tagsHtml += '<button class="detail-tag-add" onclick="addTag(\\'' + item.id + '\\')">+ Add tag</button></div>';

      // Open in chat link
      var sourceRef = item.source_ref || '';
      var canOpenInChat = sourceRef.indexOf('conv-') === 0;
      var chatLink = canOpenInChat
        ? '<button class="detail-action-btn accent" onclick="window.location.href=\\'/chat/' + escHtml(sourceRef.replace('conv-', '')) + '\\'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Open in Chat</button>'
        : '';

      var starFill = item.starred ? 'var(--accent)' : 'none';
      var starLabel = item.starred ? 'Unstar' : 'Star';

      var createdDate = item.created_at
        ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '--';

      var downloadBtn = item.file_url
        ? '<a class="detail-action-btn" href="' + escHtml(item.file_url) + '" download="' + escHtml(item.filename || 'file') + '" style="text-decoration:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</a>'
        : '';

      body.textContent = '';
      body.insertAdjacentHTML('beforeend',
        '<div class="detail-filename" id="detail-filename" onclick="startRename(\\'' + item.id + '\\')">' + escHtml(item.filename || 'Untitled') + '</div>' +
        '<div class="detail-meta">' +
          metaRow('Type', label) +
          metaRow('Size', formatSize(item.file_size)) +
          metaRow('Source', escHtml(item.source || 'Unknown')) +
          metaRow('Folder', escHtml(item.folder || 'All Files')) +
          metaRow('Created', createdDate) +
        '</div>' +
        tagsHtml +
        '<div class="detail-actions">' +
          downloadBtn +
          '<button class="detail-action-btn" onclick="toggleMoveDropdown()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Move to Folder</button>' +
          '<div class="detail-move-dropdown" id="detail-move-dropdown"></div>' +
          '<button class="detail-action-btn" onclick="toggleStar(\\'' + item.id + '\\')"><svg viewBox="0 0 24 24" fill="' + starFill + '" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' + starLabel + '</button>' +
          chatLink +
          '<button class="detail-action-btn danger" onclick="deleteItem(\\'' + item.id + '\\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</button>' +
        '</div>'
      );

      panel.classList.add('open');
      overlay.classList.add('open');
    }

    function metaRow(label, value) {
      return '<div class="detail-meta-row"><span class="detail-meta-label">' + label + '</span><span class="detail-meta-value">' + value + '</span></div>';
    }

    function closeDetail() {
      activeDetailItem = null;
      document.getElementById('detail-panel').classList.remove('open');
      document.getElementById('detail-overlay').classList.remove('open');
    }

    function toggleMoveDropdown() {
      var dd = document.getElementById('detail-move-dropdown');
      if (dd.classList.contains('open')) {
        dd.classList.remove('open');
        return;
      }
      var html = '<button class="detail-move-option" onclick="moveToFolder(\\'' + activeDetailItem.id + '\\', \\'All Files\\')">All Files</button>';
      for (var i = 0; i < folders.length; i++) {
        html += '<button class="detail-move-option" onclick="moveToFolder(\\'' + activeDetailItem.id + '\\', \\'' + escHtml(folders[i].name) + '\\')">' + escHtml(folders[i].name) + '</button>';
      }
      dd.textContent = '';
      dd.insertAdjacentHTML('beforeend', html);
      dd.classList.add('open');
    }

    /* ==================== ACTIONS ==================== */
    function createFolder() {
      var name = prompt('Folder name:');
      if (!name || !name.trim()) return;
      apiFetch('/api/vault/folders', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() })
      })
      .then(function() {
        return Promise.all([loadFolders(), loadStats()]);
      })
      .catch(function(err) {
        alert('Failed to create folder: ' + err.message);
      });
    }

    function deleteItem(id) {
      showConfirm('Delete File', 'This file will be permanently removed from your vault.', function() {
        return apiFetch('/api/vault/' + id, { method: 'DELETE' })
          .then(function() {
            closeDetail();
            return Promise.all([loadVaultItems(), loadStats()]);
          })
          .catch(function(err) {
            alert('Failed to delete: ' + err.message);
          });
      });
    }

    function startRename(id) {
      var el = document.getElementById('detail-filename');
      if (!el || !activeDetailItem) return;
      var currentName = activeDetailItem.filename || '';
      var input = document.createElement('input');
      input.className = 'detail-filename-input';
      input.id = 'detail-filename-input';
      input.value = currentName;
      input.addEventListener('blur', function() { finishRename(id); });
      input.addEventListener('keydown', function(e) { if (e.key === 'Enter') this.blur(); });
      el.parentNode.replaceChild(input, el);
      input.focus();
      input.select();
    }

    function finishRename(id) {
      var input = document.getElementById('detail-filename-input');
      if (!input) return;
      var newName = input.value.trim();
      if (!newName || newName === (activeDetailItem && activeDetailItem.filename)) {
        if (activeDetailItem) openDetail(activeDetailItem);
        return;
      }
      apiFetch('/api/vault/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ filename: newName })
      })
      .then(function(updated) {
        var idx = vaultItems.findIndex(function(v) { return v.id === id; });
        if (idx !== -1) vaultItems[idx] = updated;
        if (activeDetailItem && activeDetailItem.id === id) activeDetailItem = updated;
        openDetail(updated);
        renderFiles();
      })
      .catch(function(err) {
        alert('Failed to rename: ' + err.message);
      });
    }

    function moveToFolder(id, folder) {
      apiFetch('/api/vault/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ folder: folder })
      })
      .then(function(updated) {
        var idx = vaultItems.findIndex(function(v) { return v.id === id; });
        if (idx !== -1) vaultItems[idx] = updated;
        if (activeDetailItem && activeDetailItem.id === id) {
          activeDetailItem = updated;
          openDetail(updated);
        }
        return Promise.all([loadVaultItems(), loadStats()]);
      })
      .catch(function(err) {
        alert('Failed to move: ' + err.message);
      });
    }

    function toggleStar(id) {
      var item = vaultItems.find(function(v) { return v.id === id; });
      if (!item) return;
      apiFetch('/api/vault/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ starred: !item.starred })
      })
      .then(function(updated) {
        var idx = vaultItems.findIndex(function(v) { return v.id === id; });
        if (idx !== -1) vaultItems[idx] = updated;
        if (activeDetailItem && activeDetailItem.id === id) {
          activeDetailItem = updated;
          openDetail(updated);
        }
        renderFiles();
        return loadStats();
      })
      .catch(function(err) {
        alert('Failed to update: ' + err.message);
      });
    }

    function addTag(id) {
      var tag = prompt('Tag name:');
      if (!tag || !tag.trim()) return;
      var item = vaultItems.find(function(v) { return v.id === id; });
      if (!item) return;
      var existing = Array.isArray(item.tags) ? item.tags : [];
      if (existing.indexOf(tag.trim()) !== -1) return;
      apiFetch('/api/vault/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ tags: existing.concat([tag.trim()]) })
      })
      .then(function(updated) {
        var idx = vaultItems.findIndex(function(v) { return v.id === id; });
        if (idx !== -1) vaultItems[idx] = updated;
        if (activeDetailItem && activeDetailItem.id === id) {
          activeDetailItem = updated;
          openDetail(updated);
        }
      })
      .catch(function(err) {
        alert('Failed to add tag: ' + err.message);
      });
    }

    function removeTag(id, tag) {
      var item = vaultItems.find(function(v) { return v.id === id; });
      if (!item) return;
      var existing = Array.isArray(item.tags) ? item.tags : [];
      apiFetch('/api/vault/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ tags: existing.filter(function(t) { return t !== tag; }) })
      })
      .then(function(updated) {
        var idx = vaultItems.findIndex(function(v) { return v.id === id; });
        if (idx !== -1) vaultItems[idx] = updated;
        if (activeDetailItem && activeDetailItem.id === id) {
          activeDetailItem = updated;
          openDetail(updated);
        }
      })
      .catch(function(err) {
        alert('Failed to remove tag: ' + err.message);
      });
    }

    /* ==================== UPLOAD ==================== */
    function uploadFromVault() {
      document.getElementById('file-input').click();
    }

    function handleFileUpload(fileList) {
      if (!fileList || fileList.length === 0) return;
      var uploads = [];
      for (var i = 0; i < fileList.length; i++) {
        uploads.push((function(file) {
          var formData = new FormData();
          formData.append('file', file);
          return fetch('/api/upload/direct', { method: 'POST', body: formData })
            .then(function(res) {
              if (!res.ok) throw new Error('Upload failed for ' + file.name);
            })
            .catch(function(err) {
              console.error('Upload error:', err);
              alert('Failed to upload ' + file.name);
            });
        })(fileList[i]));
      }
      Promise.all(uploads).then(function() {
        document.getElementById('file-input').value = '';
        return Promise.all([loadVaultItems(), loadStats()]);
      });
    }

    /* ==================== BULK SELECTION ==================== */
    function onCardClick(event, id) {
      if (selectedIds.size > 0) {
        toggleSelect(id);
      } else {
        var item = vaultItems.find(function(v) { return v.id === id; });
        if (item) openDetail(item);
      }
    }

    function toggleSelect(id) {
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
      } else {
        selectedIds.add(id);
      }
      updateBulkBar();
      renderFiles();
    }

    function clearSelection() {
      selectedIds.clear();
      updateBulkBar();
      renderFiles();
    }

    function updateBulkBar() {
      var bar = document.getElementById('bulk-bar');
      var count = document.getElementById('bulk-count');
      if (selectedIds.size > 0) {
        bar.classList.add('visible');
        count.textContent = selectedIds.size;
      } else {
        bar.classList.remove('visible');
      }
    }

    function bulkDelete() {
      if (selectedIds.size === 0) return;
      showConfirm('Delete ' + selectedIds.size + ' files', 'These files will be permanently removed.', function() {
        return apiFetch('/api/vault/bulk', {
          method: 'POST',
          body: JSON.stringify({ action: 'delete', ids: Array.from(selectedIds) })
        })
        .then(function() {
          clearSelection();
          return Promise.all([loadVaultItems(), loadStats()]);
        })
        .catch(function(err) {
          alert('Bulk delete failed: ' + err.message);
        });
      });
    }

    function bulkMove() {
      if (selectedIds.size === 0) return;
      var folderNames = ['All Files'].concat(folders.map(function(f) { return f.name; }));
      var target = prompt('Move to folder:\\n' + folderNames.join('\\n'));
      if (!target) return;
      apiFetch('/api/vault/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'move', ids: Array.from(selectedIds), folder: target })
      })
      .then(function() {
        clearSelection();
        return Promise.all([loadVaultItems(), loadStats()]);
      })
      .catch(function(err) {
        alert('Bulk move failed: ' + err.message);
      });
    }

    function bulkStar() {
      if (selectedIds.size === 0) return;
      apiFetch('/api/vault/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'star', ids: Array.from(selectedIds) })
      })
      .then(function() {
        clearSelection();
        return Promise.all([loadVaultItems(), loadStats()]);
      })
      .catch(function(err) {
        alert('Bulk star failed: ' + err.message);
      });
    }

    /* ==================== VIEW & FILTERS ==================== */
    function switchView(mode) {
      currentView = mode;
      localStorage.setItem('vault-view', mode);
      document.getElementById('view-grid-btn').classList.toggle('active', mode === 'grid');
      document.getElementById('view-list-btn').classList.toggle('active', mode === 'list');
      renderFiles();
    }

    function setFilter(key, value) {
      filters[key] = value;
      loadVaultItems();
    }

    function setSort(val) {
      var parts = val.split('-');
      if (parts.length === 2) {
        sortField = parts[0];
        sortOrder = parts[1];
        document.getElementById('sort-select').value = val;
      }
      loadVaultItems();
    }

    function onSearchInput() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(function() {
        filters.q = document.getElementById('search-input').value.trim();
        loadVaultItems();
      }, 300);
    }

    function clearFilters() {
      filters = { type: '', source: '', q: '', starred: false };
      currentFolder = null;
      document.getElementById('search-input').value = '';
      document.getElementById('type-filter').value = '';
      document.getElementById('source-filter').value = '';
      loadVaultItems();
      renderFolders();
    }

    function loadMore() {
      loadVaultItems(true);
    }

    /* ==================== FOLDER SIDEBAR (mobile) ==================== */
    function toggleFolderSidebar() {
      var sidebar = document.getElementById('folder-sidebar');
      var overlay = document.getElementById('folder-overlay');
      if (sidebar.classList.contains('open')) {
        closeFolderSidebar();
      } else {
        sidebar.classList.add('open');
        overlay.classList.add('open');
      }
    }

    function closeFolderSidebar() {
      document.getElementById('folder-sidebar').classList.remove('open');
      document.getElementById('folder-overlay').classList.remove('open');
    }

    /* ==================== CONFIRM DIALOG ==================== */
    var confirmCallback = null;

    function showConfirm(title, text, onConfirm) {
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-text').textContent = text;
      confirmCallback = onConfirm;
      document.getElementById('confirm-action').onclick = function() {
        closeConfirm();
        if (confirmCallback) confirmCallback();
        confirmCallback = null;
      };
      document.getElementById('confirm-overlay').classList.add('open');
    }

    function closeConfirm() {
      document.getElementById('confirm-overlay').classList.remove('open');
      confirmCallback = null;
    }

    /* ==================== INIT ==================== */
    (function init() {
      if (currentView === 'list') switchView('list');
      Promise.all([loadVaultItems(), loadFolders(), loadStats()]);
    })();
  </script>
</body>
</html>`;
}

module.exports = router;
