// @ts-check
'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { cleanBrandDna } = require('./brand-cleaner');

const anthropic = new Anthropic();

const MODEL = 'claude-sonnet-4-6-20250514';
const MAX_INPUT_CHARS = 40000; // ~10K tokens

/**
 * @typedef {{ page_url: string, page_title: string, page_type: string, section_heading: string, content: string }} ContentChunk
 */

/**
 * @typedef {object} ConfidenceField
 * @property {*} value
 * @property {'high'|'medium'|'low'} confidence
 */

/**
 * @typedef {object} BrandDna
 * @property {object} core_identity
 * @property {ConfidenceField} core_identity.brand_name
 * @property {ConfidenceField} core_identity.tagline
 * @property {ConfidenceField} core_identity.description
 * @property {ConfidenceField} core_identity.mission
 * @property {ConfidenceField} core_identity.offerings
 * @property {object} visual_language
 * @property {ConfidenceField} visual_language.colors
 * @property {ConfidenceField} visual_language.logo_url
 * @property {ConfidenceField} visual_language.fonts
 * @property {ConfidenceField} visual_language.visual_style
 * @property {object} brand_voice
 * @property {ConfidenceField} brand_voice.tone_traits
 * @property {ConfidenceField} brand_voice.communication_style
 * @property {ConfidenceField} brand_voice.vocabulary
 * @property {ConfidenceField} brand_voice.content_themes
 * @property {object} market_context
 * @property {ConfidenceField} market_context.industry
 * @property {ConfidenceField} market_context.target_audience
 * @property {ConfidenceField} market_context.positioning
 * @property {string} brand_type_detected
 * @property {Array<{ platform: string, url: string, handle: string }>} social_profiles
 * @property {Array<{ name: string, url: string, rationale: string }>} competitors
 * @property {object} insights
 * @property {string} insights.positioning_label
 * @property {string[]} insights.contradictions
 * @property {string} insights.competitive_insight
 * @property {string} insights.opinion
 */

/**
 * @typedef {object} BrandAnalysisResult
 * @property {BrandDna} brand_dna - Full Brand DNA with per-field confidence
 * @property {number} brand_dna_confidence - Overall weighted confidence (0.0-1.0)
 * @property {object} brand_insights - "What stands out" block
 * @property {object} extraction_sources - What was used for analysis
 * @property {{ detected: string, selected: string }|null} brand_type_mismatch - If AI disagrees with user selection
 * @property {Array<{ platform: string, url: string, handle: string }>} social_profiles - Discovered social profiles
 * @property {Array<{ name: string, url: string, rationale: string }>} competitors - Identified competitors with rationale
 */

/** Priority order for page types when selecting chunks */
const PAGE_TYPE_PRIORITY = ['home', 'about', 'pricing', 'products', 'services', 'features', 'contact', 'blog', 'other'];

/**
 * Confidence weight map per PRD Section 2.4
 * @type {Record<string, number>}
 */
const CONFIDENCE_WEIGHTS = {
  brand_name: 3,
  colors: 3,
  brand_type: 2,
  tone_traits: 2,
  offerings: 2,
  target_audience: 1,
  tagline: 1,
};
const DEFAULT_WEIGHT = 0.5;

/** @type {Record<string, number>} */
const CONFIDENCE_VALUES = { high: 1.0, medium: 0.5, low: 0.2 };

/**
 * Select and prioritize chunks to fit within token budget.
 * @param {ContentChunk[]} chunks
 * @returns {ContentChunk[]}
 */
function selectChunks(chunks) {
  // Sort by page type priority, then by position in original array
  const sorted = [...chunks].sort((a, b) => {
    const aIdx = PAGE_TYPE_PRIORITY.indexOf(a.page_type);
    const bIdx = PAGE_TYPE_PRIORITY.indexOf(b.page_type);
    const aPri = aIdx === -1 ? PAGE_TYPE_PRIORITY.length : aIdx;
    const bPri = bIdx === -1 ? PAGE_TYPE_PRIORITY.length : bIdx;
    return aPri - bPri;
  });

  const selected = [];
  let totalChars = 0;

  for (const chunk of sorted) {
    const chunkSize = (chunk.content || '').length + (chunk.section_heading || '').length + 50;
    if (totalChars + chunkSize > MAX_INPUT_CHARS) break;
    selected.push(chunk);
    totalChars += chunkSize;
  }

  return selected;
}

