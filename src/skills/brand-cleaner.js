// @ts-check
'use strict';

/**
 * RGB color delta threshold (~deltaE 5 approximation in RGB Euclidean space).
 */
const RGB_DISTANCE_THRESHOLD = 30;

/**
 * Max tone traits to keep.
 */
const MAX_TONE_TRAITS = 5;

/**
 * Max competitors to keep.
 */
const MAX_COMPETITORS = 5;

/**
 * Min rationale length for competitors.
 */
const MIN_RATIONALE_LENGTH = 20;

/**
 * Parse a hex color string to RGB.
 * @param {string} hex - e.g. "#FFC01C" or "#fff"
 * @returns {{ r: number, g: number, b: number }|null}
 */
function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const cleaned = hex.replace(/^#/, '');
  if (cleaned.length !== 3 && cleaned.length !== 6) return null;

  const full = cleaned.length === 3
    ? cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2]
    : cleaned;

  const num = parseInt(full, 16);
  if (isNaN(num)) return null;

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Euclidean distance between two RGB colors.
 * @param {{ r: number, g: number, b: number }} a
 * @param {{ r: number, g: number, b: number }} b
 * @returns {number}
 */
function rgbDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/**
 * Deduplicate colors in a palette, removing near-duplicates.
 * @param {string[]} colors - Array of hex color strings
 * @returns {string[]}
 */
function deduplicateColors(colors) {
  if (!Array.isArray(colors) || colors.length === 0) return colors || [];

  /** @type {string[]} */
  const unique = [];
  /** @type {Array<{ r: number, g: number, b: number }>} */
  const uniqueRgb = [];

  for (const color of colors) {
    const rgb = hexToRgb(color);
    if (!rgb) {
      // Keep non-parseable colors as-is
      unique.push(color);
      continue;
    }

    const isDuplicate = uniqueRgb.some(existing => rgbDistance(existing, rgb) < RGB_DISTANCE_THRESHOLD);
    if (!isDuplicate) {
      unique.push(color);
      uniqueRgb.push(rgb);
    }
  }

  return unique;
}

/**
 * Deduplicate the named color fields (primary, secondary, accent) against each other.
 * If secondary or accent is too close to primary, set to null.
 * @param {object} colorValue
 * @returns {object}
 */
function deduplicateNamedColors(colorValue) {
  if (!colorValue || typeof colorValue !== 'object') return colorValue;

  const result = { ...colorValue };
  const primaryRgb = hexToRgb(result.primary);

  if (primaryRgb && result.secondary) {
    const secRgb = hexToRgb(result.secondary);
    if (secRgb && rgbDistance(primaryRgb, secRgb) < RGB_DISTANCE_THRESHOLD) {
      result.secondary = null;
    }
  }

  if (primaryRgb && result.accent) {
    const accRgb = hexToRgb(result.accent);
    if (accRgb && rgbDistance(primaryRgb, accRgb) < RGB_DISTANCE_THRESHOLD) {
      result.accent = null;
    }
  }

  if (result.secondary && result.accent) {
    const secRgb = hexToRgb(result.secondary);
    const accRgb = hexToRgb(result.accent);
    if (secRgb && accRgb && rgbDistance(secRgb, accRgb) < RGB_DISTANCE_THRESHOLD) {
      result.accent = null;
    }
  }

  // Deduplicate palette
  if (Array.isArray(result.palette)) {
    result.palette = deduplicateColors(result.palette);
  }

  return result;
}

/**
 * Check if a logo URL is likely a favicon.
 * @param {string|null} url
 * @returns {{ isFavicon: boolean, note: string|null }}
 */
function checkLogoUrl(url) {
  if (!url || typeof url !== 'string') return { isFavicon: false, note: null };

  const lower = url.toLowerCase();
  const faviconPatterns = ['favicon', '16x16', '32x32', 'ico', 'apple-touch-icon'];

  for (const pattern of faviconPatterns) {
    if (lower.includes(pattern)) {
      return { isFavicon: true, note: `URL contains "${pattern}" — likely a favicon, not a logo` };
    }
  }

  return { isFavicon: false, note: null };
}

/**
 * Compress tone traits to max limit.
 * @param {string[]} traits
 * @returns {string[]}
 */
function compressToneTraits(traits) {
  if (!Array.isArray(traits)) return traits || [];
  return traits.slice(0, MAX_TONE_TRAITS);
}

/**
 * Normalize offerings: group by type, remove duplicates, sort by prominence.
 * @param {Array<{ name: string, description: string, type: string }>} offerings
 * @returns {Array<{ name: string, description: string, type: string }>}
 */
