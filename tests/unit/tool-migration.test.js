'use strict';

const path = require('path');
const { validateTool } = require('../../src/engine/tool-interface');
const { loadToolsV2, clearRegistry, listAllTools } = require('../../src/engine/tool-registry-v2');

// Mock heavy dependencies that original tools import
vi.mock('../../src/db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
}));
vi.mock('../../src/utils/recall', () => ({
  recall: vi.fn().mockResolvedValue({ memories: [] }),
}));
vi.mock('../../src/utils/telegram', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../src/utils/capture', () => ({
  captureMessage: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../src/utils/google-auth', () => ({
  getGoogleClient: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/utils/generate-with-memory', () => ({
  generateWithMemory: vi.fn().mockResolvedValue({ content: 'mock', memoriesUsed: 0 }),
}));
vi.mock('../../src/utils/worker-guards', () => ({
  getAllWorkerStatus: vi.fn().mockReturnValue({}),
}));
vi.mock('../../src/utils/schedule', () => ({
  calculateNextRun: vi.fn().mockReturnValue(new Date()),
}));
vi.mock('../../src/utils/ruhi-assets', () => ({
  INSTANCE_NAME: 'Lucy',
}));
vi.mock('../../src/skills/crawl-pipeline', () => ({
  crawlWebsite: vi.fn().mockResolvedValue({ pages: [] }),
}));
vi.mock('../../src/skills/chunker', () => ({
  chunkPages: vi.fn().mockReturnValue([]),
}));
vi.mock('../../src/skills/classifier', () => ({
  classifyPages: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/skills/brand-analysis', () => ({
  analyzeBrand: vi.fn().mockResolvedValue({ brand_dna: {}, brand_dna_confidence: 0 }),
}));
vi.mock('../../src/tools/registry', () => ({
  getTool: vi.fn().mockReturnValue(null),
  loadTools: vi.fn(),
  getTools: vi.fn().mockReturnValue(new Map()),
  getToolsForAgent: vi.fn().mockReturnValue(new Map()),
  getToolSchemas: vi.fn().mockReturnValue([]),
  getToolCostTier: vi.fn().mockReturnValue('medium'),
  checkToolPermission: vi.fn().mockReturnValue({ allowed: true, tier: 'medium' }),
}));

const V2_DIR = path.join(__dirname, '../../src/tools/v2');

// The 19 original tools that must be migrated
const EXPECTED_MIGRATED_TOOLS = [
  'fly_status',
  'system_status',
  'code_read',
  'search_memory',
  'brand_analysis',
  'ga_report',
  'code_write',
  'code_edit',
  'content_draft',
  'create_user_task',
  'bash_exec',
  'deploy_openbrain',
  'manage_task',
  'notify',
  'gmail_read',
  'gmail_draft',
  'calendar_read',
  'ikawn_generate',
  'manage_automation',
];