/**
 * Build the user prompt for brand analysis.
 * @param {string} brandType
 * @param {string} url
 * @param {ContentChunk[]} chunks
 * @returns {string}
 */
function buildUserPrompt(brandType, url, chunks) {
  const chunksText = chunks.map((c, i) => {
    return [
      `--- Chunk ${i + 1} ---`,
      `Page: ${c.page_url}`,
      `Title: ${c.page_title}`,
      `Type: ${c.page_type}`,
      `Section: ${c.section_heading || '(none)'}`,
      '',
      c.content,
    ].join('\n');
  }).join('\n\n');

  return `Analyze this brand's website content and extract a structured Brand DNA.

**Brand URL:** ${url}
**User-selected brand type:** ${brandType}

**Website Content:**

${chunksText}

Return a single JSON object (no markdown fencing, no explanation text — ONLY valid JSON) with this exact structure:

{
  "core_identity": {
    "brand_name": { "value": "extracted name", "confidence": "high|medium|low" },
    "tagline": { "value": "extracted tagline or null", "confidence": "high|medium|low" },
    "description": { "value": "1-2 sentence brand description", "confidence": "high|medium|low" },
    "mission": { "value": "mission statement or null", "confidence": "high|medium|low" },
    "offerings": { "value": [{"name": "...", "description": "...", "type": "product|service|feature|expertise"}], "confidence": "high|medium|low" }
  },
  "visual_language": {
    "colors": { "value": { "primary": "#hex", "secondary": "#hex or null", "accent": "#hex or null", "palette": ["#hex"] }, "confidence": "high|medium|low" },
    "logo_url": { "value": "url or null", "confidence": "high|medium|low" },
    "fonts": { "value": { "heading": "font name or null", "body": "font name or null" }, "confidence": "high|medium|low" },
    "visual_style": { "value": "description of visual aesthetic", "confidence": "high|medium|low" }
  },
  "brand_voice": {
    "tone_traits": { "value": ["trait1", "trait2", "trait3"], "confidence": "high|medium|low" },
    "communication_style": { "value": "formal|casual|mixed", "confidence": "high|medium|low" },
    "vocabulary": { "value": { "use": ["word1"], "avoid": ["word1"] }, "confidence": "high|medium|low" },
    "content_themes": { "value": ["theme1", "theme2"], "confidence": "high|medium|low" }
  },
  "market_context": {
    "industry": { "value": "industry name", "confidence": "high|medium|low" },
    "target_audience": { "value": { "demographics": "...", "psychographics": "...", "pain_points": "..." }, "confidence": "high|medium|low" },
    "positioning": { "value": "positioning statement", "confidence": "high|medium|low" }
  },
  "brand_type_detected": "product|service|saas|agency|personal|hybrid",
  "social_profiles": [{ "platform": "...", "url": "...", "handle": "..." }],
  "competitors": [{ "name": "...", "url": "...", "rationale": "why this is a competitor (be specific)" }],
  "insights": {
    "positioning_label": "One-line positioning summary, e.g. 'You're a premium, design-led SaaS targeting early-stage teams'",
    "contradictions": ["Any contradictions between messaging, visuals, and positioning"],
    "competitive_insight": "How this brand relates to its competitive landscape",
    "opinion": "Your expert opinion on what the brand could do better or lean into"
  }
}

Rules:
- Be SPECIFIC, not generic. Reference actual content you read.
- Set confidence to "low" for anything you're inferring rather than directly observing.
- For colors, only report colors you can confirm from CSS/style references in the content. If none found, set confidence to "low".
- For competitors, only list companies you have strong reason to believe are competitors. Include a specific rationale >20 characters.
- For social_profiles, only include URLs you found in the content.
- brand_type_detected should be your assessment, which may differ from the user's selection.`;
}

const SYSTEM_PROMPT = `You are an expert brand strategist. Analyze the provided website content and extract a structured Brand DNA. Be specific, not generic. Every field must include a confidence level (high/medium/low) based on signal strength.

Return ONLY valid JSON. No markdown code fences. No explanation text before or after the JSON.`;

