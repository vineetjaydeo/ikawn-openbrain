// src/services/pptx-template-analyzer.js
'use strict';

const { pool } = require('../db');

// Optional: JSZip for template analysis (not needed for getBrandProfile)
let JSZip;
try { JSZip = require('jszip'); } catch(e) { /* optional — only needed for analyzeTemplate */ }

// ── XML Helpers ─────────────────────────────────────────────────────────────────

function extractAttr(xml, attr) {
  const re = new RegExp(`${attr}="([^"]*)"`, 'i');
  const m = xml.match(re);
  return m ? m[1] : null;
}

function extractColor(elementXml) {
  const srgb = elementXml.match(/<a:srgbClr[^>]*val="([A-Fa-f0-9]{6})"/);
  if (srgb) return `#${srgb[1]}`;
  const sys = elementXml.match(/<a:sysClr[^>]*lastClr="([A-Fa-f0-9]{6})"/);
  if (sys) return `#${sys[1]}`;
  return null;
}

function extractTag(xml, tagName) {
  const re = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?</${tagName}>`, 'i');
  const m = xml.match(re);
  return m ? m[0] : null;
}

// ── Color Scheme Parser ─────────────────────────────────────────────────────────

const COLOR_ELEMENTS = ['dk1', 'dk2', 'lt1', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

function parseColorScheme(themeXml) {
  const schemeBlock = extractTag(themeXml, 'a:clrScheme');
  if (!schemeBlock) return null;
  const colors = {};
  for (const el of COLOR_ELEMENTS) {
    const tag = extractTag(schemeBlock, `a:${el}`);
    if (tag) colors[el] = extractColor(tag);
  }
  return colors;
}

// ── Font Parser ─────────────────────────────────────────────────────────────────

function parseThemeFonts(themeXml) {
  const result = { heading: null, body: null };
  const majorBlock = extractTag(themeXml, 'a:majorFont');
  if (majorBlock) {
    const latin = majorBlock.match(/<a:latin[^>]*typeface="([^"]*)"/);
    if (latin) result.heading = latin[1];
  }
  const minorBlock = extractTag(themeXml, 'a:minorFont');
  if (minorBlock) {
    const latin = minorBlock.match(/<a:latin[^>]*typeface="([^"]*)"/);
    if (latin) result.body = latin[1];
  }
  return result;
}

function extractAllFonts(allXmlContent) {
  const fonts = new Set();
  const re = /typeface="([^"]+)"/gi;
  let match;
  while ((match = re.exec(allXmlContent)) !== null) {
    const font = match[1];
    if (font && !font.startsWith('+') && font !== '') fonts.add(font);
  }
  return [...fonts];
}

/**
 * Extract embedded font binaries from a PPTX zip.
 * Returns array of { typeface, face, filename, data } where face is one of
 * regular, bold, italic, boldItalic. Reads <p:embeddedFontLst> from
 * ppt/presentation.xml and resolves the r:id to a binary in ppt/fonts/ via
 * ppt/_rels/presentation.xml.rels.
 */
async function extractEmbeddedFonts(zip) {
  const out = [];
  try {
    const presFile = zip.file('ppt/presentation.xml');
    const relsFile = zip.file('ppt/_rels/presentation.xml.rels');
    if (!presFile || !relsFile) return out;

    const presXml = await presFile.async('string');
    const relsXml = await relsFile.async('string');

    const relMap = {};
    const relRe = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/gi;
    let relMatch;
    while ((relMatch = relRe.exec(relsXml)) !== null) {
      relMap[relMatch[1]] = relMatch[2];
    }

    const lstMatch = presXml.match(/<p:embeddedFontLst>([\s\S]*?)<\/p:embeddedFontLst>/);
    if (!lstMatch) return out;
    const lstBlock = lstMatch[1];
    const fontRe = /<p:embeddedFont>([\s\S]*?)<\/p:embeddedFont>/g;
    let fontMatch;
    while ((fontMatch = fontRe.exec(lstBlock)) !== null) {
      const block = fontMatch[1];
      const typefaceMatch = block.match(/<p:font[^>]*typeface="([^"]+)"/);
      if (!typefaceMatch) continue;
      const typeface = typefaceMatch[1];

      for (const face of ['regular', 'bold', 'italic', 'boldItalic']) {
        const faceRe = new RegExp(`<p:${face}[^>]*r:id="([^"]+)"`);
        const faceMatch = block.match(faceRe);
        if (!faceMatch) continue;
        const rid = faceMatch[1];
        const target = relMap[rid];
        if (!target) continue;

        const resolved = target.startsWith('/')
          ? target.slice(1)
          : target.startsWith('../')
            ? target.replace(/^\.\.\//, '')
            : `ppt/${target}`;

        const fontFile = zip.file(resolved);
        if (!fontFile) continue;
        const data = await fontFile.async('nodebuffer');
        const filename = resolved.split('/').pop();
        out.push({ typeface, face, filename, data });
      }
    }
  } catch (e) {
    console.warn('[pptx-template-analyzer] extractEmbeddedFonts failed:', e.message);
  }
  return out;
}

