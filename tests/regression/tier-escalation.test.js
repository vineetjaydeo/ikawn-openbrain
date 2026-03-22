const fs = require('fs');
const path = require('path');

describe('Tier Escalation Regression (Bugs #16, #17)', () => {
  const chatApiPath = path.resolve(__dirname, '../../src/routes/chat-api.js');
  const source = fs.readFileSync(chatApiPath, 'utf-8');

  it('detectTier does not reference historyRows content for keyword matching', () => {
    // Extract the detectTier function body
    const match = source.match(/function detectTier\([\s\S]*?\n\}/);
    expect(match).not.toBeNull();

    const fnBody = match[0];

    // The function should NOT iterate over historyRows to check content
    // It should only check `content` (the current message), `forcedTier`, and `contextSummary`
    expect(fnBody).not.toContain('historyRows.forEach');
    expect(fnBody).not.toContain('historyRows.map');
    expect(fnBody).not.toContain('historyRows.some');
    expect(fnBody).not.toContain('historyRows.find');
    expect(fnBody).not.toContain('for (const msg of historyRows');
    expect(fnBody).not.toContain('for (let');
  });

  it('detectTier uses only content, forcedTier, and contextSummary for decisions', () => {
    const match = source.match(/function detectTier\([\s\S]*?\n\}/);
    const fnBody = match[0];

    // Should reference these inputs
    expect(fnBody).toContain('content');
    expect(fnBody).toContain('forcedTier');
    expect(fnBody).toContain('contextSummary');

    // Should NOT have sticky state variables
    expect(fnBody).not.toContain('previousTier');
    expect(fnBody).not.toContain('lastTier');
    expect(fnBody).not.toContain('currentTier');
  });
});
