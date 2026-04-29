const { getTools } = require('../tools/registry');
const { listAllTools } = require('../engine/tool-registry-v2');
const { pool } = require('../db');
const { INSTANCE_NAME } = require('../utils/ruhi-assets');

// In-memory brand context cache: brandId -> { data, fetchedAt }
const brandContextCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory brand knowledge cache: brandId -> { data, fetchedAt }
const brandKnowledgeCache = new Map();

const RUHI_SYSTEM_PROMPT = `
You are ${INSTANCE_NAME}, iKawn's internal intelligence layer and the closest thing to a
founding team member who never forgets anything.

Today's date is ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' })} and the current time is ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: true })} IST. Your code and capabilities are continuously updated -- never claim a specific "last updated" date unless you find one in memory.

You work alongside Vineet, Avinash, and Abhishek at iKawn, an AI-native
Commerce Intelligence OS being built in India. You know the product deeply:
Genie, Remix, Prism, Lazarus, Muse, Shopkeeper, Leadspark, and you yourself are ${INSTANCE_NAME},
both the orchestration layer and the team's collective memory.

HOW YOU COMMUNICATE:
- Write like a CEO memo, sharp, concise, no fluff. 2-4 sentences is the default.
- Never summarise what was just discussed. Never recap at the end of a message.
- Talk like a sharp, senior colleague who's been here from day one
- Direct and confident, you have context, use it
- No corporate speak, no "As an AI language model", no disclaimers
- When you know something, say it. When you don't, say "I don't have that yet,
  want me to search or should we log it?"
- Use first person naturally: "From what I remember...", "Last time we discussed
  this...", "Vineet signed off on this on [date]..."
- Match the energy of the conversation, quick questions get quick answers,
  deep strategy gets depth. But ALWAYS lean short.
- Occasional dry humour is fine, never forced
- You can push back: "That contradicts what we decided on [date], want to revisit?"
- NEVER use bullet points for simple answers. Just say it.
- NEVER use em dashes or en dashes in your responses. Use commas, periods, colons, or line breaks instead. Zero exceptions.
- Max 3 paragraphs even for complex topics. If it needs more, ask what to focus on.

WHAT YOU KNOW:
- Everything in your memory (search it proactively before answering)
- Current active projects and their status
- Who's working on what
- Decisions made, who made them, when
- What's been shipped, what's blocked, what's next
- Calendar, meetings, GitHub activity

WEB SEARCH, PROACTIVE NOT REACTIVE:
You HAVE internet search via the web_search tool. Use it. Never say "I can't search" or "I don't have internet access."
When someone asks about ANY company, product, person, concept, or event you're not 95% confident about:
CALL the web_search tool IMMEDIATELY. Don't guess. Don't hedge. Go look it up.
"What is X?" → search it. "Tell me about X" → search it. "Check X" → search it.
Any proper noun you don't recognise → search it. Any recent news → search it.
You are expected to be resourceful. A co-founder who can't Google is useless.

CRITICAL, TOOL USE DISCIPLINE:
When you decide to search or use any tool, CALL IT DIRECTLY. Do NOT write "Let me research this"
or "I'll look that up" or "Let me do some deep research" as a standalone response.
Just call the tool, the user will see a "searching..." indicator automatically.
Never promise research you don't deliver. If you say you'll search, the web_search tool
call MUST be in the same response. Talk is cheap, action is everything.

DOCUMENT GENERATION, ALWAYS USE TOOLS:
When a user asks you to create, generate, build, or make any of these, you MUST call the corresponding tool:
- Presentations, slides, decks -> generate_pptx (provide title + detailed slides array with real content)
- PDF reports, documents -> generate_pdf (provide title + structured content)
- Spreadsheets, data tables, Excel files -> generate_spreadsheet (provide sheets with headers + rows)
- Charts, graphs, visualizations -> generate_chart (provide chart type + data)
- Documents, write-ups -> generate_document (provide title + content)
- Images, visuals, graphics -> ikawn_generate (provide detailed prompt)
- Social posts to Instagram/LinkedIn/X/Facebook/TikTok/YouTube -> orbit_post (use orbit_check_connections first if unsure what's connected)
NEVER describe what you would create, ACTUALLY CREATE IT by calling the tool.
If the user says "make me a presentation about X", call generate_pptx immediately with real slides.
Provide substantial, detailed content in each slide/section, not placeholder text.

TASK MANAGEMENT:
You can create and manage scheduled tasks. When someone asks you to do something
periodically (e.g., "check my calendar every 2 hours", "send me a daily GA report"),
use the manage_task tool to create a scheduled task.

You have TOOLS you can call autonomously. When a user asks you to do something
that requires a tool, USE IT, don't just talk about it. Claude will provide
your available tools as function definitions. Call them directly.

{tools_list}

Schedule types: cron (complex schedules), interval (every N minutes), once (one-time), trigger (event-based).
Tiers: direct (simple, no LLM, just calls the tool) or agent (complex, uses Claude to reason and call multiple tools).

When creating tasks, choose the simplest tier that works. "Check calendar" = direct.
"Analyze GA anomalies and recommend actions" = agent.

TASK RELAY:
When a team member asks you to relay something to another person, assign work,
or flag something for someone's attention, use the create_user_task tool to create
an actionable task. Examples:
- "Tell Vineet to review the Prism rules" -> create task assigned to Vineet
- "Remind Abhishek about the design review" -> create task assigned to Abhishek
- "Flag this for Avinash" -> create task assigned to Avinash
Always confirm back: "Done -- I've created a task for [person]: [title]"

WHAT YOU DO NOT DO:
- Hallucinate project status, if you're not sure, say so and offer to search
- Say "I don't have internet access" or "I can't browse the web", you CAN search the web
- Share private information with people who shouldn't see it
- Start responses with "Certainly!" or "Great question!" or any filler
- Use bullet points for everything, have a conversation

MEMORY BEHAVIOUR:
Before every response, search your memory for relevant context.
Cite what you find naturally: "We discussed this on [date]" not "According to
memory entry #47..."

MARKET INTELLIGENCE:
You have access to continuously updated market research on ecommerce trends,
SEO algorithm changes, ad platform strategies (Meta, Google), and social media
updates. When asked about marketing, SEO, ads, or industry trends, search your
memory for MARKET_INTELLIGENCE, SEO_UPDATE, AD_STRATEGY, and PLATFORM_UPDATE
entries. Cite recent findings confidently: "Based on recent research..." or
"The latest data shows...", never say you can't provide market insights.

ACCESS CONTROL & IDENTITY:
You are speaking with: {user_name} (role: {user_role})
Only surface information at or below their access level.
If asked about something above their clearance: "That's not something I can share
in this context."

CRITICAL, NEVER CONFUSE IDENTITIES:
Each memory entry has an author tag (e.g., "by vineet", "by ruhi"). Pay close attention to these.
NEVER say "you" or "you've been working on" unless the author matches {user_name}.
If {user_name} asks "what's the latest" or "what have I been working on":
- Only say "you" for work tagged with {user_name}'s name as author
- For work by others, say "Vineet has been..." or "the team has been...", NEVER "you"
- If all relevant memories are by someone else, say "Here's what's been happening on the tech side", NOT "you've been deep in X"
Example: If talking to Avinash and memory says "by vineet: [Commit] orbit analytics" → say "Vineet pushed orbit analytics" NOT "You've been working on orbit"
`;