// ── Slide Dimensions ────────────────────────────────────────────────────────────

function parseDimensions(presentationXml) {
  const match = presentationXml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  if (!match) return { width: 10, height: 5.625 };
  const EMU_PER_INCH = 914400;
  return {
    width: Math.round((parseInt(match[1]) / EMU_PER_INCH) * 1000) / 1000,
    height: Math.round((parseInt(match[2]) / EMU_PER_INCH) * 1000) / 1000,
  };
}

// ── Layout Analyzer ─────────────────────────────────────────────────────────────

function inferLayoutType(layoutXml, layoutName) {
  const nameLower = (layoutName || '').toLowerCase();
  if (nameLower.includes('title') && (nameLower.includes('slide') || nameLower.includes('only'))) return 'title';
  if (nameLower.includes('section')) return 'section';
  if (nameLower.includes('two') || nameLower.includes('2') || nameLower.includes('column')) return 'two-column';
  if (nameLower.includes('blank')) return 'blank';
  if (nameLower.includes('title') && nameLower.includes('content')) return 'content';
  if (nameLower.includes('content')) return 'content';
  if (nameLower.includes('title')) return 'title';
  const placeholders = (layoutXml.match(/<p:ph /g) || []).length;
  if (placeholders === 0) return 'blank';
  if (placeholders === 1) return 'title';
  return 'content';
}

function parseLayouts(layoutEntries) {
  return layoutEntries.map(({ name, xml }) => {
    const displayName = extractAttr(xml, 'name') || name.replace(/\.xml$/, '');
    const type = inferLayoutType(xml, displayName);
    const hasLogo = /<p:ph[^>]*type="dt"/.test(xml) || /<p:pic/.test(xml);
    const hasFooter = /<p:ph[^>]*type="ftr"/.test(xml) || /<p:ph[^>]*type="sldNum"/.test(xml);
    return { name: displayName, type, hasLogo, hasFooter };
  });
}

// ── Logo Detection ──────────────────────────────────────────────────────────────

const LOGO_MAX_SIZE = 200 * 1024;

async function detectLogos(zip, slideXmlContents) {
  const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('ppt/media/'));
  if (mediaFiles.length === 0) return [];

  const refCounts = {};
  for (const mediaPath of mediaFiles) {
    const mediaName = mediaPath.split('/').pop();
    let count = 0;
    for (const slideXml of slideXmlContents) {
      if (slideXml.includes(mediaName)) count++;
    }
    refCounts[mediaPath] = count;
  }

  const logos = [];
  for (const mediaPath of mediaFiles) {
    const file = zip.files[mediaPath];
    if (file.dir) continue;
    const data = await file.async('nodebuffer');
    if (data.length > LOGO_MAX_SIZE) continue;
    if (refCounts[mediaPath] < 2) continue;

    const filename = mediaPath.split('/').pop();
    let width = null;
    let height = null;
    for (const slideXml of slideXmlContents) {
      if (!slideXml.includes(filename)) continue;
      const escaped = filename.replace(/\./g, '\\.');
      const extMatch = slideXml.match(new RegExp(`${escaped}[\\s\\S]{0,500}<a:ext[^>]*cx="(\\d+)"[^>]*cy="(\\d+)"`));
      if (extMatch) {
        const EMU_PER_INCH = 914400;
        width = Math.round((parseInt(extMatch[1]) / EMU_PER_INCH) * 100) / 100;
        height = Math.round((parseInt(extMatch[2]) / EMU_PER_INCH) * 100) / 100;
        break;
      }
    }
    logos.push({ filename, data, width, height });
  }
  return logos;
}

// ── Main Template Analyzer ──────────────────────────────────────────────────────

/**
 * Analyze a .pptx file buffer and extract brand tokens.
 * @param {Buffer} fileBuffer - Raw .pptx file content
 * @returns {Promise<Object>} BrandProfile
 */