/**
 * Parse JSON from Claude's response, handling markdown code blocks.
 * @param {string} text
 * @returns {object|null}
 */
function parseJsonResponse(text) {
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch (_) {
    // ignore
  }

  // Try extracting from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (_) {
      // ignore
    }
  }

  // Try finding first { to last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch (_) {
      // ignore
    }
  }

  return null;
}

/**
 * Build a fallback Brand DNA when parsing fails.
 * @param {string} brandType
 * @param {string} url
 * @returns {BrandDna}
 */
function buildFallbackDna(brandType, url) {
  return {
    core_identity: {
      brand_name: { value: new URL(url).hostname.replace('www.', ''), confidence: 'low' },
      tagline: { value: null, confidence: 'low' },
      description: { value: 'Unable to extract description', confidence: 'low' },
      mission: { value: null, confidence: 'low' },
      offerings: { value: [], confidence: 'low' },
    },
    visual_language: {
      colors: { value: { primary: null, secondary: null, accent: null, palette: [] }, confidence: 'low' },
      logo_url: { value: null, confidence: 'low' },
      fonts: { value: { heading: null, body: null }, confidence: 'low' },
      visual_style: { value: 'Unknown', confidence: 'low' },
    },
    brand_voice: {
      tone_traits: { value: [], confidence: 'low' },
      communication_style: { value: 'mixed', confidence: 'low' },
      vocabulary: { value: { use: [], avoid: [] }, confidence: 'low' },
      content_themes: { value: [], confidence: 'low' },
    },
    market_context: {
      industry: { value: 'Unknown', confidence: 'low' },
      target_audience: { value: { demographics: 'Unknown', psychographics: 'Unknown', pain_points: 'Unknown' }, confidence: 'low' },
      positioning: { value: 'Unknown', confidence: 'low' },
    },
    brand_type_detected: brandType,
    social_profiles: [],
    competitors: [],
    insights: {
      positioning_label: 'Unable to determine positioning',
      contradictions: [],
      competitive_insight: 'Insufficient data for competitive analysis',
      opinion: 'More website content needed for a thorough analysis',
    },
  };
}

/**
 * Ensure all required fields exist in brand_dna, filling with defaults where needed.
 * @param {object} raw
 * @param {string} brandType
 * @param {string} url
 * @returns {BrandDna}
 */
function ensureFields(raw, brandType, url) {
  const fallback = buildFallbackDna(brandType, url);

  /**
   * @param {*} obj
   * @param {*} def
   * @returns {*}
   */
  function merge(obj, def) {
    if (!obj || typeof obj !== 'object') return def;
    const result = { ...def };
    for (const key of Object.keys(def)) {
      if (key in obj) {
        if (def[key] && typeof def[key] === 'object' && !Array.isArray(def[key]) && def[key].confidence === undefined) {
          result[key] = merge(obj[key], def[key]);
        } else {
          result[key] = obj[key];
        }
      }
    }
    return result;
  }

  return /** @type {BrandDna} */ (merge(raw, fallback));
}

/**
 * Calculate overall weighted confidence score.
 * @param {BrandDna} dna
 * @returns {number} 0.0-1.0
 */
