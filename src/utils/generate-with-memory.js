// @ts-check
'use strict';

const { recall } = require('./recall');
const { callReflectionLLM } = require('./llm');
const { INSTANCE_NAME } = require('./ruhi-assets');

/**
 * @typedef {Object} GenerateWithMemoryParams
 * @property {string} brandId
 * @property {string} [userId] - Scope personal memories to this user
 * @property {string} task - What to generate (e.g. "write instagram caption for product X")
 * @property {object} [context] - Additional context for generation
 * @property {string[]} [memoryTypes] - Filter recalled memories by type
 * @property {number} [memoryLimit=15] - Max memories to recall
 * @property {string} [systemPromptOverride] - Override the default system prompt
 */

/**
 * @typedef {Object} GenerateWithMemoryResult
 * @property {string} content - Generated content
 * @property {string[]} memoriesUsed - IDs of memories that informed this generation
 */

/**
 * Generate content with recalled memory context injected.
 * Returns both content AND memory IDs used (critical for outcome feedback loop).
 *
 * @param {GenerateWithMemoryParams} params
 * @returns {Promise<GenerateWithMemoryResult>}
 */
async function generateWithMemory(params) {
  const {
    brandId,
    userId,
    task,
    context,
    memoryTypes,
    memoryLimit = 15,
    systemPromptOverride,
  } = params;

  // 1. Recall relevant memories (scoped to userId if provided)
  const recalled = await recall({
    brandId,
    userId,
    query: task,
    memoryTypes,
    source: 'both',
    limit: memoryLimit,
    includeReasoning: false,
  });

  // 2. Compress memories into prompt blocks (token optimization)
  const voiceRules = recalled.memories
    .filter(m => m.memoryType === 'BRAND_VOICE_RULE' && m.confidence > 0.5)
    .map(m => `- ${m.content}`)
    .join('\n');

  const contentInsights = recalled.memories
    .filter(m => ['CREATIVE_PATTERN', 'CONTENT_STRATEGY', 'AUDIENCE_INSIGHT', 'PERFORMANCE_INSIGHT'].includes(m.memoryType))
    .map(m => `- ${m.content}`)
    .join('\n');

  const otherKnowledge = recalled.memories
    .filter(m => !['BRAND_VOICE_RULE', 'CREATIVE_PATTERN', 'CONTENT_STRATEGY', 'AUDIENCE_INSIGHT', 'PERFORMANCE_INSIGHT'].includes(m.memoryType))
    .map(m => `- [${m.memoryType}] ${m.content}`)
    .join('\n');

  // 3. Build system prompt
  const systemPrompt = systemPromptOverride || `You are ${INSTANCE_NAME}, generating content for a brand.

BRAND VOICE RULES (follow these strictly):
${voiceRules || 'None learned yet — use professional, clear tone.'}

CONTENT INSIGHTS (consider these):
${contentInsights || 'None learned yet.'}

${otherKnowledge ? `OTHER KNOWLEDGE:\n${otherKnowledge}` : ''}

Apply all learned rules silently. The output should reflect the rules without citing them.`;

  // 4. Generate content
  const userPrompt = context
    ? `Task: ${task}\n\nContext: ${JSON.stringify(context)}`
    : task;

  const content = await callReflectionLLM('content_generation', systemPrompt, userPrompt);

  // 5. Return content + memory IDs for outcome tracking
  return {
    content,
    memoriesUsed: recalled.memories.map(m => m.id),
  };
}

module.exports = { generateWithMemory };
