// src/services/pptx-template-injector.js
'use strict';

/**
 * Build a final brand PPTX by injecting freshly-rendered slides into a stored
 * brand template. The template provides slide masters, theme1.xml, layouts and
 * embedded fonts; the injected slides provide the user content.
 *
 * Pattern mirrors src/services/pptx-font-embedder.js (JSZip load -> regex-mutate
 * XML parts -> re-zip). No new deps. All internal helpers are private and each
 * stays under 40 lines.
 *
 * On any internal failure we throw with a descriptive prefix; the caller (Wave 2
 * generate_pptx.tool.js) decides whether to fall back to fresh-render. Do NOT
 * silently return the unmodified template - that masks corruption.
 */

const JSZip = require('jszip');
const { inferLayoutType } = require('./pptx-template-analyzer');

const NS = {
  SLIDE: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  SLIDE_LAYOUT: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  IMAGE: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  NOTES_SLIDE: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
};

const SLIDE_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';

const MEDIA_DEFAULT_CT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

function escapeXmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadZips(templateBuffer, generatedBuffer) {
  const tmplZip = await JSZip.loadAsync(templateBuffer);
  const genZip = await JSZip.loadAsync(generatedBuffer);
  return { tmplZip, genZip };
}

// Pull every slide + paired rels + referenced media out of the freshly-rendered
// pptxgenjs zip. originalIndex preserves authoring order so the merged deck
// keeps the LLM's intended slide sequence.
async function extractGeneratedSlides(genZip) {
  const slidePaths = Object.keys(genZip.files)
    .filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml$/)[1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml$/)[1], 10);
      return na - nb;
    });

  const out = [];
  for (const slidePath of slidePaths) {
    const idx = parseInt(slidePath.match(/slide(\d+)\.xml$/)[1], 10);
    const slideXml = await genZip.file(slidePath).async('string');
    const relsPath = `ppt/slides/_rels/slide${idx}.xml.rels`;
    const relsFile = genZip.file(relsPath);
    if (!relsFile) throw new Error(`generated slide ${idx} missing rels file ${relsPath}`);
    const relsXml = await relsFile.async('string');
    const mediaFiles = await collectSlideMedia(genZip, relsXml);
    out.push({ originalIndex: idx, slideXml, relsXml, mediaFiles });
  }
  return out;
}

