// @ts-check
'use strict';

/**
 * Creative generation orchestrator for brand onboarding.
 *
 * Triggers Genie (image generation) on ikawn OS with brand-contextualized prompts.
 * Generates 2 creatives per enforcement mode (Medium, Strict, Auto) = 6 total.
 * For Strict mode: generates 3 candidates, scores against Brand DNA, picks best 2.
 */

const IKAWN_API_URL = process.env.IKAWN_API_URL || 'https://os.ikawn.com';
const IKAWN_API_KEY = process.env.IKAWN_API_KEY;

/**
 * @typedef {object} BrandContext
 * @property {string} name
 * @property {string} brandType
 * @property {string} [tagline]
 * @property {object} [colors]
 * @property {Array} [offerings]
 * @property {object} [toneOfVoice]
 * @property {string} [industry]
 * @property {string} [positioning]
 */

/**
 * Creative template definitions per brand_type.
 * @type {Record<string, Array<{type: string, promptTemplate: string}>>}
 */
const TEMPLATES = {
  product: [
    { type: 'hero_product', promptTemplate: 'Hero product shot with brand styling. Product centered, {colors} background, "{tagline}" overlay. Clean, professional product photography.' },
    { type: 'lifestyle', promptTemplate: 'Lifestyle scene featuring the product in use. {audience} setting, {colors} accent, brand-appropriate atmosphere. Editorial style.' },
  ],
  service: [
    { type: 'client_scenario', promptTemplate: 'Client success scenario visual for a {industry} service brand. Problem-to-solution visual narrative. {colors} palette, professional photography style.' },
    { type: 'outcome_spotlight', promptTemplate: 'Service outcome visualization showing results and benefits. Trust signals, {colors} palette, {tone} visual style. Clean and impactful.' },
  ],
  saas: [
    { type: 'hero_section', promptTemplate: 'SaaS product hero section. App dashboard mockup with {colors} UI elements. Key value proposition: "{tagline}". Clean, modern tech aesthetic.' },
    { type: 'feature_card', promptTemplate: 'Feature highlight card for a {industry} SaaS product. Icon-based design, {colors} palette, single feature spotlight. Minimal and focused.' },
  ],
  agency: [
    { type: 'portfolio_showcase', promptTemplate: 'Portfolio showcase visual for a {industry} agency. Work sample grid with {colors} brand overlay, "by {name}" attribution. Premium, polished.' },
    { type: 'client_success', promptTemplate: 'Client success story visual. Metrics and results highlight, {colors} branded layout. Professional, trust-building design.' },
  ],
  personal: [
    { type: 'personal_hero', promptTemplate: 'Personal brand hero image. Name "{name}" with signature topic in {industry}. {colors} palette, professional yet distinctive. Bold and memorable.' },
    { type: 'content_theme', promptTemplate: 'Content theme visual for {industry} thought leadership. Topic-driven design, {colors} accents, editorial style. Intellectual and engaging.' },
  ],
  hybrid: [
    { type: 'primary_offering', promptTemplate: 'Brand showcase highlighting primary offering. {colors} palette, professional product/service visual. Clean, versatile design.' },
    { type: 'brand_identity', promptTemplate: 'Brand identity creative: "{name}" with tagline "{tagline}". {colors} palette, {tone} visual style. Type-agnostic, bold, memorable.' },
  ],
};

/**
 * Build a generation prompt from template and brand context.
 * @param {string} template
 * @param {BrandContext} brand
 * @param {string} mode - medium | strict | auto
 * @returns {string}
 */
function buildPrompt(template, brand, mode) {
  const colorStr = brand.colors?.primary
    ? `${brand.colors.primary}${brand.colors.secondary ? ' and ' + brand.colors.secondary : ''}`
    : 'professional';

  const toneStr = brand.toneOfVoice?.traits?.length
    ? brand.toneOfVoice.traits.slice(0, 3).join(', ')
    : 'professional, clean';

  const audienceStr = brand.toneOfVoice?.target_audience?.demographics || 'modern professionals';

  let prompt = template
    .replace(/{colors}/g, colorStr)
    .replace(/{tagline}/g, brand.tagline || brand.name)
    .replace(/{name}/g, brand.name)
    .replace(/{industry}/g, brand.industry || 'business')
    .replace(/{tone}/g, toneStr)
    .replace(/{audience}/g, audienceStr);

  // Add offering reference if available
  const offering = brand.offerings?.[0];
  if (offering) {
    const offeringName = typeof offering === 'string' ? offering : offering.name || '';
    if (offeringName) {
      prompt += ` Featuring: ${offeringName}.`;
    }
  }

  // Mode-specific additions
  if (mode === 'strict') {
    prompt += ` STRICT: Use exact colors ${colorStr}. Brand name "${brand.name}" must be visible. Follow brand guidelines precisely.`;
  } else if (mode === 'medium') {
    prompt += ` Use brand colors as inspiration. Creative variety encouraged.`;
  } else {
    // Auto mode — balanced
    prompt += ` Balance brand consistency with creative expression.`;
  }

  return prompt;
}

/**
 * Build a rationale string for a creative.
 * @param {BrandContext} brand
 * @param {string} mode
 * @param {string} templateType
 * @returns {string}
 */
