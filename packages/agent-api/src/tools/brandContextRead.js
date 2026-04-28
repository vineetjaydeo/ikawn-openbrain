'use strict';

const { z } = require('zod');
const { defineTool } = require('./defineTool.js');

const brandContextRead = defineTool({
  name: 'brand_context_read',
  description: "Read the structured brand profile (voice, industry, tone, colors, fonts) for the active brand.",
  parameters: z.object({}),
  output: z.object({
    found: z.boolean(),
    profile: z.union([
      z.object({
        name: z.string().nullable().optional(),
        industry: z.string().nullable().optional(),
        tone: z.string().nullable().optional(),
        audience: z.string().nullable().optional(),
        colors: z.object({
          primary: z.string().nullable().optional(),
          secondary: z.string().nullable().optional(),
          accent: z.string().nullable().optional(),
        }).nullable().optional(),
        fonts: z.object({
          heading: z.string().nullable().optional(),
          body: z.string().nullable().optional(),
        }).nullable().optional(),
        hasLogo: z.boolean().optional(),
      }),
      z.null(),
    ]),
  }),
  mode: 'sync',
  concurrency: 'safe',
  needsApproval: false,
  timeoutMs: 3000,
  retry: { maxAttempts: 0 },
  async execute(_input, ctx) {
    const deps = ctx.deps && ctx.deps.brandContextRead;
    if (!deps) throw new Error('brand_context_read requires ctx.deps.brandContextRead = { getBrandProfile }');
    const profile = await deps.getBrandProfile({ brand: ctx.brandContext.brand, userId: ctx.brandContext.userId });
    if (!profile) return { found: false, profile: null };
    return { found: true, profile };
  },
});

module.exports = { brandContextRead };