function normalizeOfferings(offerings) {
  if (!Array.isArray(offerings)) return offerings || [];

  // Remove duplicates (case-insensitive name match)
  /** @type {Map<string, { name: string, description: string, type: string }>} */
  const seen = new Map();
  for (const item of offerings) {
    if (!item || !item.name) continue;
    const key = item.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }

  // Group by type, then flatten (products first, then services, then others)
  const typeOrder = ['product', 'service', 'feature', 'expertise'];
  const grouped = Array.from(seen.values());

  grouped.sort((a, b) => {
    const aIdx = typeOrder.indexOf(a.type);
    const bIdx = typeOrder.indexOf(b.type);
    const aPri = aIdx === -1 ? typeOrder.length : aIdx;
    const bPri = bIdx === -1 ? typeOrder.length : bIdx;
    return aPri - bPri;
  });

  return grouped;
}

/**
 * Validate social profile URLs and remove duplicates.
 * @param {Array<{ platform: string, url: string, handle: string }>} profiles
 * @returns {Array<{ platform: string, url: string, handle: string }>}
 */
function cleanSocialProfiles(profiles) {
  if (!Array.isArray(profiles)) return [];

  /** @type {Set<string>} */
  const seenUrls = new Set();
  /** @type {Array<{ platform: string, url: string, handle: string }>} */
  const cleaned = [];

  for (const profile of profiles) {
    if (!profile || !profile.url) continue;

    // Validate URL format
    if (!profile.url.startsWith('http://') && !profile.url.startsWith('https://')) {
      console.error('[brand-cleaner] Dropping social profile with invalid URL:', profile.url);
      continue;
    }

    const normalizedUrl = profile.url.toLowerCase().trim();
    if (seenUrls.has(normalizedUrl)) continue;

    seenUrls.add(normalizedUrl);
    cleaned.push(profile);
  }

  return cleaned;
}

/**
 * Clean competitors: require rationale, cap count.
 * @param {Array<{ name: string, url: string, rationale: string }>} competitors
 * @returns {Array<{ name: string, url: string, rationale: string }>}
 */
function cleanCompetitors(competitors) {
  if (!Array.isArray(competitors)) return [];

  return competitors
    .filter(c => {
      if (!c || !c.name) return false;
      if (!c.rationale || typeof c.rationale !== 'string' || c.rationale.length < MIN_RATIONALE_LENGTH) {
        console.error('[brand-cleaner] Dropping competitor without sufficient rationale:', c.name);
        return false;
      }
      return true;
    })
    .slice(0, MAX_COMPETITORS);
}

/**
 * Clean and normalize brand analysis results.
 * @param {object} brandDna - Raw brand_dna from analyzeBrand
 * @param {string} brandType - User-selected brand type
 * @returns {object} Cleaned brand_dna
 */
function cleanBrandDna(brandDna, brandType) {
  if (!brandDna || typeof brandDna !== 'object') {
    console.error('[brand-cleaner] Invalid brandDna input, returning as-is');
    return brandDna;
  }

  // Work on a deep copy to avoid mutation
  const dna = JSON.parse(JSON.stringify(brandDna));

  // 1. Color deduplication
  if (dna.visual_language?.colors?.value) {
    dna.visual_language.colors.value = deduplicateNamedColors(dna.visual_language.colors.value);
  }

  // 2. Logo validation
  if (dna.visual_language?.logo_url?.value) {
    const logoCheck = checkLogoUrl(dna.visual_language.logo_url.value);
    if (logoCheck.isFavicon) {
      dna.visual_language.logo_url.confidence = 'low';
      dna.visual_language.logo_url.note = logoCheck.note;
      console.error('[brand-cleaner] Logo URL flagged as probable favicon:', dna.visual_language.logo_url.value);
    }
  }

  // 3. Tone compression
  if (dna.brand_voice?.tone_traits?.value) {
    dna.brand_voice.tone_traits.value = compressToneTraits(dna.brand_voice.tone_traits.value);
  }

  // 4. Offerings normalization
  if (dna.core_identity?.offerings?.value) {
    dna.core_identity.offerings.value = normalizeOfferings(dna.core_identity.offerings.value);
    if (dna.core_identity.offerings.value.length === 0) {
      dna.core_identity.offerings.confidence = 'low';
    }
  }

  // 5. Social profile validation
  if (dna.social_profiles) {
    dna.social_profiles = cleanSocialProfiles(dna.social_profiles);
  }

  // 6. Competitor cleanup
  if (dna.competitors) {
    dna.competitors = cleanCompetitors(dna.competitors);
  }

  return dna;
}

module.exports = {
  cleanBrandDna,
  // Exported for testing
  hexToRgb,
  rgbDistance,
  deduplicateColors,
  deduplicateNamedColors,
  checkLogoUrl,
  compressToneTraits,
  normalizeOfferings,
  cleanSocialProfiles,
  cleanCompetitors,
};
