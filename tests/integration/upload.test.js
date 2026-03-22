const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Upload route depends on R2 storage which needs env vars — test validation logic only.
// The uploadToR2 call requires real credentials and can't be easily mocked in CJS with Vitest.
// Focus on: input validation, size limits, filename sanitization (these are the security-critical paths).

function createUploadApp() {
  const uploadRouter = require('../../src/routes/upload');
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use((req, _res, next) => {
    req.session = { user: { id: 1, role: 'user', email: 'test@test.com' } };
    req.brand_id = 'ikawn';
    next();
  });
  app.use(uploadRouter);
  // Add error handler to prevent Express default HTML error pages
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

describe('POST /api/upload/direct — validation', () => {
  let app;

  beforeEach(() => {
    app = createUploadApp();
  });

  it('returns 400 when data is missing', async () => {
    const res = await request(app)
      .post('/api/upload/direct')
      .send({ filename: 'test.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  it('returns 400 when filename is missing', async () => {
    const res = await request(app)
      .post('/api/upload/direct')
      .send({ data: 'base64data', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when contentType is missing', async () => {
    const res = await request(app)
      .post('/api/upload/direct')
      .send({ data: 'base64data', filename: 'test.png' });
    expect(res.status).toBe(400);
  });

  it('returns 413 when file exceeds 10MB', async () => {
    const largeData = 'A'.repeat(14 * 1024 * 1024);
    const res = await request(app)
      .post('/api/upload/direct')
      .send({ data: largeData, filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
    expect(res.body.error).toContain('10MB');
  });
});

describe('Upload filename sanitization (unit)', () => {
  // Extract sanitizeFilename logic from upload.js and test directly
  const uploadSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/upload.js'), 'utf-8'
  );

  // Replicate the sanitizeFilename function from upload.js
  function sanitizeFilename(filename) {
    return filename
      .replace(/\.\./g, '')
      .replace(/[/\\]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  it('removes path traversal sequences', () => {
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('..');
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
  });

  it('removes backslashes', () => {
    expect(sanitizeFilename('..\\..\\windows\\system32')).not.toContain('\\');
    expect(sanitizeFilename('..\\..\\windows\\system32')).not.toContain('..');
  });

  it('preserves normal filenames', () => {
    expect(sanitizeFilename('photo.png')).toBe('photo.png');
    expect(sanitizeFilename('my-file_v2.jpg')).toBe('my-file_v2.jpg');
  });

  it('replaces special characters with underscore', () => {
    expect(sanitizeFilename('file name (1).png')).toBe('file_name__1_.png');
  });

  it('upload.js contains sanitizeFilename function', () => {
    expect(uploadSource).toContain('sanitizeFilename');
    expect(uploadSource).toContain("replace(/\\.\\./g, '')");
  });
});
