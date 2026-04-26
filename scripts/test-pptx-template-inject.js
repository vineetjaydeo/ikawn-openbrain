#!/usr/bin/env node
// scripts/test-pptx-template-inject.js
//
// Stage 2 smoke test: end-to-end exercise of the template-as-master pipeline
// against a real brand's stored training PPTX. Builds a 3-slide pptxgenjs deck
// in-process (title + content + two-column), pulls the brand's template from
// R2, runs injectSlidesIntoTemplate, writes the result, and prints diagnostics
// covering pass criteria 1-3 from tasks/stage-2-template-as-master-plan.md §5.
// Pass criterion #4 (open in PowerPoint, no corruption dialog) is a manual step
// — the script only prints the path so the operator can open it.
//
// Usage:
//   node scripts/test-pptx-template-inject.js --brand-id fedfina --out /tmp/fedfina-derivative.pptx
//
// Env: requires DATABASE_URL + R2_* secrets (loaded via dotenv from .env).

'use strict';

require('dotenv').config();

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');

const { getBrandTemplateUrl } = require('/Users/vineet/ikawn-openbrain/src/services/pptx-template-analyzer');
const { injectSlidesIntoTemplate } = require('/Users/vineet/ikawn-openbrain/src/services/pptx-template-injector');
const { downloadFromUrl } = require('/Users/vineet/ikawn-openbrain/src/utils/storage');
const { pool } = require('/Users/vineet/ikawn-openbrain/src/db');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--brand-id') out.brandId = argv[++i];
    else if (a === '--out') out.out = argv[++i];
  }
  if (!out.brandId) throw new Error('Missing required --brand-id <id>');
  if (!out.out) out.out = `/tmp/${out.brandId}-derivative.pptx`;
  return out;
}

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

async function buildSampleDeck() {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = 'Stage 2 Smoke Test';

  const s1 = pptx.addSlide();
  s1.addText('Smoke test slide 1 (title)', { x: 0.5, y: 2.0, w: 9, h: 1, fontSize: 36, bold: true, color: '0A0F2E' });
  s1.addText('Stage 2 template-as-master', { x: 0.5, y: 3.2, w: 9, h: 0.6, fontSize: 18, color: '6B7280' });

  const s2 = pptx.addSlide();
  s2.addText('Smoke test slide 2 (content)', { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 28, bold: true, color: '0A0F2E' });
  s2.addText([
    { text: 'First bullet for content layout', options: { bullet: true } },
    { text: 'Second bullet to verify body text', options: { bullet: true } },
    { text: 'Third bullet to confirm injection', options: { bullet: true } },
  ], { x: 0.5, y: 1.4, w: 9, h: 4, fontSize: 16, color: '2D2D3F' });

  const s3 = pptx.addSlide();
  s3.addText('Smoke test slide 3 (two-column)', { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 28, bold: true, color: '0A0F2E' });
  s3.addText([
    { text: 'Left column point one', options: { bullet: true } },
    { text: 'Left column point two', options: { bullet: true } },
  ], { x: 0.5, y: 1.4, w: 4.2, h: 4, fontSize: 16, color: '2D2D3F' });
  s3.addText([
    { text: 'Right column point one', options: { bullet: true } },
    { text: 'Right column point two', options: { bullet: true } },
  ], { x: 5.3, y: 1.4, w: 4.2, h: 4, fontSize: 16, color: '2D2D3F' });

  return pptx.write({ outputType: 'nodebuffer' });
}

async function countSlides(buf) {
  const zip = await JSZip.loadAsync(buf);
  return Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).length;
}

async function readPart(buf, partPath) {
  const zip = await JSZip.loadAsync(buf);
  const f = zip.file(partPath);
  return f ? f.async('nodebuffer') : null;
}

