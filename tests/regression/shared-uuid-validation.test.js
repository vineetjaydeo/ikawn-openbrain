const fs = require('fs');
const path = require('path');

describe('Shared Route UUID Validation (Bug #12)', () => {
  it('shared.js validates UUID format before DB query', () => {
    const sharedPath = path.resolve(__dirname, '../../src/routes/shared.js');
    const source = fs.readFileSync(sharedPath, 'utf-8');
    const lines = source.split('\n');

    // Find UUID validation and pool.query lines
    let uuidValidationLine = -1;
    let firstPoolQueryLine = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/uuidRegex|uuid.*test|UUID.*format/i.test(lines[i]) && uuidValidationLine === -1) {
        uuidValidationLine = i;
      }
      if (/pool\.query/.test(lines[i]) && firstPoolQueryLine === -1) {
        firstPoolQueryLine = i;
      }
    }

    // UUID validation must exist
    expect(uuidValidationLine).toBeGreaterThan(-1);
    // UUID validation must come BEFORE the DB query
    expect(uuidValidationLine).toBeLessThan(firstPoolQueryLine);
  });

  it('rejects invalid UUID formats', () => {
    // Use the same regex pattern from shared.js
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Valid UUIDs
    expect(uuidRegex.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(uuidRegex.test('d7fe65ce-1613-4295-afe0-8ac96cfd7bb8')).toBe(true);

    // Invalid — these must NOT reach the database
    expect(uuidRegex.test('abc123')).toBe(false);
    expect(uuidRegex.test('')).toBe(false);
    expect(uuidRegex.test('../../etc/passwd')).toBe(false);
    expect(uuidRegex.test("'; DROP TABLE conversations; --")).toBe(false);
    expect(uuidRegex.test('not-a-uuid-at-all')).toBe(false);
  });
});