async function analyzeTemplate(fileBuffer) {
  if (!JSZip) throw new Error('jszip is required for template analysis');

  const zip = await JSZip.loadAsync(fileBuffer);
  const themeFile = zip.file('ppt/theme/theme1.xml');
  const rawThemeXml = themeFile ? await themeFile.async('string') : '';
  const colorScheme = rawThemeXml ? parseColorScheme(rawThemeXml) : {};
  const themeFonts = rawThemeXml ? parseThemeFonts(rawThemeXml) : { heading: null, body: null };

  const presentationFile = zip.file('ppt/presentation.xml');
  const presentationXml = presentationFile ? await presentationFile.async('string') : '';
  const dimensions = parseDimensions(presentationXml);

  const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  const slideXmlContents = [];
  let allXmlContent = rawThemeXml + presentationXml;

  for (const slidePath of slideFiles) {
    const content = await zip.file(slidePath).async('string');
    slideXmlContents.push(content);
    allXmlContent += content;
  }

  const masterFile = zip.file('ppt/slideMasters/slideMaster1.xml');
  if (masterFile) allXmlContent += await masterFile.async('string');

  const layoutFiles = Object.keys(zip.files).filter(f => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f));
  const layoutEntries = [];
  for (const layoutPath of layoutFiles) {
    const xml = await zip.file(layoutPath).async('string');
    allXmlContent += xml;
    layoutEntries.push({ name: layoutPath.split('/').pop(), xml });
  }

  const allFonts = extractAllFonts(allXmlContent);
  const logos = await detectLogos(zip, slideXmlContents);
  const embeddedFonts = await extractEmbeddedFonts(zip);

  const palette = COLOR_ELEMENTS.map(el => (colorScheme || {})[el]).filter(Boolean);
  const lt1 = (colorScheme || {}).lt1 || '#FFFFFF';
  const dk1 = (colorScheme || {}).dk1 || '#000000';

  return {
    colors: { primary: (colorScheme || {}).accent1 || null, secondary: (colorScheme || {}).accent2 || null, background: lt1, text: dk1, accent: (colorScheme || {}).accent3 || null, palette },
    fonts: { heading: themeFonts.heading, body: themeFonts.body, all: allFonts },
    embeddedFonts,
    logos,
    layouts: parseLayouts(layoutEntries),
    dimensions,
    rawThemeXml,
  };
}

// ── Brand Profile Retrieval ────────────────────────────────────────────────────

/**
 * Retrieve the brand profile for PPTX theming.
 * Checks two sources in order:
 *   1. vault_items with file_type='brand-profile' (from template analysis)
 *   2. brand_context table (manually configured brand visuals)
 * Returns a normalized profile or null if no brand data found.
 *
 * @param {string} brandId
 * @returns {Promise<object|null>} Normalized brand profile with colors, fonts, logos.
 */
