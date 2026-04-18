// Tests for orbit.tool.js and orbit-connections.tool.js

describe('orbit tools', () => {
  let orbitPost;
  let orbitCheck;
  let fetchMock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    orbitPost = require('../../src/tools/orbit.tool.js');
    orbitCheck = require('../../src/tools/orbit-connections.tool.js');
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    process.env.IKAWN_OS_API_KEY = 'ik_test_key';
    process.env.IKAWN_OS_BASE_URL = 'https://ikawn-os-staging.fly.dev';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.IKAWN_OS_API_KEY;
    delete process.env.IKAWN_OS_BASE_URL;
  });

  // ── Registration shape ──────────────────────────────────────────────

  describe('tool shape', () => {
    it('orbit_post has name, description, parameters, execute', () => {
      expect(orbitPost.name).toBe('orbit_post');
      expect(typeof orbitPost.description).toBe('string');
      expect(orbitPost.parameters).toBeDefined();
      expect(typeof orbitPost.execute).toBe('function');
    });

    it('orbit_check_connections has name, description, parameters, execute', () => {
      expect(orbitCheck.name).toBe('orbit_check_connections');
      expect(typeof orbitCheck.description).toBe('string');
      expect(orbitCheck.parameters).toBeDefined();
      expect(typeof orbitCheck.execute).toBe('function');
    });

    it('orbit_post requires projectId, platforms, content', () => {
      expect(orbitPost.parameters.projectId.required).toBe(true);
      expect(orbitPost.parameters.platforms.required).toBe(true);
      expect(orbitPost.parameters.content.required).toBe(true);
    });
  });

  // ── Missing key ─────────────────────────────────────────────────────

  describe('missing API key', () => {
    it('orbit_post returns graceful error when IKAWN_OS_API_KEY missing', async () => {
      delete process.env.IKAWN_OS_API_KEY;
      const res = await orbitPost.execute(
        { projectId: 'p1', platforms: ['instagram'], content: 'hi' },
        {}
      );
      expect(res.success).toBe(false);
      expect(res.summary).toMatch(/IKAWN_OS_API_KEY/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('orbit_check_connections returns graceful error when key missing', async () => {
      delete process.env.IKAWN_OS_API_KEY;
      const res = await orbitCheck.execute({ projectId: 'p1' }, {});
      expect(res.success).toBe(false);
      expect(res.summary).toMatch(/IKAWN_OS_API_KEY/);
    });
  });

  // ── Input validation ────────────────────────────────────────────────

  describe('input validation', () => {
    it('orbit_post rejects missing projectId', async () => {
      const res = await orbitPost.execute({ platforms: ['instagram'], content: 'hi' }, {});
      expect(res.success).toBe(false);
      expect(res.summary).toMatch(/projectId/);
    });

    it('orbit_post rejects empty platforms', async () => {
      const res = await orbitPost.execute({ projectId: 'p1', platforms: [], content: 'hi' }, {});
      expect(res.success).toBe(false);
      expect(res.summary).toMatch(/platforms/);
    });

    it('orbit_post rejects content over 2200 chars', async () => {
      const long = 'x'.repeat(2201);
      const res = await orbitPost.execute(
        { projectId: 'p1', platforms: ['instagram'], content: long },
        {}
      );
      expect(res.success).toBe(false);
      expect(res.summary).toMatch(/2200/);
    });

    it('orbit_check_connections rejects missing projectId', async () => {
      const res = await orbitCheck.execute({}, {});
      expect(res.success).toBe(false);
      expect(res.summary).toMatch(/projectId/);
    });
  });

  // ── Happy path ──────────────────────────────────────────────────────

  describe('happy path', () => {
    it('orbit_post POSTs with bearer auth, body, returns postId', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ postId: 'post_abc', status: 'scheduled', scheduledAt: '2026-04-20T10:00:00Z' }),
        text: async () => '',
      });

      const res = await orbitPost.execute(
        {
          projectId: 'proj_1',
          platforms: ['instagram', 'linkedin'],
          content: 'Launch day',
          mediaUrls: ['https://cdn.example/img.jpg'],
          scheduleAt: '2026-04-20T10:00:00Z',
        },
        {}
      );

      expect(res.success).toBe(true);
      expect(res.data.postId).toBe('post_abc');
      expect(res.data.status).toBe('scheduled');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://ikawn-os-staging.fly.dev/api/external/orbit/post');
      expect(opts.method).toBe('POST');
      expect(opts.headers.Authorization).toBe('Bearer ik_test_key');
      expect(opts.headers['X-Api-Key']).toBe('ik_test_key');
      expect(opts.headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(opts.body);
      expect(body.projectId).toBe('proj_1');
      expect(body.platforms).toEqual(['instagram', 'linkedin']);
      expect(body.content).toBe('Launch day');
      expect(body.mediaUrls).toEqual(['https://cdn.example/img.jpg']);
      expect(body.scheduleAt).toBe('2026-04-20T10:00:00Z');
    });

    it('orbit_check_connections GETs with query param and returns connections', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          connections: [
            { platform: 'instagram', status: 'healthy' },
            { platform: 'linkedin', status: 'expired' },
          ],
        }),
        text: async () => '',
      });

      const res = await orbitCheck.execute({ projectId: 'proj_1' }, {});

      expect(res.success).toBe(true);
      expect(res.data.connections).toHaveLength(2);
      expect(res.data.connections[0].platform).toBe('instagram');
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://ikawn-os-staging.fly.dev/api/external/orbit/connections?projectId=proj_1');
      expect(opts.method).toBe('GET');
      expect(opts.headers.Authorization).toBe('Bearer ik_test_key');
    });
  });

  // ── Retry / error behavior ──────────────────────────────────────────

  describe('retry and error handling', () => {
    it('does NOT retry on 4xx', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({}),
        text: async () => 'invalid platforms',
      });

      const res = await orbitPost.execute(
        { projectId: 'p1', platforms: ['instagram'], content: 'hi' },
        {}
      );

      expect(res.success).toBe(false);
      expect(res.data.status).toBe(400);
      expect(res.data.source).toBe('upstream_4xx');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries once on 5xx then succeeds', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({}),
          text: async () => 'bad gateway',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ postId: 'post_retry', status: 'queued' }),
          text: async () => '',
        });

      const res = await orbitPost.execute(
        { projectId: 'p1', platforms: ['instagram'], content: 'hi' },
        {}
      );

      expect(res.success).toBe(true);
      expect(res.data.postId).toBe('post_retry');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('gives up after 2 attempts on persistent 5xx', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({}),
        text: async () => 'upstream down',
      });

      const res = await orbitPost.execute(
        { projectId: 'p1', platforms: ['instagram'], content: 'hi' },
        {}
      );

      expect(res.success).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
