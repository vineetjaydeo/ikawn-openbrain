// src/services/pptx-font-embedder.js
'use strict';

/**
 * Post-process a generated PPTX buffer to embed brand font files.
 *
 * Why this exists:
 *   pptxgenjs v4 names fonts in slide XML (e.g. fontFace: "Inter") but never
 *   ships the actual font binary inside the .pptx. On a machine without the
 *   font installed, PowerPoint silently substitutes Calibri. To make brand
 *   templates render correctly anywhere, we must:
 *     1. drop the TTF/OTF binary into ppt/fonts/ inside the zip
 *     2. add a Content Types entry for it
 *     3. add a Relationship from ppt/presentation.xml to the binary
 *     4. inject a <p:embeddedFontLst> block in ppt/presentation.xml
 *
 * This module does all of that on top of an existing pptxgenjs nodebuffer.
 *
 * On any failure, it logs and returns the original buffer unchanged so a
 * font glitch never breaks generation.
 */

const JSZip = require('jszip');

// Best-effort fetch of the font binary. Accepts http(s) URL or absolute file path.
async function fetchFontBuffer(urlOrPath) {
  if (!urlOrPath) return null;
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching font ${urlOrPath}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }
  // Treat as absolute filesystem path
  const fs = require('fs');
  return fs.readFileSync(urlOrPath);
}

// Detect font binary type. PPTX accepts TTF/OTF directly; .fntdata is the
// PowerPoint obfuscated wrapper which we leave as-is when seen.
function inferContentType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'ttf') return 'application/x-font-ttf';
  if (ext === 'otf') return 'application/vnd.ms-opentype';
  if (ext === 'fntdata') return 'application/x-fontdata';
  return 'application/octet-stream';
}

// Group resolved fonts by typeface so each typeface gets one <p:embeddedFont>.
function groupByTypeface(fonts) {
  const grouped = new Map();
  for (const f of fonts) {
    if (!grouped.has(f.typeface)) grouped.set(f.typeface, {});
    grouped.get(f.typeface)[f.face || 'regular'] = f;
  }
  return grouped;
}

/**
 * Embed brand fonts into a generated PPTX buffer.
 *
 * @param {Buffer} pptxBuffer - The buffer returned from pptxgenjs.write()
 * @param {Array<{typeface:string, face:string, url?:string, path?:string, data?:Buffer, filename?:string}>} embeddedFonts
 * @returns {Promise<Buffer>} New buffer with fonts embedded, or the original buffer on failure.
 */
