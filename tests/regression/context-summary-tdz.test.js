const fs = require('fs');
const path = require('path');

describe('contextSummary TDZ Fix (2026-03-22)', () => {
  const chatApiPath = path.resolve(__dirname, '../../src/routes/chat-api.js');
  const source = fs.readFileSync(chatApiPath, 'utf-8');
  const lines = source.split('\n');

  it('contextSummary is declared before first usage in template literal', () => {
    let declarationLine = -1;
    let firstUsageLine = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(const|let)\s+contextSummary\s*=/.test(lines[i])) {
        if (declarationLine === -1) declarationLine = i;
      }
      if (firstUsageLine === -1 && /\$\{contextSummary/.test(lines[i])) {
        firstUsageLine = i;
      }
    }

    expect(declarationLine).toBeGreaterThan(-1);
    expect(firstUsageLine).toBeGreaterThan(-1);
    // Declaration MUST come before first usage to avoid TDZ
    expect(declarationLine).toBeLessThan(firstUsageLine);
  });

  it('contextSummary is only declared once in the file', () => {
    const declarations = source.match(/const\s+contextSummary\s*=/g) || [];
    expect(declarations.length).toBe(1);
  });
});
