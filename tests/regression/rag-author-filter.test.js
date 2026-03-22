const fs = require('fs');
const path = require('path');

describe('RAG Author Filter (Bug #3)', () => {
  // Regression: Ruhi's own responses must be excluded from RAG search results
  // If this filter is removed, Ruhi will echo her own "I found nothing" as fact

  it('chat-api.js RAG query excludes author=ruhi', () => {
    const chatApiPath = path.resolve(__dirname, '../../src/routes/chat-api.js');
    const source = fs.readFileSync(chatApiPath, 'utf-8');

    // The searchMemories function must have author != 'ruhi' in its SQL
    expect(source).toMatch(/author\s*!=\s*'ruhi'/);
  });

  it('ruhi-chat.js RAG query excludes author=ruhi', () => {
    const ruhiChatPath = path.resolve(__dirname, '../../src/routes/ruhi-chat.js');
    const source = fs.readFileSync(ruhiChatPath, 'utf-8');

    expect(source).toMatch(/author\s*!=\s*'ruhi'/);
  });
});
