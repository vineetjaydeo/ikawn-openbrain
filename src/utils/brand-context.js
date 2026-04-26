// src/utils/brand-context.js
'use strict';

/**
 * Brand context helper for content generation.
 *
 * Combines two sources to give the LLM enough signal to write on-brand:
 *   1. brand_context table — manually configured industry/tone/audience and visuals
 *   2. vault_items (file_type='brand-profile') — extracted profile from template analysis
 *
 * Returns a normalized object or null if nothing relevant exists.
 *
 * The shape is deliberately flat so it can be passed straight into a prompt block.
 *
 *   {
 *     name: string | null,
 *     industry: string | null,
 *     tone: string | null,
 *     audience: string | null,
 *     colors: { primary, secondary, accent } | null,
 *     fonts: { heading, body } | null,
 *     hasLogo: boolean
 *   }
 */

async function getBrandContextForUser(userId, brandId, dbPool) {
  if (!brandId || !dbPool) return null;

  let row = null;
  let vaultProfile = null;

  // ── Source 1: brand_context (manual config) ───────────────────────────────
  try {
    const { rows } = await dbPool.query(
      `SELECT bc.display_name, bc.industry, bc.tone, bc.tone_of_voice,
              bc.target_audience, b.name AS brand_name
         FROM brand_context bc
         LEFT JOIN brands b ON b.brand_id = bc.brand_id
        WHERE bc.brand_id = $1
        LIMIT 1`,
      [brandId]
    );
    if (rows.length > 0) row = rows[0];
  } catch (err) {
    console.warn('[brand-context] brand_context query failed:', err.message);
  }

  // Optional color/font/logo columns (may not exist on every deployment)
  let primaryColor = null;
  let secondaryColor = null;
  let accentColor = null;
  let headingFont = null;
  let bodyFont = null;
  let logoUrl = null;
  try {
    const { rows } = await dbPool.query(
      `SELECT primary_color, secondary_color, accent_color, heading_font, body_font, logo_url
         FROM brand_context WHERE brand_id = $1 LIMIT 1`,
      [brandId]
    );
    if (rows.length > 0) {
      primaryColor = rows[0].primary_color;
      secondaryColor = rows[0].secondary_color;
      accentColor = rows[0].accent_color;
      headingFont = rows[0].heading_font;
      bodyFont = rows[0].body_font;
      logoUrl = rows[0].logo_url;
    }
  } catch (err) {
    // columns may not exist on some deployments — non-fatal
  }

  // ── Source 2: vault_items brand-profile ───────────────────────────────────
  try {
    const { rows } = await dbPool.query(
      `SELECT metadata FROM vault_items
        WHERE brand_id = $1
          AND file_type = 'brand-profile'
          AND source = 'template_analysis'
          AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1`,
      [brandId]
    );
    if (rows.length > 0) {
      const raw = typeof rows[0].metadata === 'string'
        ? JSON.parse(rows[0].metadata)
        : rows[0].metadata;
      if (raw && raw.profile) vaultProfile = raw.profile;
    }
  } catch (err) {
    // vault_items may not exist or query may fail — non-fatal
  }

  if (!row && !vaultProfile) return null;

  const name = (row && (row.display_name || row.brand_name)) || null;
  const industry = (row && row.industry) || null;
  const tone = (row && (row.tone || row.tone_of_voice)) || null;
  const audience = (row && row.target_audience) || null;

  const colors = (() => {
    const vc = vaultProfile && vaultProfile.colors ? vaultProfile.colors : {};
    const primary = primaryColor || vc.primary || null;
    const secondary = secondaryColor || vc.secondary || null;
    const accent = accentColor || vc.accent || null;
    if (!primary && !secondary && !accent) return null;
    return { primary, secondary, accent };
  })();

  const fonts = (() => {
    const vf = vaultProfile && vaultProfile.fonts ? vaultProfile.fonts : {};
    const heading = headingFont || vf.heading || null;
    const body = bodyFont || vf.body || null;
    if (!heading && !body) return null;
    return { heading, body };
  })();

  const hasLogo = !!(
    logoUrl ||
    (vaultProfile && Array.isArray(vaultProfile.logos) && vaultProfile.logos.length > 0)
  );

  // If absolutely nothing useful, return null
  if (!name && !industry && !tone && !audience && !colors && !fonts && !hasLogo) {
    return null;
  }

  return { name, industry, tone, audience, colors, fonts, hasLogo };
}

/**
 * Build a system-prompt block describing the brand voice for content generation.
 * Returns an empty string if profile is null/empty so callers can append unconditionally.
 *
 * @param {object|null} profile  Output of getBrandContextForUser
 * @param {object} [opts]
 * @param {'general'|'pptx'|'document'|'spreadsheet'} [opts.surface] tailors guidance
 */
function buildBrandContextBlock(profile, opts = {}) {
  if (!profile) return '';

  const surface = opts.surface || 'general';
  const name = profile.name || 'this brand';
  const lines = [];
  lines.push('=== BRAND CONTEXT ===');
  lines.push(`You are creating content for ${name}${profile.industry ? `, a company in the ${profile.industry} industry` : ''}.`);
  if (profile.tone) lines.push(`Use a ${profile.tone} tone.`);
  if (profile.audience) lines.push(`Primary audience: ${profile.audience}.`);
  lines.push(`Stay on-brand: prefer active voice, concrete claims, no fluff. Do not use emojis or em-dashes in any generated text.`);

  if (surface === 'pptx') {
    lines.push(`When generating presentations, slide titles should reflect ${name} positioning. Body copy must match the${profile.tone ? ` ${profile.tone}` : ''} tone${profile.audience ? ` and speak to ${profile.audience}` : ''}. Lead with concrete numbers and outcomes, not adjectives.`);
  } else if (surface === 'document') {
    lines.push(`When generating documents or reports, write long-form prose as if you are ${name}'s in-house writer${profile.audience ? ` addressing ${profile.audience}` : ''}. Open with the conclusion, then evidence. Avoid filler.`);
  } else if (surface === 'spreadsheet') {
    lines.push(`When generating spreadsheets, sheet names, headers, and any narrative cells (executive summary, notes) must use ${name}'s voice. Headers should be specific and decision-grade, not generic.`);
  } else {
    lines.push(`When generating documents, presentations, or spreadsheets, write copy as if you are ${name}'s in-house writer.`);
  }

  return lines.join('\n');
}

module.exports = { getBrandContextForUser, buildBrandContextBlock };