function buildRationale(brand, mode, templateType) {
  const parts = [];

  if (brand.toneOfVoice?.traits?.length) {
    parts.push(`your ${brand.toneOfVoice.traits.slice(0, 2).join(', ')} tone`);
  }
  if (brand.colors?.primary) {
    parts.push(`${mode === 'strict' ? 'exact' : ''} brand palette`.trim());
  }
  if (brand.offerings?.length) {
    const offering = brand.offerings[0];
    const name = typeof offering === 'string' ? offering : offering.name;
    if (name) parts.push(`core offering: ${name}`);
  }
  if (brand.tagline) {
    parts.push(`positioning: "${brand.tagline}"`);
  }

  if (parts.length === 0) {
    return `Based on your ${brand.brandType || 'brand'} identity`;
  }

  return `Based on ${parts.slice(0, 2).join(' + ')}`;
}

/**
 * Trigger a single creative generation on ikawn OS.
 * @param {string} prompt
 * @param {string} orgId
 * @returns {Promise<{generationId: string|null, error?: string}>}
 */
async function triggerGeneration(prompt, orgId) {
  if (!IKAWN_API_KEY) {
    return { generationId: null, error: 'IKAWN_API_KEY not configured' };
  }

  try {
    const response = await fetch(`${IKAWN_API_URL}/api/external/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${IKAWN_API_KEY}`,
      },
      body: JSON.stringify({
        agent: 'genie',
        prompt,
        count: 1,
        quality: '1K',
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'Unknown error');
      console.error('[creative-generator] Generation failed:', response.status, err);
      return { generationId: null, error: `Generation failed: ${response.status}` };
    }

    const data = await response.json();
    return { generationId: data.generationId || null };
  } catch (err) {
    console.error('[creative-generator] Trigger error:', err.message);
    return { generationId: null, error: err.message };
  }
}

/**
 * Poll for generation completion.
 * @param {string} generationId
 * @param {number} [timeoutMs]
 * @returns {Promise<{images: string[], status: string}>}
 */
async function pollGeneration(generationId, timeoutMs = 60000) {
  if (!IKAWN_API_KEY) {
    return { images: [], status: 'error' };
  }

  const start = Date.now();
  const pollInterval = 3000;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${IKAWN_API_URL}/api/external/generations/${generationId}`, {
        headers: { 'Authorization': `Bearer ${IKAWN_API_KEY}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'completed' && data.images?.length) {
          return { images: data.images, status: 'completed' };
        }
        if (data.status === 'failed') {
          return { images: [], status: 'failed' };
        }
      }
    } catch (err) {
      console.error('[creative-generator] Poll error:', err.message);
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  return { images: [], status: 'timeout' };
}

/**
 * Generate sample creatives for all three enforcement modes.
 * @param {BrandContext} brand
 * @param {string} orgId
 * @param {function} emit - SSE emitter: (event, data) => void
 * @returns {Promise<Array<{mode: string, index: number, image_url: string|null, rationale: string, template_type: string, failed: boolean}>>}
 */
async function generateSampleCreatives(brand, orgId, emit) {
  const templates = TEMPLATES[brand.brandType] || TEMPLATES.product;
  const modes = ['medium', 'strict', 'auto'];
  const results = [];

  // Generate all creatives in parallel
  const jobs = [];

  for (const mode of modes) {
    for (let i = 0; i < templates.length; i++) {
      const template = templates[i];
      const prompt = buildPrompt(template.promptTemplate, brand, mode);
      const rationale = buildRationale(brand, mode, template.type);

      jobs.push({
        mode,
        index: i,
        templateType: template.type,
        prompt,
        rationale,
      });
    }
  }

  // Fire all generation triggers in parallel
  const triggers = await Promise.all(
    jobs.map(async (job) => {
      const result = await triggerGeneration(job.prompt, orgId);
      return { ...job, generationId: result.generationId, error: result.error };
    })
  );

  // Poll all in parallel
  const completions = await Promise.all(
    triggers.map(async (trigger) => {
      if (!trigger.generationId) {
        const creative = {
          mode: trigger.mode,
          index: trigger.index,
          image_url: null,
          rationale: trigger.rationale,
          template_type: trigger.templateType,
          failed: true,
        };
        emit('creative_failed', { ...creative, error: trigger.error || 'Generation failed', retryable: true });
        return creative;
      }

      const poll = await pollGeneration(trigger.generationId);

      if (poll.status === 'completed' && poll.images.length > 0) {
        const creative = {
          mode: trigger.mode,
          index: trigger.index,
          image_url: poll.images[0],
          rationale: trigger.rationale,
          template_type: trigger.templateType,
          failed: false,
        };
        emit('creative_ready', creative);
        return creative;
      } else {
        const creative = {
          mode: trigger.mode,
          index: trigger.index,
          image_url: null,
          rationale: trigger.rationale,
          template_type: trigger.templateType,
          failed: true,
        };
        emit('creative_failed', { ...creative, error: `Generation ${poll.status}`, retryable: true });
        return creative;
      }
    })
  );

  return completions;
}

module.exports = {
  generateSampleCreatives,
  buildPrompt,
  buildRationale,
  TEMPLATES,
};