// Walk the slide's rels for image targets and pull each binary out of the gen zip.
async function collectSlideMedia(genZip, relsXml) {
  const media = [];
  const re = /<Relationship[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/gi;
  let m;
  while ((m = re.exec(relsXml)) !== null) {
    if (m[1] !== NS.IMAGE) continue;
    const target = m[2];
    const normalized = target.startsWith('../') ? `ppt/${target.slice(3)}` : target;
    const file = genZip.file(normalized);
    if (!file) continue;
    const data = await file.async('nodebuffer');
    const ext = (normalized.split('.').pop() || 'png').toLowerCase();
    media.push({ originalPath: target, normalizedPath: normalized, ext, data });
  }
  return media;
}

// Inventory the template zip so we know where to splice and which IDs are free.
async function inventoryTemplate(tmplZip) {
  const slideRe = /^ppt\/slides\/slide\d+\.xml$/;
  const slidePaths = Object.keys(tmplZip.files).filter(p => slideRe.test(p));

  const presRelsXml = await readRequired(tmplZip, 'ppt/_rels/presentation.xml.rels');
  const presXml = await readRequired(tmplZip, 'ppt/presentation.xml');

  const existingSlides = parseExistingSlides(presRelsXml, presXml);
  const existingMediaCount = countExistingMedia(tmplZip);
  const layoutsByType = await buildLayoutTypeMap(tmplZip);

  const allRids = [...presRelsXml.matchAll(/Id="rId(\d+)"/g)].map(x => parseInt(x[1], 10));
  const nextRid = (allRids.length ? Math.max(...allRids) : 0) + 1;

  const allSldIds = [...presXml.matchAll(/<p:sldId[^>]*id="(\d+)"/g)].map(x => parseInt(x[1], 10));
  const nextSldId = Math.max(256, (allSldIds.length ? Math.max(...allSldIds) : 255) + 1);

  const hasNotesMaster = !!tmplZip.file('ppt/notesMasters/notesMaster1.xml');

  return {
    slidePaths, existingSlides, existingMediaCount, layoutsByType,
    nextRid, nextSldId, hasNotesMaster, presRelsXml, presXml,
  };
}

async function readRequired(zip, path) {
  const f = zip.file(path);
  if (!f) throw new Error(`template missing required part ${path}`);
  return f.async('string');
}

// Walk presentation.xml.rels for slide rels, then map each rId to the matching
// <p:sldId> row in presentation.xml. Result drives dropExistingSlides().
function parseExistingSlides(presRelsXml, presXml) {
  const rels = [];
  const re = /<Relationship[^>]*Id="(rId\d+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/gi;
  let m;
  while ((m = re.exec(presRelsXml)) !== null) {
    if (m[2] !== NS.SLIDE) continue;
    rels.push({ rId: m[1], target: m[3] });
  }
  const sldIdById = {};
  const sldRe = /<p:sldId[^>]*id="(\d+)"[^>]*r:id="(rId\d+)"[^>]*\/?>/gi;
  let s;
  while ((s = sldRe.exec(presXml)) !== null) {
    sldIdById[s[2]] = s[1];
  }
  return rels.map(r => ({ rId: r.rId, target: r.target, sldId: sldIdById[r.rId] || null }));
}

function countExistingMedia(tmplZip) {
  return Object.keys(tmplZip.files).filter(p => /^ppt\/media\/[^/]+$/.test(p)).length;
}

// Map LLM slide-type label -> template layout file path, using the analyzer's
// inferLayoutType so the heuristic matches exactly what the upload pipeline
// recorded against the brand profile.
async function buildLayoutTypeMap(tmplZip) {
  const layoutPaths = Object.keys(tmplZip.files).filter(p => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(p));
  const map = new Map();
  for (const p of layoutPaths) {
    const xml = await tmplZip.file(p).async('string');
    const nameMatch = xml.match(/<p:cSld[^>]*name="([^"]*)"/);
    const name = nameMatch ? nameMatch[1] : p.split('/').pop().replace(/\.xml$/, '');
    const type = inferLayoutType(xml, name);
    if (!map.has(type)) map.set(type, p.replace(/^ppt\/slideLayouts\//, ''));
  }
  return map;
}

const FALLBACK_CHAINS = {
  title: ['title', 'content', 'two-column', 'section', 'blank'],
  content: ['content', 'two-column', 'title', 'section', 'blank'],
  'two-column': ['two-column', 'content', 'title', 'section', 'blank'],
  'section-break': ['section', 'title', 'content', 'two-column', 'blank'],
  section: ['section', 'title', 'content', 'two-column', 'blank'],
};

function pickLayoutPath(layoutsByType, slideType) {
  const chain = FALLBACK_CHAINS[slideType] || FALLBACK_CHAINS.content;
  for (const t of chain) {
    if (layoutsByType.has(t)) return layoutsByType.get(t);
  }
  const first = layoutsByType.values().next().value;
  if (!first) throw new Error(`template has no slideLayouts; cannot pick a layout for type=${slideType}`);
  return first;
}

// Copy each generated media file into the template under a collision-proof name
// (imageGEN{n}.{ext}). Returns map keyed by the rels Target string so the rels
// rewriter can find each entry exactly as it appears in the source rels XML.
function injectMedia(tmplZip, generatedMedia, mediaStartIndex) {
  const renameMap = new Map();
  let counter = mediaStartIndex;
  for (const m of generatedMedia) {
    const newFilename = `imageGEN${counter}.${m.ext}`;
    tmplZip.file(`ppt/media/${newFilename}`, m.data);
    renameMap.set(m.originalPath, newFilename);
    counter++;
  }
  return { renameMap, nextMediaIndex: counter };
}

// Rewrite a generated slide's rels so (a) the slideLayout points at a TEMPLATE
// layout, (b) image rels point at the renamed media, (c) notesSlide rels are
// dropped if the template has no notesMaster. Other rels (chart, oleObject,
// hyperlinks etc.) are left untouched - we only rewrite what we own.
function rewriteSlideRels(originalRelsXml, newLayoutTarget, mediaRenameMap, hasNotesMaster) {
  const relRe = /<Relationship\b[^/]*\/?>/gi;
  return originalRelsXml.replace(relRe, (relTag) => {
    const typeMatch = relTag.match(/Type="([^"]+)"/);
    if (!typeMatch) return relTag;
    const type = typeMatch[1];

    if (type === NS.SLIDE_LAYOUT) {
      return relTag.replace(/Target="[^"]*"/, `Target="../slideLayouts/${escapeXmlAttr(newLayoutTarget)}"`);
    }
    if (type === NS.IMAGE) {
      const tMatch = relTag.match(/Target="([^"]+)"/);
      if (!tMatch) return relTag;
      const newName = mediaRenameMap.get(tMatch[1]);
      if (!newName) return relTag;
      return relTag.replace(/Target="[^"]*"/, `Target="../media/${escapeXmlAttr(newName)}"`);
    }
    if (type === NS.NOTES_SLIDE && !hasNotesMaster) {
      return '';
    }
    return relTag;
  });
}

