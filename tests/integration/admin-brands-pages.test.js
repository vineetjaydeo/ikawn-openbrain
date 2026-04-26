const request = require('supertest');
const express = require('express');

// Monkey-patch the modules' exports so the route picks up the stubs when it
// `require()`s them. Vi.mock doesn't intercept CJS require in this repo's
// vitest setup; pool.query is mutable on a shared object reference.
const dbModule = require('../../src/db');
dbModule.pool.query = vi.fn();

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
    res.status(500).type('html').send(`<!DOCTYPE html><html><body>${err.message}</body></html>`);
  });
  return app;
}

beforeEach(() => {
  dbModule.pool.query.mockReset();
});

describe('admin-brands HTML pages — auth gate', () => {
  it('returns 401 (JSON) when there is no session user', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = {};
      next();
    });
    app.use(adminBrandsRouter);
    const res = await request(app).get('/admin/brands');
    expect(res.status).toBe(401);
  });
});

describe('GET /admin/brands (list page)', () => {
  it('returns 200 + text/html with rows for the mocked brands', async () => {
    dbModule.pool.query.mockResolvedValueOnce({
      rows: [
        {
          brand_id: 'fedfina',
          display_name: 'Fedfina Capital',
          industry: 'Financial Services',
          updated_at: '2026-04-26T00:00:00Z',
          has_profile: true,
          has_logo: true,
          heading_font: 'Inter',
          body_font: 'Inter',
          template_count: 2,
        },
        {
          brand_id: 'maxfashion',
          display_name: 'MaxFashion',
          industry: 'Retail',
          updated_at: '2026-04-25T00:00:00Z',
          has_profile: false,
          has_logo: false,
          heading_font: null,
          body_font: null,
          template_count: 0,
        },
      ],
      rowCount: 2,
    });
    const res = await request(createApp()).get('/admin/brands');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('Brands');
    // Mocked display_name appears in body
    expect(res.text).toContain('Fedfina Capital');
    expect(res.text).toContain('MaxFashion');
    // Has link to the new-brand page
    expect(res.text).toContain('/admin/brands/new');
  });

  it('renders the empty state when DB returns 0 brands', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(createApp()).get('/admin/brands');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<!DOCTYPE html>');
    // Empty-state copy from brandsListPage()
    expect(res.text).toContain('No brands yet');
    // CTA still links to the new page
    expect(res.text).toContain('/admin/brands/new');
  });
});

describe('GET /admin/brands/new (create form)', () => {
  it('returns 200 + text/html with the create form', async () => {
    const res = await request(createApp()).get('/admin/brands/new');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<!DOCTYPE html>');
    // Form fields
    expect(res.text).toContain('name="brand_id"');
    expect(res.text).toContain('name="display_name"');
    expect(res.text).toContain('name="industry"');
    expect(res.text).toContain('name="tone"');
    expect(res.text).toContain('name="target_audience"');
    // Posts to the API endpoint
    expect(res.text).toContain('/api/admin/brands');
  });
});

describe('GET /admin/brands/:brandId (detail page)', () => {
  it('returns 200 + text/html with brand details when the brand exists', async () => {
    dbModule.pool.query
      // brand_context row
      .mockResolvedValueOnce({
        rows: [
          {
            brand_id: 'fedfina',
            display_name: 'Fedfina Capital',
            industry: 'Financial Services',
            tone: 'Professional',
            tone_of_voice: null,
            target_audience: null,
            brand_guidelines: null,
            preferences: null,
            connected_platforms: null,
            system_prompt_override: null,
            context_injection: null,
            updated_at: '2026-04-26T00:00:00Z',
          },
        ],
        rowCount: 1,
      })
      // vault_items rows
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // brand_knowledge rows
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(createApp()).get('/admin/brands/fedfina');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<!DOCTYPE html>');
    // Display name appears in the page
    expect(res.text).toContain('Fedfina Capital');
    // Section markers (section ids + headings)
    expect(res.text).toContain('id="identity"');
    expect(res.text).toContain('id="visual"');
    expect(res.text).toContain('id="assets"');
    expect(res.text).toContain('id="prompt"');
    expect(res.text).toContain('Identity');
    expect(res.text).toContain('Visual');
    expect(res.text).toContain('Templates');
    expect(res.text).toContain('System prompt');
  });

  it('returns 404 + text/html when the brand does not exist', async () => {
    dbModule.pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(createApp()).get('/admin/brands/missing');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('Brand not found');
  });
});
