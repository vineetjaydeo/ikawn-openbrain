// tests/unit/operator-tasks-seed.test.js
'use strict';

// Mock croner before importing the module
vi.mock('croner', () => ({
  Cron: vi.fn().mockImplementation(() => ({
    nextRun: () => new Date('2026-04-06T02:30:00.000Z'),
  })),
}));

const { seedOperatorTasks, OPERATOR_TASKS } = require('../../src/seeds/operator-tasks');

describe('Operator Tasks Seed', () => {
  let mockPool;
  let queries;

  beforeEach(() => {
    queries = [];
    mockPool = {
      query: vi.fn(async (text, params) => {
        queries.push({ text, params });
        // Return rowCount=1 for INSERT (task was seeded), rowCount=0 for index creation
        if (text.includes('INSERT INTO scheduled_tasks')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
  });

  it('exports exactly 4 operator tasks', () => {
    expect(OPERATOR_TASKS).toHaveLength(4);
  });

  it('all tasks have required fields', () => {
    const requiredFields = [
      'name', 'description', 'agent_slug', 'tier', 'tool',
      'schedule_type', 'cron_expression', 'timezone',
      'active_window_start', 'active_window_end',
      'max_cost_per_run', 'config',
    ];

    for (const task of OPERATOR_TASKS) {
      for (const field of requiredFields) {
        expect(task[field], `${task.name} missing field: ${field}`).toBeDefined();
      }
    }
  });

  it('all tasks use Haiku model in config', () => {
    for (const task of OPERATOR_TASKS) {
      expect(task.config.model).toBe('claude-haiku-4-5-20251001');
    }
  });

  it('all tasks use agent tier', () => {
    for (const task of OPERATOR_TASKS) {
      expect(task.tier).toBe('agent');
    }
  });

  it('all tasks use ruhi agent slug', () => {
    for (const task of OPERATOR_TASKS) {
      expect(task.agent_slug).toBe('ruhi');
    }
  });

  it('all tasks have 24/7 active window', () => {
    for (const task of OPERATOR_TASKS) {
      expect(task.active_window_start).toBe('00:00');
      expect(task.active_window_end).toBe('23:59');
    }
  });

  it('all tasks have UTC timezone', () => {
    for (const task of OPERATOR_TASKS) {
      expect(task.timezone).toBe('UTC');
    }
  });

  it('all tasks have cost caps at or below $0.50', () => {
    for (const task of OPERATOR_TASKS) {
      expect(task.max_cost_per_run).toBeLessThanOrEqual(0.50);
    }
  });

  it('contains the correct task names', () => {
    const names = OPERATOR_TASKS.map(t => t.name);
    expect(names).toContain('morning-briefing');
    expect(names).toContain('hourly-cost-monitor');
    expect(names).toContain('error-log-scanner');
    expect(names).toContain('weekly-health-report');
  });

  it('morning-briefing runs at 2:30 AM UTC (8 AM IST)', () => {
    const task = OPERATOR_TASKS.find(t => t.name === 'morning-briefing');
    expect(task.cron_expression).toBe('30 2 * * *');
  });

  it('hourly-cost-monitor runs every hour', () => {
    const task = OPERATOR_TASKS.find(t => t.name === 'hourly-cost-monitor');
    expect(task.cron_expression).toBe('0 * * * *');
  });

  it('error-log-scanner runs every 30 minutes', () => {
    const task = OPERATOR_TASKS.find(t => t.name === 'error-log-scanner');
    expect(task.cron_expression).toBe('*/30 * * * *');
  });

  it('weekly-health-report runs Monday at 3:30 AM UTC (9 AM IST)', () => {
    const task = OPERATOR_TASKS.find(t => t.name === 'weekly-health-report');
    expect(task.cron_expression).toBe('30 3 * * 1');
  });

  describe('seedOperatorTasks()', () => {
    it('creates unique index before inserting', async () => {
      await seedOperatorTasks(mockPool);

      const indexQuery = queries.find(q => q.text.includes('CREATE UNIQUE INDEX'));
      expect(indexQuery).toBeDefined();
      expect(indexQuery.text).toContain('idx_scheduled_tasks_name_brand');
      expect(indexQuery.text).toContain('(name, brand_id)');
    });

    it('inserts all 4 operator tasks', async () => {
      await seedOperatorTasks(mockPool);

      const insertQueries = queries.filter(q => q.text.includes('INSERT INTO scheduled_tasks'));
      expect(insertQueries).toHaveLength(4);
    });

    it('uses ON CONFLICT DO NOTHING for idempotency', async () => {
      await seedOperatorTasks(mockPool);

      const insertQueries = queries.filter(q => q.text.includes('INSERT INTO scheduled_tasks'));
      for (const q of insertQueries) {
        expect(q.text).toContain('ON CONFLICT (name, brand_id) DO NOTHING');
      }
    });

    it('sets brand_id to ikawn', async () => {
      await seedOperatorTasks(mockPool);

      const insertQueries = queries.filter(q => q.text.includes('INSERT INTO scheduled_tasks'));
      for (const q of insertQueries) {
        expect(q.text).toContain("'ikawn'");
      }
    });

    it('returns count of newly seeded tasks', async () => {
      const count = await seedOperatorTasks(mockPool);
      expect(count).toBe(4);
    });

    it('returns 0 when all tasks already exist', async () => {
      mockPool.query = vi.fn(async (text) => {
        if (text.includes('INSERT INTO scheduled_tasks')) {
          return { rows: [], rowCount: 0 }; // ON CONFLICT DO NOTHING = 0 rows
        }
        return { rows: [], rowCount: 0 };
      });

      const count = await seedOperatorTasks(mockPool);
      expect(count).toBe(0);
    });

    it('passes correct parameters for morning-briefing', async () => {
      await seedOperatorTasks(mockPool);

      const insertQueries = queries.filter(q => q.text.includes('INSERT INTO scheduled_tasks'));
      // First task is morning-briefing
      const params = insertQueries[0].params;
      // Params: $1=agent_slug, $2=name, $3=description, $4=tier, $5=tool,
      //         $6=config, $7=schedule_type, $8=cron_expression, $9=timezone,
      //         $10=active_window_start, $11=active_window_end,
      //         $12=max_cost_per_run, $13=next_run_at
      expect(params[0]).toBe('ruhi');          // agent_slug
      expect(params[1]).toBe('morning-briefing'); // name
      expect(params[3]).toBe('agent');          // tier
      expect(params[4]).toBe('web_search');     // tool (placeholder for agent-tier)
      expect(params[5]).toContain('"model":"claude-haiku-4-5-20251001"'); // config JSON
      expect(params[6]).toBe('cron');           // schedule_type
      expect(params[7]).toBe('30 2 * * *');     // cron_expression
      expect(params[8]).toBe('UTC');            // timezone
      expect(params[9]).toBe('00:00');          // active_window_start
      expect(params[10]).toBe('23:59');         // active_window_end
    });

    it('calculates next_run_at for each task', async () => {
      await seedOperatorTasks(mockPool);

      const insertQueries = queries.filter(q => q.text.includes('INSERT INTO scheduled_tasks'));
      for (const q of insertQueries) {
        // Last param is next_run_at, should be a valid ISO string
        const nextRunAt = q.params[q.params.length - 1];
        expect(nextRunAt).toBeTruthy();
        expect(new Date(nextRunAt).toISOString()).toBe(nextRunAt);
      }
    });
  });

  describe('task descriptions (prompt templates)', () => {
    it('morning-briefing mentions system_status and cost monitoring', () => {
      const task = OPERATOR_TASKS.find(t => t.name === 'morning-briefing');
      expect(task.description).toContain('system_status');
      expect(task.description).toContain('cost');
      expect(task.description).toContain('notify');
    });

    it('hourly-cost-monitor mentions $5 budget threshold', () => {
      const task = OPERATOR_TASKS.find(t => t.name === 'hourly-cost-monitor');
      expect(task.description).toContain('$5');
      expect(task.description).toContain('notify');
    });

    it('error-log-scanner categorizes by severity', () => {
      const task = OPERATOR_TASKS.find(t => t.name === 'error-log-scanner');
      expect(task.description).toContain('CRITICAL');
      expect(task.description).toContain('WARNING');
      expect(task.description).toContain('INFO');
    });

    it('weekly-health-report covers all 7 areas', () => {
      const task = OPERATOR_TASKS.find(t => t.name === 'weekly-health-report');
      expect(task.description).toContain('Uptime');
      expect(task.description).toContain('API Costs');
      expect(task.description).toContain('Error Analysis');
      expect(task.description).toContain('Task Performance');
      expect(task.description).toContain('Memory');
      expect(task.description).toContain('User Activity');
      expect(task.description).toContain('Recommendations');
    });
  });
});
