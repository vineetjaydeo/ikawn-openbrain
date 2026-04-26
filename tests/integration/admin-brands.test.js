const request = require('supertest');
const express = require('express');

// Monkey-patch the modules' exports so the route picks up the stubs
// when it `require()`s them. Vi.mock doesn't intercept CJS require in this
// repo's vitest setup; pool.query is mutable on a shared object reference,
// and the helper modules are imported as whole-module refs by the route
// so reassigning their properties takes effect.
const dbModule = require('../../src/db');
dbModule.pool.query = vi.fn();

const brandContextHelpers = require('../../src/utils/brand-context');
brandContextHelpers.getBrandContextForUser = vi.fn();
brandContextHelpers.buildBrandContextBlock = vi.fn();

const pptxAnalyzer = require('../../src/services/pptx-template-analyzer');
pptxAnalyzer.analyzeTemplate = vi.fn();
pptxAnalyzer.saveBrandProfile = vi.fn();

const storage = require('../../src/utils/storage');
storage.downloadFromUrl = vi.fn();

const adminBrandsRouter = require('../../src/routes/admin-brands');

function createApp(role = 'admin') {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    req.session = { user: { id: 1, role, email: 'admin@test.com' } };
    req.brand_id = 'ikawn';
    next();
  });
  app.use(adminBrandsRouter);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

beforeEach(() => {
  dbModule.pool.query.mockReset();
  brandContextHelpers.getBrandContextForUser.mockReset();
  brandContextHelpers.buildBrandContextBlock.mockReset();
  pptxAnalyzer.analyzeTemplate.mockReset();
  pptxAnalyzer.saveBrandProfile.mockReset();
  storage.downloadFromUrl.mockReset();
});

describe('admin-brands — auth gate', () => {
  it('returns 403 when caller is not admin', async () => {
    const res = await request(createApp('user')).get('/api/admin/brands');
    expect(res.status).toBe(403);
  });

  it('returns 401 when there is no session user', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = {};
      next();
    });
    app.use(adminBrandsRouter);
    const res = await request(app).get('/api/admin/brands');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/brands', () => {
  it('returns the list rows', async () => {
    dbModule.pool.query.mockResolvedValueOnce({
      rows: [
        {
          brand_id: 'fedfina',
          display_name: 'Fedfina',
          industry: 'Financial Services',
          tone: 'Professional',
          updated_at: '2026-04-26T00:00:00Z',
          has_profile: true,
          has_logo: true,
          heading_font: 'Inter',
          body_font: 'Inter',
          template_count: 1,
          knowledge_count: 5,
        },
      ],
      rowCount: 1,
    });
    const res = await request(createApp()).get('/api/admin/brands');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].brand_id).toBe('fedfina');
  });

  it('returns 500 on db failure', async () => {
    dbModule.pool.query.mockRejectedValueOnce(new Error('boom'));
    const res = await request(createApp()).get('/api/admin/brands');
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/admin/brands/:brandId', () => {
  it('returns 404 when the brand does not exist', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(createApp()).get('/api/admin/brands/nope');
    expect(res.status).toBe(404);
  });

  it('returns context + vault + knowledge for an existing brand', async () => {
    dbModule.pool.query
      .mockResolvedValueOnce({ rows: [{ brand_id: 'fedfina', display_name: 'Fedfina' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'v1', filename: 'tmpl.pptx' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ doc_type: 'company_overview', content: 'x' }], rowCount: 1 });
    const res = await request(createApp()).get('/api/admin/brands/fedfina');
    expect(res.status).toBe(200);
    expect(res.body.context.brand_id).toBe('fedfina');
    expect(res.body.vault).toHaveLength(1);
    expect(res.body.knowledge).toHaveLength(1);
  });
});

