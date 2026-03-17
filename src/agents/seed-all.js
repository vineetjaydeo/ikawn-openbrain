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
      INSERT INTO domain_agents (slug, brand_id, name, role, persona, tools, memory_tags)
      VALUES ($1, 'ikawn', $2, $3, $4, $5, $6)
      ON CONFLICT (slug) DO NOTHING
    `, [agent.slug, agent.name, agent.role, agent.persona, agent.tools, agent.memory_tags]);

    if (rowCount > 0) {
      seeded++;
      console.log(`[AgentSeed] Seeded: ${agent.slug} (${agent.role})`);
    }
  }
  console.log(`[AgentSeed] Done. ${seeded} new agent(s) seeded.`);
}

module.exports = { seedAgents };
