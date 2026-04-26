// scripts/test-brand-injection.js
//
// Local sanity check for the brand-context injection added to chat-api.js
// and the three document-generation tools. No DB required: we mock the
// helper output for a Fedfina-style profile and a null-profile case, then
// build the prompt block and inspect it.
//
// Usage:
//   node scripts/test-brand-injection.js
'use strict';

const { buildBrandContextBlock } = require('../src/utils/brand-context');

function divider(label) {
  const bar = '─'.repeat(60);
  console.log(`\n${bar}\n${label}\n${bar}`);
}

function fakeFedfina() {
  return {
    name: 'Fedfina',
    industry: 'NBFC / financial services',
    tone: 'formal, precise, trust-building',
    audience: 'branch managers and credit officers at mid-market lenders',
    colors: { primary: '#0A2540', secondary: '#FFFFFF', accent: '#0070F3' },
    fonts: { heading: 'Inter', body: 'Inter' },
    hasLogo: true,
  };
}

function buildSystemPromptWith(profile, surface) {
  const brandBlock = buildBrandContextBlock(profile, { surface });
  // Mimic the structure used in chat-api.js around the system prompt
  const skeleton = [
    'You ARE Lucy. iKawn intelligent commerce copilot.',
    '',
    '=== YOUR SOUL ===',
    '(soul body omitted for test)',
    '',
    '=== HOW YOU REMEMBER ===',
    '(memory body omitted)',
    '',
    brandBlock || '',
    '',
    '=== WHO YOU ARE TALKING TO ===',
    'You are speaking with: TestUser (role: admin)',
  ].filter(Boolean).join('\n');
  return skeleton;
}

function main() {
  const fed = fakeFedfina();

  divider('1. SYSTEM PROMPT WITH FEDFINA BRAND CONTEXT (general surface)');
  console.log(buildSystemPromptWith(fed, 'general'));

  divider('2. SYSTEM PROMPT WITH FEDFINA — pptx surface');
  console.log(buildSystemPromptWith(fed, 'pptx'));

  divider('3. SYSTEM PROMPT WITH FEDFINA — document surface');
  console.log(buildSystemPromptWith(fed, 'document'));

  divider('4. SYSTEM PROMPT WITH FEDFINA — spreadsheet surface');
  console.log(buildSystemPromptWith(fed, 'spreadsheet'));

  divider('5. SYSTEM PROMPT WITH NULL BRAND CONTEXT (graceful fallback)');
  console.log(buildSystemPromptWith(null, 'general'));

  divider('CHECKS');
  const fedBlock = buildBrandContextBlock(fed);
  const nullBlock = buildBrandContextBlock(null);
  const checks = [
    ['Fedfina block contains "BRAND CONTEXT"', fedBlock.includes('BRAND CONTEXT')],
    ['Fedfina block contains brand name', fedBlock.includes('Fedfina')],
    ['Fedfina block contains industry', fedBlock.includes('NBFC')],
    ['Fedfina block contains tone', fedBlock.includes('formal')],
    ['Fedfina block contains audience', fedBlock.includes('credit officers')],
    ['Fedfina block forbids emojis', fedBlock.toLowerCase().includes('emojis')],
    ['Null profile yields empty block', nullBlock === ''],
    ['Fedfina block has no em-dash', !fedBlock.includes('—')],
    ['Fedfina block has no en-dash', !fedBlock.includes('–')],
  ];
  let allPass = true;
  for (const [label, ok] of checks) {
    console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}`);
    if (!ok) allPass = false;
  }
  console.log(`\nResult: ${allPass ? 'ALL PASS' : 'FAILURES PRESENT'}`);
  process.exit(allPass ? 0 : 1);
}

main();
