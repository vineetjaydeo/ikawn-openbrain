'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

let _genAI = null;

function getGenAI() {
  if (!_genAI) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
    _genAI = new GoogleGenerativeAI(apiKey);
  }
  return _genAI;
}

async function getEmbedding(text) {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: 768
  });
  return result.embedding.values;
}

module.exports = { getEmbedding };
