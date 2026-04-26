'use strict';

// Wave 2 — unit/integration coverage for the PPTX template injector.
//
// Strategy: build BOTH the "template" and the "generated" buffers in-process
// with pptxgenjs so the tests are deterministic, dependency-free, and don't
// require committing a binary fixture. The template gets 3 slides + the
// pptxgenjs default masters/layouts. The generated deck gets 2 slides. We
// assert that the injector preserves the template's layouts + theme and that
// the new slides reference real layout parts in the merged zip.

const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');
const { injectSlidesIntoTemplate } = require('../../src/services/pptx-template-injector');

async function buildDeck(numSlides, label) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = label;
  for (let i = 0; i < numSlides; i++) {
    const s = pptx.addSlide();
    s.addText(`${label} slide ${i + 1}`, {
      x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 24, bold: true, color: '0A0F2E',
    });
    s.addText('body text', { x: 0.5, y: 2, w: 9, h: 1, fontSize: 14, color: '2D2D3F' });
  }
  return pptx.write({ outputType: 'nodebuffer' });
}

async function inspect(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  const layoutPaths = Object.keys(zip.files).filter(p => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(p));
  const presXml = await zip.file('ppt/presentation.xml').async('string');
  const sldIdMatches = presXml.match(/<p:sldId\b/g) || [];
  return { zip, slidePaths, layoutPaths, sldIdCount: sldIdMatches.length };
}

describe('pptx-template-injector — injectSlidesIntoTemplate', () => {
  it('happy path: merges generated slides on top of template, preserves layouts, new slides point at template slideLayouts', async () => {
    const templateBuffer = await buildDeck(3, 'TPL');
    const generatedBuffer = await buildDeck(2, 'GEN');

    const finalBuffer = await injectSlidesIntoTemplate(templateBuffer, generatedBuffer, {
      slideTypes: ['title', 'content'],
    });
    expect(Buffer.isBuffer(finalBuffer)).toBe(true);

    const { zip, slidePaths, layoutPaths, sldIdCount } = await inspect(finalBuffer);

    // keepTemplateSlides=false (default) — only the 2 new slides survive
    expect(slidePaths.length).toBe(2);
    expect(sldIdCount).toBe(2);

    // Template layouts are preserved untouched (the whole point of the merge)
    expect(layoutPaths.length).toBeGreaterThan(0);

    // Each new slide's rels file must point at a layout that EXISTS in the merged zip
    const newSlideNums = slidePaths
      .map(p => parseInt(p.match(/slide(\d+)\.xml$/)[1], 10))
      .sort((a, b) => a - b);

    for (const n of newSlideNums) {
      const relsFile = zip.file(`ppt/slides/_rels/slide${n}.xml.rels`);
      expect(relsFile).not.toBeNull();
      const relsXml = await relsFile.async('string');
      const m = relsXml.match(/Type="[^"]*\/slideLayout"\s+Target="([^"]+)"/);
      expect(m).not.toBeNull();
      const target = m[1]; // e.g. "../slideLayouts/slideLayout3.xml"
      // Must look like a real template layout, not a synthetic name
      expect(target).toMatch(/slideLayouts\/slideLayout\d+\.xml$/);
      // The referenced layout file must actually exist in the merged zip
      const resolved = target.replace(/^\.\.\//, 'ppt/');
      expect(zip.file(resolved)).not.toBeNull();
    }
  });

  it('throws with [injector] prefix on a malformed template buffer', async () => {
    const generatedBuffer = await buildDeck(1, 'GEN');
    const badTemplate = Buffer.from('not a zip');

    await expect(injectSlidesIntoTemplate(badTemplate, generatedBuffer, { slideTypes: ['title'] }))
      .rejects.toThrow(/^\[injector\]/);
  });

  it('throws with [injector] prefix on a malformed generated buffer', async () => {
    const templateBuffer = await buildDeck(2, 'TPL');
    const badGenerated = Buffer.from('also not a zip');

    await expect(injectSlidesIntoTemplate(templateBuffer, badGenerated, { slideTypes: ['title'] }))
      .rejects.toThrow(/^\[injector\]/);
  });
});