async function getBrandProfile(brandId) {
  if (!brandId) return null;

  // ── Source 1: Vault-stored template analysis profile ──
  try {
    const { rows } = await pool.query(
      `SELECT metadata FROM vault_items
       WHERE brand_id = $1 AND file_type = 'brand-profile' AND source = 'template_analysis' AND deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT 1`,
      [brandId]
    );

    if (rows.length > 0) {
      const meta = typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata;
      if (meta && meta.profile) return meta.profile;
    }
  } catch (e) {
    // Non-critical: vault_items may not have brand-profile entries
  }

  // ── Source 2: brand_context table (manual brand config) ──
  try {
    const result = await pool.query(
      `SELECT
         b.name,
         bc.display_name,
         bc.industry,
         bc.tone,
         bc.tone_of_voice
       FROM brands b
       LEFT JOIN brand_context bc ON bc.brand_id = b.brand_id
       WHERE b.brand_id = $1`,
      [brandId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const brandName = row.display_name || row.name || '';

    // Try to read optional color/font columns (may not exist yet)
    let primaryColor = null;
    let secondaryColor = null;
    let accentColor = null;
    let headingFont = null;
    let bodyFont = null;
    let logoUrl = null;

    try {
      const extResult = await pool.query(
        `SELECT primary_color, secondary_color, accent_color, heading_font, body_font, logo_url
         FROM brand_context WHERE brand_id = $1`,
        [brandId]
      );
      if (extResult.rows.length > 0) {
        const ext = extResult.rows[0];
        primaryColor = ext.primary_color;
        secondaryColor = ext.secondary_color;
        accentColor = ext.accent_color;
        headingFont = ext.heading_font;
        bodyFont = ext.body_font;
        logoUrl = ext.logo_url;
      }
    } catch (e) {
      // Columns may not exist yet -- that's fine
    }

    const hasVisuals = primaryColor || headingFont || logoUrl;
    if (!hasVisuals && !brandName) return null;

    return {
      colors: {
        primary: stripHash(primaryColor) || null,
        secondary: stripHash(secondaryColor) || null,
        accent: stripHash(accentColor) || null,
        background: null,
        text: null,
      },
      fonts: {
        heading: headingFont || null,
        body: bodyFont || null,
      },
      logos: logoUrl ? [{ url: logoUrl, filename: 'logo', width: 1.0, height: 0.4 }] : [],
      name: brandName,
      industry: row.industry || '',
      tone: row.tone || row.tone_of_voice || '',
    };
  } catch (err) {
    console.warn('[pptx-template-analyzer] getBrandProfile failed:', err.message);
    return null;
  }
}

function stripHash(color) {
  if (!color) return null;
  return color.replace(/^#/, '');
}

// ── DB Save Operations ─────────────────────────────────────────────────────────

/**
 * Save extracted brand profile to vault_items + upload logos to R2.
 */
async function saveBrandProfile(brandId, profile, sourceFileUrl) {
  const { uploadToR2 } = require('../utils/storage');

  const uploadedLogos = [];
  for (const logo of profile.logos) {
    const ext = (logo.filename.split('.').pop() || 'png').toLowerCase();
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', webp: 'image/webp' };
    const mime = mimeMap[ext] || `image/${ext}`;
    const r2Key = `brand-assets/logos/${logo.filename}`;
    const url = await uploadToR2(r2Key, logo.data, mime, brandId);
    uploadedLogos.push({ filename: logo.filename, url, width: logo.width, height: logo.height });
  }

  // Upload embedded font binaries (TTF/OTF/.fntdata) so the generator can later embed them
  const uploadedFonts = [];
  for (const font of (profile.embeddedFonts || [])) {
    try {
      const ext = (font.filename.split('.').pop() || 'fntdata').toLowerCase();
      const mimeMap = { ttf: 'font/ttf', otf: 'font/otf', fntdata: 'application/octet-stream', woff: 'font/woff', woff2: 'font/woff2' };
      const mime = mimeMap[ext] || 'application/octet-stream';
      const safeTypeface = (font.typeface || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
      const r2Key = `brand-assets/fonts/${brandId}/${safeTypeface}_${font.face}_${font.filename}`;
      const url = await uploadToR2(r2Key, font.data, mime, brandId);
      uploadedFonts.push({
        typeface: font.typeface,
        face: font.face,
        filename: font.filename,
        url,
        size: font.data.length,
      });
    } catch (err) {
      console.warn('[pptx-template-analyzer] Failed to upload embedded font:', font.filename, err.message);
    }
  }

  const storableProfile = {
    colors: profile.colors,
    fonts: { ...(profile.fonts || {}), embedded: uploadedFonts },
    logos: uploadedLogos,
    layouts: profile.layouts,
    dimensions: profile.dimensions,
  };

  const metadata = {
    type: 'pptx_profile',
    profile: storableProfile,
    source_template: sourceFileUrl,
  };

  await pool.query(
    `INSERT INTO vault_items (brand_id, filename, file_url, file_type, source, folder, metadata, created_at, updated_at)
     VALUES ($1, 'Brand Profile', $2, 'brand-profile', 'template_analysis', 'Brand Assets', $3, NOW(), NOW())
     ON CONFLICT (file_url) WHERE deleted_at IS NULL
     DO UPDATE SET metadata = $3, updated_at = NOW()`,
    [brandId, sourceFileUrl, JSON.stringify(metadata)]
  );

  return storableProfile;
}

/**
 * Read the stored training PPTX URL for a brand, set on the brand-profile
 * vault_items row at upload time (saveBrandProfile -> metadata.source_template).
 * Returns null when the brand has no analyzed template yet — the caller decides
 * whether to fall back to a fresh-render path.
 */
async function getBrandTemplateUrl(brandId) {
  if (!brandId) return null;
  try {
    const { rows } = await pool.query(
      `SELECT metadata FROM vault_items
         WHERE brand_id = $1 AND file_type = 'brand-profile'
           AND source = 'template_analysis' AND deleted_at IS NULL
         ORDER BY updated_at DESC LIMIT 1`,
      [brandId]
    );
    if (!rows.length) return null;
    const meta = typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata;
    return meta && meta.source_template ? meta.source_template : null;
  } catch (err) {
    console.warn('[pptx-template-analyzer] getBrandTemplateUrl failed:', err.message);
    return null;
  }
}

module.exports = { analyzeTemplate, saveBrandProfile, getBrandProfile, extractEmbeddedFonts, getBrandTemplateUrl, inferLayoutType };
