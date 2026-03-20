// src/tools/fly.tool.js
'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const FLYCTL = process.env.FLYCTL_PATH || `${process.env.HOME}/.fly/bin/flyctl`;

module.exports = {
  name: 'fly_status',
  description: '[DEPRECATED] Get Fly.io app status including machine state and resource usage. May not work in production.',
  tier: 'direct',
  parameters: {
    app: { type: 'string', required: false, description: 'Fly app name (default: ikawn-openbrain)' },
  },
  async execute(config, context) {
    const app = config.app || 'ikawn-openbrain';
    const allowed = ['ikawn-openbrain', 'ikawn-v3'];
    if (!allowed.includes(app)) {
      return { success: false, data: null, summary: `App ${app} not in allowed list` };
    }

    try {
      const { stdout } = await execFileAsync(FLYCTL, ['status', '--app', app, '--json'], { timeout: 15000 });
      const parsed = JSON.parse(stdout);
      return {
        success: true,
        data: {
          app: parsed.Name,
          status: parsed.Status,
          machines: (parsed.Machines || []).map(m => ({ id: m.id, state: m.state, region: m.region })),
        },
        summary: `${app}: ${parsed.Status}. ${(parsed.Machines || []).length} machine(s).`,
      };
    } catch (err) {
      return { success: false, data: null, summary: `Failed to get Fly status: ${err.message}` };
    }
  },
};
