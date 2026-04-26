'use strict';

// Stage 1 fix: when context.brandId is set, the tool MUST force themeName to
// 'brand' regardless of what the LLM passed, MUST loud-fail (throw) on a
// missing or errored brand profile, and MUST log applied brand styling.
//
// vitest in this repo cannot vi.mock CJS — tests monkey-patch module.exports
// of dependencies BEFORE requiring the tool under test. Destructured imports
// at the top of generate_pptx.tool.js (e.g. const { getBrandProfile } = ...)
// resolve at require-time against the cached module.exports object, so any
// mutation that lands before the first require flows through.

// Monkey-patch dependencies BEFORE requiring the tool ─────────────────────────
const dbModule = require('../../src/db');
dbModule.pool.query = vi.fn();

const pptxAnalyzer = require('../../src/services/pptx-template-analyzer');
pptxAnalyzer.getBrandProfile = vi.fn();

const storage = require('../../src/utils/storage');
storage.uploadToR2 = vi.fn();

const capture = require('../../src/utils/capture');
capture.captureMessage = vi.fn();

const telegram = require('../../src/utils/telegram');
telegram.sendTelegramMessage = vi.fn();

const fontEmbedder = require('../../src/services/pptx-font-embedder');
// embedFonts is called only when theme has embedded fonts; pass-through stub
fontEmbedder.embedFonts = vi.fn().mockImplementation(async (buf) => buf);

// Now load the tool — its destructured imports will see the spies above
const generatePptxTool = require('../../src/tools/generate_pptx.tool');
const { _buildAndUploadPptx } = generatePptxTool;

function resetAllMocks() {
  dbModule.pool.query.mockReset();
  pptxAnalyzer.getBrandProfile.mockReset();
  storage.uploadToR2.mockReset();
  capture.captureMessage.mockReset();
  telegram.sendTelegramMessage.mockReset();
  fontEmbedder.embedFonts.mockReset();
  fontEmbedder.embedFonts.mockImplementation(async (buf) => buf);
}

function happyPathStubs() {
  // Every pool.query call resolves to a generic OK row. The worker fires many
  // UPDATEs, an INSERT into vault_items, and a final UPDATE on memories. We
  // do not care about ordering for these tests — only that none of them throw.
  dbModule.pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  storage.uploadToR2.mockResolvedValue('https://r2.example.com/test.pptx');
  capture.captureMessage.mockResolvedValue({ id: 'msg-1' });
  telegram.sendTelegramMessage.mockResolvedValue(undefined);
}

const baseConfig = (theme) => ({
  title: 'Test Deck',
  theme, // may be undefined
  slides: [{ type: 'content', title: 'Hello', content: '- one\n- two' }],
});

const ctx = (brandId) => ({ brandId, userId: 1, conversationId: 'conv-1' });
const TASK_ID = 'task-abc';

beforeEach(() => {
  resetAllMocks();
  happyPathStubs();
});

describe('generate_pptx — Stage 1 brand theme enforcement', () => {
  it('forces theme=brand when brandId is present even if config.theme=corporate', async () => {
    const profile = {
      colors: { primary: '#123456', secondary: '#abcdef', text: '#222222' },
      fonts: { heading: 'Inter', body: 'Inter', embedded: [] },
      logos: [],
    };
    pptxAnalyzer.getBrandProfile.mockResolvedValueOnce(profile);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await _buildAndUploadPptx(baseConfig('corporate'), ctx('fedfina'), TASK_ID, null);

    expect(pptxAnalyzer.getBrandProfile).toHaveBeenCalledWith('fedfina');
    // Loud confirmation log proves the brand path was taken
    const logged = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logged).toContain('Brand theme applied');
    expect(logged).toContain('brandId=fedfina');
    logSpy.mockRestore();
  });

  it('forces theme=brand when brandId is present even if config.theme is undefined', async () => {
    const profile = {
      colors: { primary: '#ff0000' },
      fonts: { heading: 'Arial', body: 'Arial', embedded: [] },
      logos: [],
    };
    pptxAnalyzer.getBrandProfile.mockResolvedValueOnce(profile);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const config = baseConfig(undefined);
    delete config.theme;
    await _buildAndUploadPptx(config, ctx('maxfashion'), TASK_ID, null);

    expect(pptxAnalyzer.getBrandProfile).toHaveBeenCalledWith('maxfashion');
    const logged = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logged).toContain('Brand theme applied');
    expect(logged).toContain('brandId=maxfashion');
    logSpy.mockRestore();
  });

  it('refuses silent fallback when getBrandProfile throws — task is marked failed', async () => {
    pptxAnalyzer.getBrandProfile.mockRejectedValueOnce(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await _buildAndUploadPptx(baseConfig('corporate'), ctx('fedfina'), TASK_ID, null);

    // Loud error log surfaces the failure
    const errLogged = errSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(errLogged).toContain('BRAND PROFILE FAILED');
    expect(errLogged).toContain('brandId=fedfina');

    // Outer catch in buildAndUploadPptx records the task as failed
    const failedCall = dbModule.pool.query.mock.calls.find(([sql, params]) =>
      typeof sql === 'string'
      && sql.includes('UPDATE ob_background_tasks')
      && Array.isArray(params)
      && params[0] === 'failed'
    );
    expect(failedCall).toBeDefined();
    expect(failedCall[1][1]).toContain('Brand profile fetch failed');

    // Upload must NOT have happened — no silent corporate render
    expect(storage.uploadToR2).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('refuses silent fallback when getBrandProfile returns null — task is marked failed', async () => {
    pptxAnalyzer.getBrandProfile.mockResolvedValueOnce(null);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await _buildAndUploadPptx(baseConfig('corporate'), ctx('fedfina'), TASK_ID, null);

    const errLogged = errSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(errLogged).toContain('BRAND PROFILE FAILED');
    expect(errLogged).toContain('profile not found');

    const failedCall = dbModule.pool.query.mock.calls.find(([sql, params]) =>
      typeof sql === 'string'
      && sql.includes('UPDATE ob_background_tasks')
      && Array.isArray(params)
      && params[0] === 'failed'
    );
    expect(failedCall).toBeDefined();
    expect(failedCall[1][1]).toContain('Brand profile not found');

    expect(storage.uploadToR2).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('falls back to config.theme when no brandId is present (no throw)', async () => {
    // Use a known-good built-in theme name so the worker keeps running
    await _buildAndUploadPptx(baseConfig('dark'), ctx(null), TASK_ID, null);

    // Brand profile was never consulted
    expect(pptxAnalyzer.getBrandProfile).not.toHaveBeenCalled();

    // Task was NOT marked as failed
    const failedCall = dbModule.pool.query.mock.calls.find(([sql, params]) =>
      typeof sql === 'string'
      && sql.includes('UPDATE ob_background_tasks')
      && Array.isArray(params)
      && params[0] === 'failed'
    );
    expect(failedCall).toBeUndefined();

    // Upload happened — generation went all the way through
    expect(storage.uploadToR2).toHaveBeenCalled();
  });
});