async function embedFonts(pptxBuffer, embeddedFonts) {
  if (!Array.isArray(embeddedFonts) || embeddedFonts.length === 0) return pptxBuffer;

  try {
    const zip = await JSZip.loadAsync(pptxBuffer);

    // Step 1: resolve every font to a Buffer (download from R2 or read from disk)
    const resolved = [];
    for (const font of embeddedFonts) {
      try {
        let data = font.data;
        if (!data) {
          if (font.url) data = await fetchFontBuffer(font.url);
          else if (font.path) data = await fetchFontBuffer(font.path);
        }
        if (!data || data.length === 0) {
          console.warn('[pptx-font-embedder] Skipping font with no data:', font.typeface, font.face);
          continue;
        }
        const filename = font.filename || `${font.typeface.replace(/[^a-zA-Z0-9]/g, '')}_${font.face || 'regular'}.ttf`;
        resolved.push({ typeface: font.typeface, face: font.face || 'regular', filename, data });
      } catch (err) {
        console.warn('[pptx-font-embedder] Failed to resolve font binary:', font.typeface, font.face, err.message);
      }
    }

    if (resolved.length === 0) {
      console.warn('[pptx-font-embedder] No font binaries available, returning original buffer');
      return pptxBuffer;
    }

    // Step 2: write each font into ppt/fonts/ with a unique name
    const grouped = groupByTypeface(resolved);
    const fileEntries = []; // { typeface, face, zipPath, filename }
    let counter = 1;
    for (const [typeface, faces] of grouped) {
      for (const face of ['regular', 'bold', 'italic', 'boldItalic']) {
        const f = faces[face];
        if (!f) continue;
        const ext = (f.filename.split('.').pop() || 'ttf').toLowerCase();
        const zipFilename = `font${counter}.${ext}`;
        const zipPath = `ppt/fonts/${zipFilename}`;
        zip.file(zipPath, f.data);
        fileEntries.push({ typeface, face, zipPath, filename: zipFilename, ext });
        counter++;
      }
    }

    // Step 3: register content types for each font extension we used
    const ctFile = zip.file('[Content_Types].xml');
    if (!ctFile) throw new Error('[Content_Types].xml missing from PPTX');
    let ctXml = await ctFile.async('string');
    const usedExts = new Set(fileEntries.map(e => e.ext));
    for (const ext of usedExts) {
      const ct = inferContentType(`x.${ext}`);
      // Only add Default if not already present for this extension
      const hasDefault = new RegExp(`<Default[^>]*Extension="${ext}"`, 'i').test(ctXml);
      if (!hasDefault) {
        const insertion = `<Default Extension="${ext}" ContentType="${ct}"/>`;
        ctXml = ctXml.replace(/<\/Types>\s*$/, `${insertion}</Types>`);
      }
    }
    zip.file('[Content_Types].xml', ctXml);

    // Step 4: add Relationship entries from presentation.xml to each font binary
    const relsPath = 'ppt/_rels/presentation.xml.rels';
    const relsFile = zip.file(relsPath);
    if (!relsFile) throw new Error('ppt/_rels/presentation.xml.rels missing from PPTX');
    let relsXml = await relsFile.async('string');

    // Find max existing rId so new ones don't collide
    const existingIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1], 10));
    let nextId = (existingIds.length ? Math.max(...existingIds) : 0) + 1;

    const FONT_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';
    for (const entry of fileEntries) {
      entry.rId = `rId${nextId++}`;
      const rel = `<Relationship Id="${entry.rId}" Type="${FONT_REL_TYPE}" Target="fonts/${entry.filename}"/>`;
      relsXml = relsXml.replace(/<\/Relationships>\s*$/, `${rel}</Relationships>`);
    }
    zip.file(relsPath, relsXml);

    // Step 5: inject <p:embeddedFontLst> into ppt/presentation.xml
    const presPath = 'ppt/presentation.xml';
    const presFile = zip.file(presPath);
    if (!presFile) throw new Error('ppt/presentation.xml missing from PPTX');
    let presXml = await presFile.async('string');

    // Build the <p:embeddedFontLst> XML
    const fontsByTypeface = new Map();
    for (const entry of fileEntries) {
      if (!fontsByTypeface.has(entry.typeface)) fontsByTypeface.set(entry.typeface, []);
      fontsByTypeface.get(entry.typeface).push(entry);
    }
    let embeddedLst = '<p:embeddedFontLst>';
    for (const [typeface, entries] of fontsByTypeface) {
      embeddedLst += '<p:embeddedFont>';
      // <p:font typeface="Inter" panose="000000000000" pitchFamily="0" charset="0"/>
      embeddedLst += `<p:font typeface="${typeface}" panose="020F0502020204030204" pitchFamily="34" charset="0"/>`;
      for (const e of entries) {
        embeddedLst += `<p:${e.face} r:id="${e.rId}"/>`;
      }
      embeddedLst += '</p:embeddedFont>';
    }
    embeddedLst += '</p:embeddedFontLst>';

    // Remove any existing <p:embeddedFontLst> to avoid duplicates
    presXml = presXml.replace(/<p:embeddedFontLst>[\s\S]*?<\/p:embeddedFontLst>/g, '');

    // Per the OOXML spec, <p:embeddedFontLst> must appear after <p:notesSz>
    // and before <p:defaultTextStyle>. Insert before </p:presentation> if those
    // anchors are missing — PowerPoint accepts that.
    if (/<\/p:notesSz>/.test(presXml)) {
      presXml = presXml.replace(/<\/p:notesSz>/, `</p:notesSz>${embeddedLst}`);
    } else if (/<p:defaultTextStyle/.test(presXml)) {
      presXml = presXml.replace(/<p:defaultTextStyle/, `${embeddedLst}<p:defaultTextStyle`);
    } else {
      presXml = presXml.replace(/<\/p:presentation>\s*$/, `${embeddedLst}</p:presentation>`);
    }

    zip.file(presPath, presXml);

    // Step 6: re-serialize zip
    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    console.log(`[pptx-font-embedder] Embedded ${fileEntries.length} font face(s) across ${fontsByTypeface.size} typeface(s)`);
    return out;
  } catch (err) {
    console.warn('[pptx-font-embedder] Embedding failed, returning original buffer:', err.message);
    return pptxBuffer;
  }
}

// Web-safe fallback map: when no font file is available for a brand font,
// substitute a common Office font that approximates the look so the deck does
// not silently fall back to Calibri on every machine.
const WEB_SAFE_FALLBACK = {
  'Inter': 'Calibri',
  'Source Sans Pro': 'Calibri',
  'Source Sans 3': 'Calibri',
  'Roboto': 'Calibri',
  'Open Sans': 'Calibri',
  'Lato': 'Calibri',
  'Montserrat': 'Calibri',
  'Poppins': 'Calibri',
  'Nunito': 'Calibri',
  'Nunito Sans': 'Calibri',
  'Work Sans': 'Calibri',
  'IBM Plex Sans': 'Calibri',
  'DM Sans': 'Calibri',
  'Manrope': 'Calibri',
  'Plus Jakarta Sans': 'Calibri',
  'Helvetica Neue': 'Arial',
  'Helvetica': 'Arial',
  'Roboto Mono': 'Consolas',
  'JetBrains Mono': 'Consolas',
  'Fira Code': 'Consolas',
  'Source Code Pro': 'Consolas',
  'Merriweather': 'Georgia',
  'Playfair Display': 'Georgia',
  'Lora': 'Georgia',
  'Libre Baskerville': 'Georgia',
};

/**
 * Pick a safe font name. Returns the original if it's already a Microsoft Office
 * standard font, otherwise the closest Office equivalent. Used when a brand has
 * named a font but no binary is available to embed.
 */
function resolveWebSafeFont(fontName) {
  if (!fontName) return null;
  const trimmed = String(fontName).trim();
  if (WEB_SAFE_FALLBACK[trimmed]) return WEB_SAFE_FALLBACK[trimmed];
  return trimmed;
}

module.exports = { embedFonts, resolveWebSafeFont, WEB_SAFE_FALLBACK };