describe('Tool Migration — v2 wrappers', () => {
  let allTools;

  beforeAll(() => {
    clearRegistry();
    loadToolsV2(V2_DIR);
    allTools = listAllTools();
  });

  it('should load all 19 migrated tools', () => {
    const loadedNames = allTools.map(t => t.name);
    for (const name of EXPECTED_MIGRATED_TOOLS) {
      expect(loadedNames, `Missing tool: ${name}`).toContain(name);
    }
  });

  it('should have at least 19 tools loaded (may have more from other tasks)', () => {
    expect(allTools.length).toBeGreaterThanOrEqual(19);
  });

  it('should pass validateTool() for every loaded tool', () => {
    for (const tool of allTools) {
      const result = validateTool(tool);
      expect(result, `Tool "${tool.name}" failed validation: ${JSON.stringify(result.errors)}`).toEqual({ valid: true });
    }
  });

  describe('category assignments', () => {
    it('fly_status should be observe', () => {
      const tool = allTools.find(t => t.name === 'fly_status');
      expect(tool.category).toBe('observe');
    });

    it('system_status should be observe', () => {
      const tool = allTools.find(t => t.name === 'system_status');
      expect(tool.category).toBe('observe');
    });

    it('search_memory should be analyze', () => {
      const tool = allTools.find(t => t.name === 'search_memory');
      expect(tool.category).toBe('analyze');
    });

    it('code_read should be analyze', () => {
      const tool = allTools.find(t => t.name === 'code_read');
      expect(tool.category).toBe('analyze');
    });

    it('code_write should be create', () => {
      const tool = allTools.find(t => t.name === 'code_write');
      expect(tool.category).toBe('create');
    });

    it('bash_exec should be execute', () => {
      const tool = allTools.find(t => t.name === 'bash_exec');
      expect(tool.category).toBe('execute');
    });

    it('deploy_openbrain should be execute', () => {
      const tool = allTools.find(t => t.name === 'deploy_openbrain');
      expect(tool.category).toBe('execute');
    });

    it('notify should be communicate', () => {
      const tool = allTools.find(t => t.name === 'notify');
      expect(tool.category).toBe('communicate');
    });

    it('gmail_read should be communicate', () => {
      const tool = allTools.find(t => t.name === 'gmail_read');
      expect(tool.category).toBe('communicate');
    });
  });

  describe('permissionTier assignments', () => {
    it('read-only tools should be auto', () => {
      for (const name of ['fly_status', 'system_status', 'code_read', 'search_memory', 'ga_report', 'gmail_read', 'calendar_read']) {
        const tool = allTools.find(t => t.name === name);
        expect(tool.permissionTier, `${name} should be auto`).toBe('auto');
      }
    });

    it('write/side-effect tools should be confirm', () => {
      for (const name of ['code_write', 'code_edit', 'content_draft', 'create_user_task', 'bash_exec', 'manage_task', 'notify', 'gmail_draft', 'ikawn_generate', 'manage_automation', 'brand_analysis']) {
        const tool = allTools.find(t => t.name === name);
        expect(tool.permissionTier, `${name} should be confirm`).toBe('confirm');
      }
    });

    it('deploy_openbrain should be review (critical)', () => {
      const tool = allTools.find(t => t.name === 'deploy_openbrain');
      expect(tool.permissionTier).toBe('review');
    });
  });

  describe('envelope format from mock execution', () => {
    it('recall tool should return standardized envelope shape', async () => {
      const tool = allTools.find(t => t.name === 'search_memory');
      const result = await tool.execute(
        { query: 'test query' },
        { brandId: 'ikawn', userId: 'test-user' }
      );

      // Verify envelope shape regardless of success/failure
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('metadata');
      expect(typeof result.ok).toBe('boolean');
      expect(result.metadata.tool).toBe('search_memory');
      expect(typeof result.metadata.duration_ms).toBe('number');
      expect(result.metadata.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.metadata.attempt).toBe(1);
      expect(result.metadata.truncated).toBe(false);
      expect(result.metadata.cost_usd).toBe(0);
    });

    it('system_status tool should return error envelope on failure', async () => {
      // system_status calls pool.query which is mocked — but let's test the envelope
      // by calling with missing context to see the shape
      const tool = allTools.find(t => t.name === 'system_status');
      const result = await tool.execute({}, { brandId: 'ikawn' });

      // Even on success, verify envelope structure
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata.tool).toBe('system_status');
      expect(typeof result.metadata.duration_ms).toBe('number');
      expect(result.metadata.attempt).toBe(1);
      expect(result.metadata.truncated).toBe(false);
      expect(typeof result.metadata.cost_usd).toBe('number');
    });

    it('bash_exec tool should return error envelope for blocked command', async () => {
      const tool = allTools.find(t => t.name === 'bash_exec');
      const result = await tool.execute(
        { command: 'rm -rf /' },
        { brandId: 'ikawn' }
      );

      expect(result.ok).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBeTruthy();
      expect(result.metadata.tool).toBe('bash_exec');
      expect(result.metadata.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