describe('POST /api/admin/brands', () => {
  it('rejects missing brand_id', async () => {
    const res = await request(createApp()).post('/api/admin/brands').send({ display_name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('brand_id');
  });

  it('rejects invalid brand_id slug (uppercase)', async () => {
    const res = await request(createApp())
      .post('/api/admin/brands')
      .send({ brand_id: 'BadSlug', display_name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lowercase');
  });

  it('rejects invalid brand_id slug (leading hyphen)', async () => {
    const res = await request(createApp())
      .post('/api/admin/brands')
      .send({ brand_id: '-leading', display_name: 'X' });
    expect(res.status).toBe(400);
  });

  it('rejects missing display_name', async () => {
    const res = await request(createApp())
      .post('/api/admin/brands')
      .send({ brand_id: 'good-slug' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('display_name');
  });

  it('returns 201 with the created row', async () => {
    dbModule.pool.query.mockResolvedValueOnce({
      rows: [{ brand_id: 'acme', display_name: 'Acme', updated_at: '2026-04-26' }],
      rowCount: 1,
    });
    const res = await request(createApp())
      .post('/api/admin/brands')
      .send({ brand_id: 'acme', display_name: 'Acme', industry: 'Retail' });
    expect(res.status).toBe(201);
    expect(res.body.brand_id).toBe('acme');
  });

  it('returns 409 on unique-violation', async () => {
    const err = new Error('dup');
    err.code = '23505';
    dbModule.pool.query.mockRejectedValueOnce(err);
    const res = await request(createApp())
      .post('/api/admin/brands')
      .send({ brand_id: 'fedfina', display_name: 'Fedfina' });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/admin/brands/:brandId', () => {
  it('rejects when no updatable fields are provided', async () => {
    const res = await request(createApp())
      .put('/api/admin/brands/fedfina')
      .send({ unknown_field: 'x' });
    expect(res.status).toBe(400);
  });

  it('updates allowed fields and returns the updated row', async () => {
    dbModule.pool.query.mockResolvedValueOnce({
      rows: [{ brand_id: 'fedfina', display_name: 'Updated' }],
      rowCount: 1,
    });
    const res = await request(createApp())
      .put('/api/admin/brands/fedfina')
      .send({ display_name: 'Updated', industry: 'Finance' });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('Updated');
    const calledSql = dbModule.pool.query.mock.calls[0][0];
    expect(calledSql).toContain('display_name = $1');
    expect(calledSql).toContain('industry = $2');
    expect(calledSql).toContain('updated_at = NOW()');
  });

  it('returns 404 when brand not found', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(createApp())
      .put('/api/admin/brands/nope')
      .send({ display_name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/brands/:brandId/asset/:vaultId', () => {
  it('soft-deletes and returns ok', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(createApp())
      .delete('/api/admin/brands/fedfina/asset/00000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 404 when asset does not belong to brand', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(createApp())
      .delete('/api/admin/brands/fedfina/asset/missing');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/brands/:brandId/reanalyze', () => {
  it('returns 404 when no .pptx is stored', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(createApp())
      .post('/api/admin/brands/fedfina/reanalyze')
      .send({});
    expect(res.status).toBe(404);
  });

  it('downloads, analyzes, and saves the profile', async () => {
    dbModule.pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'v-pptx',
          filename: 'tmpl.pptx',
          file_url: 'https://r2.example/brand/tmpl.pptx',
          file_type: 'other',
          mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      ],
      rowCount: 1,
    });
    storage.downloadFromUrl.mockResolvedValueOnce(Buffer.from([1, 2, 3]));
    pptxAnalyzer.analyzeTemplate.mockResolvedValueOnce({
      colors: { primary: '#000' },
      fonts: { heading: 'Inter', body: 'Inter' },
    });
    pptxAnalyzer.saveBrandProfile.mockResolvedValueOnce({ id: 'profile-vault-id' });

    const res = await request(createApp())
      .post('/api/admin/brands/fedfina/reanalyze')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(storage.downloadFromUrl).toHaveBeenCalledWith('https://r2.example/brand/tmpl.pptx');
    expect(pptxAnalyzer.saveBrandProfile).toHaveBeenCalledWith(
      'fedfina',
      expect.any(Object),
      'https://r2.example/brand/tmpl.pptx',
    );
  });
});

describe('GET /api/admin/brands/:brandId/preview-prompt', () => {
  it('rejects an invalid surface', async () => {
    const res = await request(createApp())
      .get('/api/admin/brands/fedfina/preview-prompt?surface=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid surface');
  });

  it('returns 404 when the brand does not exist', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(createApp())
      .get('/api/admin/brands/missing/preview-prompt?surface=pptx');
    expect(res.status).toBe(404);
  });

  it('renders the prompt block via buildBrandContextBlock', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rows: [{ exists: 1 }], rowCount: 1 });
    brandContextHelpers.getBrandContextForUser.mockResolvedValueOnce({
      name: 'Fedfina',
      industry: 'Financial Services',
    });
    brandContextHelpers.buildBrandContextBlock.mockReturnValueOnce('=== BRAND CONTEXT ===\nFedfina');

    const res = await request(createApp())
      .get('/api/admin/brands/fedfina/preview-prompt?surface=pptx');
    expect(res.status).toBe(200);
    expect(res.body.surface).toBe('pptx');
    expect(res.body.block).toContain('BRAND CONTEXT');
    expect(brandContextHelpers.buildBrandContextBlock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fedfina' }),
      { surface: 'pptx' },
    );
  });

  it('defaults surface to general when omitted', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rows: [{ exists: 1 }], rowCount: 1 });
    brandContextHelpers.getBrandContextForUser.mockResolvedValueOnce({ name: 'Fedfina' });
    brandContextHelpers.buildBrandContextBlock.mockReturnValueOnce('block');
    const res = await request(createApp())
      .get('/api/admin/brands/fedfina/preview-prompt');
    expect(res.status).toBe(200);
    expect(res.body.surface).toBe('general');
  });
});

describe('POST /api/admin/brands/:brandId/knowledge', () => {
  it('rejects missing doc_type', async () => {
    const res = await request(createApp())
      .post('/api/admin/brands/fedfina/knowledge')
      .send({ content: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('doc_type');
  });

  it('rejects missing content', async () => {
    const res = await request(createApp())
      .post('/api/admin/brands/fedfina/knowledge')
      .send({ doc_type: 'voice' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('content');
  });

  it('upserts and returns 201', async () => {
    dbModule.pool.query.mockResolvedValueOnce({
      rows: [{ brand_id: 'fedfina', doc_type: 'voice', content: 'x', updated_at: 'now' }],
      rowCount: 1,
    });
    const res = await request(createApp())
      .post('/api/admin/brands/fedfina/knowledge')
      .send({ doc_type: 'voice', content: 'x' });
    expect(res.status).toBe(201);
    expect(res.body.doc_type).toBe('voice');
    const sql = dbModule.pool.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT (brand_id, doc_type)');
  });
});

describe('DELETE /api/admin/brands/:brandId/knowledge/:docType', () => {
  it('returns 404 when nothing is deleted', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(createApp())
      .delete('/api/admin/brands/fedfina/knowledge/missing');
    expect(res.status).toBe(404);
  });

  it('returns ok when a row is deleted', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = await request(createApp())
      .delete('/api/admin/brands/fedfina/knowledge/voice');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
