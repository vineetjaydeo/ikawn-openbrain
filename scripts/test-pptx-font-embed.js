#!/usr/bin/env node
// scripts/test-pptx-font-embed.js
//
// Smoke-test for PPTX font embedding without touching the database.
// Builds a minimal pptxgenjs deck, then runs it through embedFonts() with a
// fake "Inter" typeface backed by Andale Mono.ttf. Verifies the output zip
// contains ppt/fonts/ and that <p:embeddedFontLst> is present in
// ppt/presentation.xml.
//
// Run: node /Users/vineet/ikawn-openbrain/scripts/test-pptx-font-embed.js

'use strict';

const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');
const { embedFonts, resolveWebSafeFont } = require('/Users/vineet/ikawn-openbrain/src/services/pptx-font-embedder');

const SYSTEM_FONT = '/System/Library/Fonts/Supplemental/Andale Mono.ttf';
const OUT_PATH = '/tmp/test-brand-deck.pptx';

async function buildSampleDeck() {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = 'Font Embedding Test';

  const slide = pptx.addSlide();
  slide.addText('Brand Deck (Inter)', {
    x: 0.5, y: 0.5, w: 9, h: 1,
    fontSize: 32, bold: true, fontFace: 'Inter', color: '0A0F2E',
  });
  slide.addText('This deck names "Inter" as its heading font. The post-processor should embed the TTF so PowerPoint renders the correct typeface anywhere.', {
    x: 0.5, y: 1.8, w: 9, h: 2,
    fontSize: 16, fontFace: 'Inter', color: '2D2D3F',
  });

  return pptx.write({ outputType: 'nodebuffer' });
}

async function main() {
  console.log('[test] Web-safe fallback for Inter ->', resolveWebSafeFont('Inter'));
  console.log('[test] Web-safe fallback for Roboto ->', resolveWebSafeFont('Roboto'));
  console.log('[test] Web-safe fallback for Calibri ->', resolveWebSafeFont('Calibri'));

  console.log('[test] Building sample deck...');
  const baseBuffer = await buildSampleDeck();
  console.log(`[test] Base deck size: ${baseBuffer.length} bytes`);

  if (!fs.existsSync(SYSTEM_FONT)) {
    console.warn(`[test] System font not found at ${SYSTEM_FONT}, falling back to no-font case`);
    fs.writeFileSync(OUT_PATH, baseBuffer);
    return;
  }

  const fontData = fs.readFileSync(SYSTEM_FONT);
  console.log(`[test] Loaded ${SYSTEM_FONT}: ${fontData.length} bytes`);

  // Pretend Andale Mono is the "Inter" font binary so we can verify the
  // embedding pipeline end-to-end without shipping a third-party font here.
  const embeddedFonts = [
    { typeface: 'Inter', face: 'regular', filename: 'Inter-Regular.ttf', data: fontData },
  ];

  const embeddedBuffer = await embedFonts(baseBuffer, embeddedFonts);
  console.log(`[test] Embedded deck size: ${embeddedBuffer.length} bytes`);

  fs.writeFileSync(OUT_PATH, embeddedBuffer);
  console.log(`[test] Wrote ${OUT_PATH}`);

  // Inspect the zip
  const zip = await JSZip.loadAsync(embeddedBuffer);
  const fontFiles = Object.keys(zip.files).filter(f => f.startsWith('ppt/fonts/'));
  console.log('[test] ppt/fonts/ entries:', fontFiles);

  const presXml = await zip.file('ppt/presentation.xml').async('string');
  const hasFontLst = /<p:embeddedFontLst>/.test(presXml);
  const fontLstSnippet = (presXml.match(/<p:embeddedFontLst>[\s\S]*?<\/p:embeddedFontLst>/) || [])[0];
  console.log('[test] <p:embeddedFontLst> present:', hasFontLst);
  if (fontLstSnippet) console.log('[test] embeddedFontLst snippet:', fontLstSnippet);

  const ctXml = await zip.file('[Content_Types].xml').async('string');
  console.log('[test] Content type for ttf:', /<Default[^>]*Extension="ttf"[^>]*\/>/i.test(ctXml));

  const relsXml = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  const fontRels = (relsXml.match(/Type="[^"]*\/font"/g) || []).length;
  console.log('[test] font Relationship entries:', fontRels);

  // Final pass/fail
  const ok = hasFontLst && fontFiles.length > 0 && fontRels > 0;
  console.log(ok ? '[test] PASS' : '[test] FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error('[test] error:', err);
  process.exit(2);
});
