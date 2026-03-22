const fs = require('fs');
const path = require('path');

describe('GitHub Webhook SQL Parameterization (Bug #7)', () => {
  const webhooksPath = path.resolve(__dirname, '../../src/routes/webhooks.js');
  const source = fs.readFileSync(webhooksPath, 'utf-8');

  it('does not interpolate req.brand_id directly into SQL template literals', () => {
    // Find all template literals that contain SQL keywords
    const templateLiterals = source.match(/`[^`]*(?:INSERT|UPDATE|DELETE|SELECT)[^`]*`/gs) || [];

    for (const literal of templateLiterals) {
      // None should contain ${req.brand_id} — use $N parameterized placeholders instead
      expect(literal).not.toContain('${req.brand_id}');
      expect(literal).not.toContain('${req.session');
    }
  });

  it('uses $N placeholders in INSERT statements', () => {
    // All pool.query INSERT calls should use parameterized placeholders
    const insertStatements = source.match(/pool\.query\(\s*`[^`]*INSERT[^`]*`/gs) || [];

    for (const stmt of insertStatements) {
      // Should contain $1, $2, etc. — not direct variable interpolation
      expect(stmt).toMatch(/\$\d/);
    }
  });
});
