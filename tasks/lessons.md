# OpenBrain Lessons

## 1. Guard all CDN-loaded libraries before use
**Date**: 2026-03-22
**Bug**: All markdown rendering broke — headings, bold, tables, code blocks all showed as raw text.
**Root cause**: highlight.js CDN failed to load. The custom `renderer.code` function in `initMarked()` called `hljs.getLanguage()` without checking if `hljs` existed. This threw `ReferenceError`, which was caught by `renderContent`'s try/catch, falling back to `escapeHtml()` — stripping ALL formatting, not just code highlighting.
**Fix**: Added `typeof hljs !== 'undefined'` guard in `renderer.code`. Now code blocks render without syntax highlighting when hljs is unavailable, but all other markdown still works.
**Rule**: Never reference CDN-loaded globals (`hljs`, `marked`, etc.) without a `typeof X !== 'undefined'` guard. One missing CDN script should degrade gracefully, not break the entire page.