function injectSlide(tmplZip, slideXml, relsXml, slideIndex) {
  tmplZip.file(`ppt/slides/slide${slideIndex}.xml`, slideXml);
  tmplZip.file(`ppt/slides/_rels/slide${slideIndex}.xml.rels`, relsXml);
}

// Append <Relationship Type=".../slide"> rows for each new slide into the
// presentation.xml.rels part. Returns [{slideTarget, rId}] in same order.
async function updatePresentationRels(tmplZip, newSlideTargets, ridStart) {
  const path = 'ppt/_rels/presentation.xml.rels';
  let xml = await tmplZip.file(path).async('string');
  const assigned = [];
  let next = ridStart;
  for (const target of newSlideTargets) {
    const rId = `rId${next++}`;
    const rel = `<Relationship Id="${rId}" Type="${NS.SLIDE}" Target="${escapeXmlAttr(target)}"/>`;
    xml = xml.replace(/<\/Relationships>\s*$/, `${rel}</Relationships>`);
    assigned.push({ slideTarget: target, rId });
  }
  tmplZip.file(path, xml);
  return assigned;
}

// Append <p:sldId> rows inside the existing <p:sldIdLst>. Numeric ids stay
// >= 256 and unique by relying on the sldIdStart computed in inventoryTemplate.
async function updatePresentationXml(tmplZip, newSlides) {
  const path = 'ppt/presentation.xml';
  let xml = await tmplZip.file(path).async('string');
  let insertion = '';
  for (const s of newSlides) {
    insertion += `<p:sldId id="${s.sldId}" r:id="${s.rId}"/>`;
  }
  if (/<p:sldIdLst\s*\/>/.test(xml)) {
    xml = xml.replace(/<p:sldIdLst\s*\/>/, `<p:sldIdLst>${insertion}</p:sldIdLst>`);
  } else if (/<\/p:sldIdLst>/.test(xml)) {
    xml = xml.replace(/<\/p:sldIdLst>/, `${insertion}</p:sldIdLst>`);
  } else {
    throw new Error('presentation.xml has no <p:sldIdLst> to append into');
  }
  tmplZip.file(path, xml);
}

async function updateContentTypes(tmplZip, newSlideParts, newMediaExts) {
  const path = '[Content_Types].xml';
  let xml = await tmplZip.file(path).async('string');

  for (const ext of newMediaExts) {
    if (new RegExp(`<Default[^>]*Extension="${ext}"`, 'i').test(xml)) continue;
    const ct = MEDIA_DEFAULT_CT[ext] || 'application/octet-stream';
    xml = xml.replace(/<\/Types>\s*$/, `<Default Extension="${ext}" ContentType="${ct}"/></Types>`);
  }

  for (const partName of newSlideParts) {
    const override = `<Override PartName="${escapeXmlAttr(partName)}" ContentType="${SLIDE_CONTENT_TYPE}"/>`;
    xml = xml.replace(/<\/Types>\s*$/, `${override}</Types>`);
  }
  tmplZip.file(path, xml);
}