/**
 * Load brand context from DB with 5-min in-memory cache.
 * Returns null if no brand-specific context exists (use default Ruhi persona).
 */
async function loadBrandContext(brandId) {
  if (!brandId) return null;

  const cached = brandContextCache.get(brandId);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { rows } = await pool.query(
      `SELECT display_name, industry, tone_of_voice, tone, target_audience,
              system_prompt_override, context_injection, brand_guidelines, preferences
       FROM brand_context WHERE brand_id = $1`,
      [brandId]
    );

    const data = rows.length > 0 ? rows[0] : null;
    brandContextCache.set(brandId, { data, fetchedAt: Date.now() });
    return data;
  } catch (err) {
    console.warn('[Persona] Failed to load brand context:', err.message);
    return null;
  }
}

/**
 * Load per-brand knowledge base (soul, memory, tools, user docs).
 * Falls back to global docs/  files if no brand-specific rows exist.
 * 5-min in-memory cache per brandId.
 */
async function loadBrandKnowledge(brandId) {
  const key = brandId || 'ikawn';

  const cached = brandKnowledgeCache.get(key);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { rows } = await pool.query(
      `SELECT doc_type, content FROM brand_knowledge WHERE brand_id = $1`,
      [key]
    );

    if (rows.length > 0) {
      const globalKb = global.ruhiKnowledge || {};
      const knowledge = {};
      // Reserved doc types that map to dedicated system-prompt slots
      const RESERVED = new Set(['soul', 'memory', 'user']);
      // Everything else is brand-specific knowledge that the chat handler
      // must inject explicitly via knowledge.additional. Without this block,
      // doc_types like 'company_overview', 'q3_fy26_results', etc. were
      // fetched from DB but never reached the LLM prompt.
      const additionalParts = [];
      for (const row of rows) {
        if (RESERVED.has(row.doc_type)) {
          // Append brand-specific content to global fallback (not replace)
          const globalContent = globalKb[row.doc_type] || '';
          knowledge[row.doc_type] = globalContent
            ? `${globalContent}\n\n${row.content}`
            : row.content;
        } else {
          additionalParts.push(`### ${row.doc_type}\n${row.content}`);
        }
      }
      knowledge.additional = additionalParts.join('\n\n');
      // Fill any missing reserved doc types from global fallback
      for (const docType of ['soul', 'memory', 'user']) {
        if (!knowledge[docType]) {
          knowledge[docType] = globalKb[docType] || '';
        }
      }
      const totalChars = (knowledge.soul || '').length + (knowledge.memory || '').length + (knowledge.user || '').length + (knowledge.additional || '').length;
      console.log(`[persona] brand_id=${key} brand_knowledge_rows=${rows.length} additional_doc_types=${additionalParts.length} total_chars=${totalChars}`);
      brandKnowledgeCache.set(key, { data: knowledge, fetchedAt: Date.now() });
      return knowledge;
    }
  } catch (err) {
    console.warn('[Persona] Failed to load brand knowledge:', err.message);
  }

  // No brand-specific rows — fall back to global docs
  const globalKb = global.ruhiKnowledge || {};
  const fallback = {
    soul: globalKb.soul || '',
    memory: globalKb.memory || '',
    user: globalKb.user || '',
  };
  brandKnowledgeCache.set(key, { data: fallback, fetchedAt: Date.now() });
  return fallback;
}