async function listNewSlideLayoutTargets(buf, newSlideCount) {
  const zip = await JSZip.loadAsync(buf);
  // Newly injected slides occupy the highest numbered slideN.xml entries.
  const slideNums = Object.keys(zip.files)
    .map(p => p.match(/^ppt\/slides\/slide(\d+)\.xml$/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10))
    .sort((a, b) => a - b);
  const newOnes = slideNums.slice(-newSlideCount);
  const out = [];
  for (const n of newOnes) {
    const relsPath = `ppt/slides/_rels/slide${n}.xml.rels`;
    const f = zip.file(relsPath);
    if (!f) { out.push({ slide: n, target: '(no rels file!)' }); continue; }
    const xml = await f.async('string');
    const m = xml.match(/Type="[^"]*\/slideLayout"\s+Target="([^"]+)"/);
    out.push({ slide: n, target: m ? m[1] : '(no slideLayout rel found)' });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[smoke] brandId=${args.brandId} out=${args.out}`);

  const tmplUrl = await getBrandTemplateUrl(args.brandId);
  if (!tmplUrl) {
    console.error(`[smoke] No template URL for brandId=${args.brandId}`);
    return 1;
  }
  console.log(`[smoke] Template URL: ${tmplUrl}`);

  const templateBuffer = await downloadFromUrl(tmplUrl);
  const templateSlideCount = await countSlides(templateBuffer);
  const templateThemeBuf = await readPart(templateBuffer, 'ppt/theme/theme1.xml');
  console.log(`[smoke] Template buffer: ${templateBuffer.length} bytes, slides=${templateSlideCount}`);

  console.log('[smoke] Building 3-slide pptxgenjs deck...');
  const generatedBuffer = await buildSampleDeck();
  const generatedSlideCount = await countSlides(generatedBuffer);
  console.log(`[smoke] Generated buffer: ${generatedBuffer.length} bytes, slides=${generatedSlideCount}`);

  console.log('[smoke] Injecting...');
  const finalBuffer = await injectSlidesIntoTemplate(templateBuffer, generatedBuffer, {
    slideTypes: ['title', 'content', 'two-column'],
  });

  fs.writeFileSync(args.out, finalBuffer);
  const outputSlideCount = await countSlides(finalBuffer);
  const outputThemeBuf = await readPart(finalBuffer, 'ppt/theme/theme1.xml');
  const layoutTargets = await listNewSlideLayoutTargets(finalBuffer, generatedSlideCount);

  console.log('');
  console.log('────────── Pass-criteria diagnostics ──────────');
  console.log(`Template orig slide count: ${templateSlideCount}`);
  console.log(`Generated new slide count: ${generatedSlideCount}`);
  console.log(`Output total slide count: ${outputSlideCount}   (expect 3 — keepTemplateSlides=false)`);
  console.log(`Template theme1.xml md5: ${templateThemeBuf ? md5(templateThemeBuf) : '(none)'}`);
  console.log(`Output   theme1.xml md5: ${outputThemeBuf ? md5(outputThemeBuf) : '(none)'}   (must match)`);
  for (const row of layoutTargets) {
    console.log(`slide${row.slide}.xml.rels → slideLayout target = ${row.target}`);
  }
  console.log('────────────────────────────────────────────────');
  console.log(`Open ${args.out} in PowerPoint to verify pass criterion #4 (no corruption dialog).`);

  // Hard check: theme1.xml must be byte-identical (criterion #2)
  const themeOk = templateThemeBuf && outputThemeBuf && md5(templateThemeBuf) === md5(outputThemeBuf);
  // Slide count must equal generated count (criterion #1, keepTemplateSlides=false default)
  const countOk = outputSlideCount === generatedSlideCount;
  // Each new slide's rel must point at a real template slideLayout (criterion #3)
  const targetsOk = layoutTargets.every(r => /slideLayouts\/slideLayout\d+\.xml$/.test(r.target));

  if (!themeOk) console.error('[smoke] FAIL: theme1.xml hash mismatch');
  if (!countOk) console.error(`[smoke] FAIL: output slide count ${outputSlideCount} != ${generatedSlideCount}`);
  if (!targetsOk) console.error('[smoke] FAIL: at least one new slide does not reference a template slideLayout');

  return (themeOk && countOk && targetsOk) ? 0 : 1;
}

main()
  .then((code) => pool.end().then(() => process.exit(code)).catch(() => process.exit(code)))
  .catch((err) => {
    console.error('[smoke] Unhandled error:', err && err.stack || err);
    pool.end().catch(() => {}).finally(() => process.exit(1));
  });
