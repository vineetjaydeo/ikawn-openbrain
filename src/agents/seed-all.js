// src/agents/seed-all.js
'use strict';

const { pool } = require('../db');
const path = require('path');
const fs = require('fs');

async function seedAgents() {
  const agentsDir = __dirname;
  const seedFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.seed.js') && f !== 'seed-all.js');

  let seeded = 0;
  for (const file of seedFiles) {
    const agent = require(path.join(agentsDir, file));
    if (!agent.slug || !agent.persona) continue;

    const { rowCount } = await pool.query(`
      INSERT INTO agent_definitions (slug, brand_id, name, role, persona, tools, memory_tags, tool_scope, token_budget, dollar_cap)
      VALUES ($1, 'ikawn', $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        persona = EXCLUDED.persona,
        tools = EXCLUDED.tools,
        memory_tags = EXCLUDED.memory_tags,
        tool_scope = EXCLUDED.tool_scope,
        token_budget = EXCLUDED.token_budget,
        dollar_cap = EXCLUDED.dollar_cap
    `, [agent.slug, agent.name, agent.role, agent.persona, agent.tools, agent.memory_tags,
        agent.tool_scope || [], agent.token_budget || 200000, agent.dollar_cap || 2.00]);

    if (rowCount > 0) {
      seeded++;
      console.log(`[AgentSeed] Seeded: ${agent.slug} (${agent.role})`);
    }
  }
  console.log(`[AgentSeed] Done. ${seeded} new agent(s) seeded.`);
}

module.exports = { seedAgents };