// Drop the template's example slides so the merged deck contains ONLY the new
// LLM-generated slides. We delete slide XMLs + their _rels + matching <p:sldId>
// + <Relationship> + <Override> + paired notesSlides. Layouts and master are
// preserved (they are still referenced by the new slides).
async function dropExistingSlides(tmplZip, existingSlides) {
  if (!existingSlides.length) return;

  for (const s of existingSlides) {
    const slideRelsPath = `ppt/slides/_rels/${s.target.split('/').pop()}.rels`;
    const relsFile = tmplZip.file(slideRelsPath);
    if (relsFile) {
      const relsXml = await relsFile.async('string');
      removeNotesSlidesReferencedBy(tmplZip, relsXml);
    }
  }

  for (const s of existingSlides) {
    const slideName = s.target.split('/').pop();
    tmplZip.remove(`ppt/slides/${slideName}`);
    tmplZip.remove(`ppt/slides/_rels/${slideName}.rels`);
  }

  await pruneSldIdRows(tmplZip, existingSlides);
  await pruneSlideContentTypeOverrides(tmplZip, existingSlides);
}

function removeNotesSlidesReferencedBy(tmplZip, slideRelsXml) {
  const re = /<Relationship[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/gi;
  let m;
  while ((m = re.exec(slideRelsXml)) !== null) {
    if (m[1] !== NS.NOTES_SLIDE) continue;
    const target = m[2];
    const normalized = target.startsWith('../') ? `ppt/${target.slice(3)}` : target;
    tmplZip.remove(normalized);
    const notesRels = `${normalized.replace(/([^/]+)$/, '_rels/$1')}.rels`;
    tmplZip.remove(notesRels);
  }
}

async function pruneSldIdRows(tmplZip, existingSlides) {
  const ridSet = new Set(existingSlides.map(s => s.rId));
  const presPath = 'ppt/presentation.xml';
  let presXml = await tmplZip.file(presPath).async('string');
  presXml = presXml.replace(/<p:sldId[^>]*r:id="(rId\d+)"[^>]*\/?>/gi, (full, rid) => ridSet.has(rid) ? '' : full);
  tmplZip.file(presPath, presXml);

  const relsPath = 'ppt/_rels/presentation.xml.rels';
  let relsXml = await tmplZip.file(relsPath).async('string');
  relsXml = relsXml.replace(/<Relationship[^>]*Id="(rId\d+)"[^>]*\/?>/gi, (full, rid) => ridSet.has(rid) ? '' : full);
  tmplZip.file(relsPath, relsXml);
}

async function pruneSlideContentTypeOverrides(tmplZip, existingSlides) {
  const partSet = new Set(existingSlides.map(s => `/ppt/${s.target}`));
  const path = '[Content_Types].xml';
  let xml = await tmplZip.file(path).async('string');
  xml = xml.replace(/<Override[^>]*PartName="([^"]+)"[^>]*\/?>/gi, (full, part) => partSet.has(part) ? '' : full);
  tmplZip.file(path, xml);
}