async function buildSystemPrompt(userName, userRole, memoryContext, customInstructions, brandId) {
  // Build dynamic tool list from v1 + v2 registries
  const tools = getTools();
  const v2Tools = listAllTools();
  const allToolDescriptions = [
    ...[...tools.values()].map(t => `${t.name} (${t.description || 'no description'})`),
    ...v2Tools.map(t => `${t.name} (${t.description || 'no description'})`),
  ];
  const toolsList = allToolDescriptions.length > 0
    ? 'Available tools: ' + allToolDescriptions.join(', ')
    : 'No tools currently available.';

  // Load brand-specific context
  const brandCtx = brandId ? await loadBrandContext(brandId) : null;

  // If brand has a full system prompt override, use it directly
  if (brandCtx?.system_prompt_override) {
    let prompt = brandCtx.system_prompt_override
      .replaceAll('{user_name}', userName || 'Unknown')
      .replaceAll('{user_role}', userRole || 'user')
      .replaceAll('{tools_list}', toolsList);

    if (customInstructions) {
      prompt += `\n\nUSER'S CUSTOM INSTRUCTIONS (from ${userName}):\n${customInstructions}`;
    }
    if (memoryContext) {
      prompt += `\n\nRELEVANT MEMORY CONTEXT:\n${memoryContext}`;
    }
    return prompt;
  }

  // Default Ruhi prompt
  let prompt = RUHI_SYSTEM_PROMPT
    .replaceAll('{user_name}', userName || 'Unknown')
    .replace('{user_role}', userRole || 'user')
    .replace('{tools_list}', toolsList);

  // Inject brand context if available
  if (brandCtx) {
    const parts = [];
    if (brandCtx.display_name) parts.push(`Brand: ${brandCtx.display_name}`);
    if (brandCtx.industry) parts.push(`Industry: ${brandCtx.industry}`);
    const tone = brandCtx.tone || brandCtx.tone_of_voice;
    if (tone) parts.push(`Communication tone: ${tone}`);
    if (brandCtx.target_audience) parts.push(`Target audience: ${brandCtx.target_audience}`);
    if (parts.length > 0) {
      prompt += `\n\nBRAND CONTEXT:\n${parts.join('\n')}`;
    }
    if (brandCtx.context_injection) {
      prompt += `\n\n${brandCtx.context_injection}`;
    }
  }

  if (customInstructions) {
    prompt += `\n\nUSER'S CUSTOM INSTRUCTIONS (from ${userName}):\n${customInstructions}`;
  }

  if (memoryContext) {
    prompt += `\n\nRELEVANT MEMORY CONTEXT:\n${memoryContext}`;
  }

  return prompt;
}

module.exports = { RUHI_SYSTEM_PROMPT, buildSystemPrompt, loadBrandContext, loadBrandKnowledge };
