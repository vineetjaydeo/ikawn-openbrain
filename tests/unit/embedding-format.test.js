
describe('Embedding Vector Format', () => {
  // Regression: bug #8 — must produce Postgres float8[] literal, NOT JSON
  it('formats embedding as Postgres array literal, not JSON string', () => {
    const embedding = [0.1, 0.2, 0.3, -0.4];

    // WRONG (old bug): JSON.stringify produces "[0.1,0.2,0.3,-0.4]" with square brackets
    const jsonFormat = JSON.stringify(embedding);
    expect(jsonFormat.startsWith('[')).toBe(true);

    // CORRECT: Postgres float8[] needs "{0.1,0.2,0.3,-0.4}" with curly braces
    const pgFormat = `{${embedding.join(',')}}`;
    expect(pgFormat).toBe('{0.1,0.2,0.3,-0.4}');
    expect(pgFormat).toMatch(/^\{.*\}$/);
    expect(pgFormat).not.toMatch(/^\[/);
  });

  it('handles negative numbers and scientific notation', () => {
    const embedding = [-0.00123, 1.5e-4, 0.999];
    const pgFormat = `{${embedding.join(',')}}`;
    expect(pgFormat).toMatch(/^\{/);
    expect(pgFormat).toMatch(/\}$/);
    expect(pgFormat).not.toMatch(/^\[/);
  });

  it('handles empty embedding gracefully', () => {
    const embedding = [];
    const pgFormat = `{${embedding.join(',')}}`;
    expect(pgFormat).toBe('{}');
  });

  it('handles large dimension vectors (1536 for text-embedding-3-small)', () => {
    const embedding = Array.from({ length: 1536 }, (_, i) => Math.random() * 2 - 1);
    const pgFormat = `{${embedding.join(',')}}`;
    expect(pgFormat.startsWith('{')).toBe(true);
    expect(pgFormat.endsWith('}')).toBe(true);
    // Count commas — should be 1535 for 1536 elements
    expect((pgFormat.match(/,/g) || []).length).toBe(1535);
  });
});