async function serialize(tmplZip) {
  return tmplZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Public API. See file header for semantics.
 *
 * @param {Buffer} templateBuffer
 * @param {Buffer} generatedBuffer
 * @param {{ slideTypes?: string[], keepTemplateSlides?: boolean }} [opts]
 * @returns {Promise<Buffer>}
 */
async function injectSlidesIntoTemplate(templateBuffer, generatedBuffer, opts) {
  const options = opts || {};
  const slideTypes = Array.isArray(options.slideTypes) ? options.slideTypes : [];
  const keepTemplateSlides = options.keepTemplateSlides === true;

  let zips;
  try {
    zips = await loadZips(templateBuffer, generatedBuffer);
  } catch (e) {
    throw new Error(`[injector] loadZips failed: ${e.message}`);
  }
  const { tmplZip, genZip } = zips;

  let inventory, generatedSlides;
  try {
    inventory = await inventoryTemplate(tmplZip);
  } catch (e) {
    throw new Error(`[injector] inventoryTemplate failed: ${e.message}`);
  }
  try {
    generatedSlides = await extractGeneratedSlides(genZip);
  } catch (e) {
    throw new Error(`[injector] extractGeneratedSlides failed: ${e.message}`);
  }

  if (!generatedSlides.length) {
    throw new Error('[injector] generated buffer has no slides under ppt/slides/');
  }

  if (!keepTemplateSlides) {
    try {
      await dropExistingSlides(tmplZip, inventory.existingSlides);
    } catch (e) {
      throw new Error(`[injector] dropExistingSlides failed: ${e.message}`);
    }
  }

  const startSlideIndex = keepTemplateSlides ? inventory.slidePaths.length + 1 : 1;
  let mediaCounter = inventory.existingMediaCount + 1;
  const newSlideParts = [];
  const newSlideTargets = [];
  const newMediaExtsUsed = new Set();
  const sldIdStart = inventory.nextSldId;

  for (let i = 0; i < generatedSlides.length; i++) {
    const gen = generatedSlides[i];
    const slideIndex = startSlideIndex + i;
    const slideType = (slideTypes[i] || 'content').toLowerCase();

    let layoutTarget;
    try {
      layoutTarget = pickLayoutPath(inventory.layoutsByType, slideType);
    } catch (e) {
      throw new Error(`[injector] pickLayoutPath failed for slide ${i + 1} (type=${slideType}): ${e.message}`);
    }

    let mediaResult;
    try {
      mediaResult = injectMedia(tmplZip, gen.mediaFiles, mediaCounter);
    } catch (e) {
      throw new Error(`[injector] injectMedia failed for slide ${i + 1}: ${e.message}`);
    }
    mediaCounter = mediaResult.nextMediaIndex;
    for (const m of gen.mediaFiles) newMediaExtsUsed.add(m.ext);

    let rewrittenRels;
    try {
      rewrittenRels = rewriteSlideRels(gen.relsXml, layoutTarget, mediaResult.renameMap, inventory.hasNotesMaster);
    } catch (e) {
      throw new Error(`[injector] rewriteSlideRels failed for slide ${i + 1}: ${e.message}`);
    }

    injectSlide(tmplZip, gen.slideXml, rewrittenRels, slideIndex);
    newSlideParts.push(`/ppt/slides/slide${slideIndex}.xml`);
    newSlideTargets.push(`slides/slide${slideIndex}.xml`);
  }

  let assignedRels;
  try {
    assignedRels = await updatePresentationRels(tmplZip, newSlideTargets, inventory.nextRid);
  } catch (e) {
    throw new Error(`[injector] updatePresentationRels failed: ${e.message}`);
  }

  const newSldEntries = assignedRels.map((r, idx) => ({ sldId: sldIdStart + idx, rId: r.rId }));

  try {
    await updatePresentationXml(tmplZip, newSldEntries);
  } catch (e) {
    throw new Error(`[injector] updatePresentationXml failed: ${e.message}`);
  }

  try {
    await updateContentTypes(tmplZip, newSlideParts, [...newMediaExtsUsed]);
  } catch (e) {
    throw new Error(`[injector] updateContentTypes failed: ${e.message}`);
  }

  let out;
  try {
    out = await serialize(tmplZip);
  } catch (e) {
    throw new Error(`[injector] serialize failed: ${e.message}`);
  }

  console.log(`[pptx-template-injector] Merged ${generatedSlides.length} generated slide(s) into template ` +
    `(keepTemplateSlides=${keepTemplateSlides}, mediaInjected=${mediaCounter - inventory.existingMediaCount - 1}, ` +
    `outBytes=${out.length})`);
  return out;
}

module.exports = { injectSlidesIntoTemplate };
