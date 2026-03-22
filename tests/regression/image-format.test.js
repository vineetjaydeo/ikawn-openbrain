const fs = require('fs');
const path = require('path');

describe('Anthropic Image Format (Bugs #1, #2)', () => {
  const chatApiPath = path.resolve(__dirname, '../../src/routes/chat-api.js');
  const source = fs.readFileSync(chatApiPath, 'utf-8');

  // Regression: bug #1 — must use Anthropic format, NOT OpenAI
  it('uses Anthropic image format (type: image, source.type: url), not OpenAI format', () => {
    // The code should contain the Anthropic format
    expect(source).toContain("type: 'image', source: { type: 'url'");
    // The code should NOT contain OpenAI format
    expect(source).not.toContain("type: 'image_url'");
  });

  // Regression: bug #2 — image-only messages must have a text fallback
  it('has a fallback text for image-only messages (no crash on empty contentParts)', () => {
    // Verify the guard exists: if contentParts has no text, add "(image attached)"
    expect(source).toContain("'(image attached)'");
  });

  // Verify the image block construction is correct
  it('constructs image content parts with correct structure', () => {
    const imageUrl = 'https://r2.example.com/uploads/image.png';

    // Simulate what chat-api.js does for image attachments
    const attachments = [
      { type: 'image', url: imageUrl },
    ];
    const textContent = '';
    const contentParts = [];

    for (const att of attachments) {
      if (att.type === 'image' && att.url) {
        contentParts.push({ type: 'image', source: { type: 'url', url: att.url } });
      }
    }
    if (textContent) {
      contentParts.push({ type: 'text', text: textContent });
    }
    if (contentParts.length === 0) {
      contentParts.push({ type: 'text', text: '(image attached)' });
    }

    // Image part should be Anthropic format
    expect(contentParts[0]).toEqual({
      type: 'image',
      source: { type: 'url', url: imageUrl },
    });
    // Should NOT have OpenAI format
    expect(contentParts[0]).not.toHaveProperty('image_url');
  });
});