function calculateConfidence(dna) {
  /** @type {Array<{ key: string, confidence: string }>} */
  const fields = [
    { key: 'brand_name', confidence: dna.core_identity?.brand_name?.confidence || 'low' },
    { key: 'colors', confidence: dna.visual_language?.colors?.confidence || 'low' },
    { key: 'brand_type', confidence: dna.brand_type_detected ? 'high' : 'low' },
    { key: 'tone_traits', confidence: dna.brand_voice?.tone_traits?.confidence || 'low' },
    { key: 'offerings', confidence: dna.core_identity?.offerings?.confidence || 'low' },
    { key: 'target_audience', confidence: dna.market_context?.target_audience?.confidence || 'low' },
    { key: 'tagline', confidence: dna.core_identity?.tagline?.confidence || 'low' },
    { key: 'description', confidence: dna.core_identity?.description?.confidence || 'low' },
    { key: 'mission', confidence: dna.core_identity?.mission?.confidence || 'low' },
    { key: 'logo_url', confidence: dna.visual_language?.logo_url?.confidence || 'low' },
    { key: 'fonts', confidence: dna.visual_language?.fonts?.confidence || 'low' },
    { key: 'visual_style', confidence: dna.visual_language?.visual_style?.confidence || 'low' },
    { key: 'communication_style', confidence: dna.brand_voice?.communication_style?.confidence || 'low' },
    { key: 'vocabulary', confidence: dna.brand_voice?.vocabulary?.confidence || 'low' },
    { key: 'content_themes', confidence: dna.brand_voice?.content_themes?.confidence || 'low' },
    { key: 'industry', confidence: dna.market_context?.industry?.confidence || 'low' },
    { key: 'positioning', confidence: dna.market_context?.positioning?.confidence || 'low' },
  ];

  let totalWeight = 0;
  let weightedSum = 0;

  for (const field of fields) {
    const weight = CONFIDENCE_WEIGHTS[field.key] || DEFAULT_WEIGHT;
    const value = CONFIDENCE_VALUES[field.confidence] || 0.2;
    weightedSum += weight * value;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
}

/**
 * Run full brand analysis on crawled content.
 * @param {object} params
 * @param {string} params.brandType - product | service | saas | agency | personal | hybrid
 * @param {string} params.url - The brand's website URL
 * @param {Array<{ page_url: string, page_title: string, page_type: string, section_heading: string, content: string }>} params.chunks - Classified chunks
 * @returns {Promise<BrandAnalysisResult>}
 */
async function analyzeBrand(params) {
  const { brandType, url, chunks } = params;

  if (!chunks || chunks.length === 0) {
    console.error('[brand-analysis] No chunks provided for analysis');
    const fallbackDna = buildFallbackDna(brandType, url);
    return {
      brand_dna: fallbackDna,
      brand_dna_confidence: 0,
      brand_insights: fallbackDna.insights,
      extraction_sources: { pages_crawled: [], external_signals: [], crawl_method: 'none' },
      brand_type_mismatch: null,
      social_profiles: [],
      competitors: [],
    };
  }

  // 1. Select and prioritize chunks
  const selectedChunks = selectChunks(chunks);
  console.error(`[brand-analysis] Selected ${selectedChunks.length}/${chunks.length} chunks for analysis`);

  // 2. Build prompt and call Claude
  const userPrompt = buildUserPrompt(brandType, url, selectedChunks);

  /** @type {BrandDna} */
  let dna;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const rawText = textBlock ? textBlock.text : '';

    const parsed = parseJsonResponse(rawText);
    if (!parsed) {
      console.error('[brand-analysis] Failed to parse Claude response as JSON, using fallback');
      dna = buildFallbackDna(brandType, url);
    } else {
      dna = ensureFields(parsed, brandType, url);
    }
  } catch (err) {
    console.error('[brand-analysis] Claude API call failed:', err.message || err);
    dna = buildFallbackDna(brandType, url);
  }

  // 3. Clean the DNA
  dna = /** @type {BrandDna} */ (cleanBrandDna(dna, brandType));

  // 4. Calculate confidence
  const confidence = calculateConfidence(dna);

  // 5. Check brand type mismatch
  const mismatch = dna.brand_type_detected && dna.brand_type_detected !== brandType
    ? { detected: dna.brand_type_detected, selected: brandType }
    : null;

  // 6. Build extraction sources
  const pagesMap = new Map();
  for (const chunk of selectedChunks) {
    if (!pagesMap.has(chunk.page_url)) {
      pagesMap.set(chunk.page_url, { url: chunk.page_url, title: chunk.page_title });
    }
  }

  const extractionSources = {
    pages_crawled: Array.from(pagesMap.values()),
    external_signals: [],
    crawl_method: 'web_crawl',
  };

  return {
    brand_dna: dna,
    brand_dna_confidence: confidence,
    brand_insights: dna.insights || {},
    extraction_sources: extractionSources,
    brand_type_mismatch: mismatch,
    social_profiles: dna.social_profiles || [],
    competitors: dna.competitors || [],
  };
}

module.exports = {
  analyzeBrand,
  // Exported for testing
  parseJsonResponse,
  calculateConfidence,
  selectChunks,
  buildFallbackDna,
  ensureFields,
};
