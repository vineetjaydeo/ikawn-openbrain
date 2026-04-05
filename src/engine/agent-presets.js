'use strict';

const { CATEGORIES } = require('./tool-interface');

const PRESETS = Object.freeze({
  coordinator: Object.freeze({
    type: 'coordinator',
    role: 'Coordinates sub-agents and synthesizes results',
    toolScope: [...CATEGORIES],
    tokenBudget: 200000,
    dollarCap: 2.00,
    modelTier: 'balanced',
    systemPromptAddition: '',
  }),
  researcher: Object.freeze({
    type: 'researcher',
    role: 'Investigates thoroughly using observe and analyze tools',
    toolScope: ['observe', 'analyze'],
    tokenBudget: 60000,
    dollarCap: 0.50,
    modelTier: 'fast',
    systemPromptAddition: 'You are a researcher. Investigate thoroughly. Use observe and analyze tools. Return structured findings.',
  }),
  builder: Object.freeze({
    type: 'builder',
    role: 'Writes clean, tested code following project conventions',
    toolScope: ['analyze', 'create'],
    tokenBudget: 200000,
    dollarCap: 1.00,
    modelTier: 'balanced',
    systemPromptAddition: 'You are a builder. Write clean, tested code. Follow project conventions. Return file paths modified.',
  }),
  reviewer: Object.freeze({
    type: 'reviewer',
    role: 'Checks code quality, runs tests, verifies correctness',
    toolScope: ['analyze', 'execute'],
    tokenBudget: 60000,
    dollarCap: 0.50,
    modelTier: 'balanced',
    systemPromptAddition: 'You are a reviewer. Check code quality, run tests, verify correctness. Return pass/fail with details.',
  }),
  deployer: Object.freeze({
    type: 'deployer',
    role: 'Deploys safely with pre-checks and post-verification',
    toolScope: ['execute', 'ship'],
    tokenBudget: 30000,
    dollarCap: 0.25,
    modelTier: 'fast',
    systemPromptAddition: 'You are a deployer. Deploy safely. Run pre-deploy checks. Verify after deploy. Return deploy status.',
  }),
  analyst: Object.freeze({
    type: 'analyst',
    role: 'Analyzes data, finds insights, communicates findings',
    toolScope: ['observe', 'analyze', 'communicate'],
    tokenBudget: 60000,
    dollarCap: 0.50,
    modelTier: 'fast',
    systemPromptAddition: 'You are an analyst. Analyze data, find insights. Be precise with numbers. Return structured analysis.',
  }),
});

function getPreset(type) {
  return PRESETS[type] ?? null;
}

function getPresetTypes() {
  return Object.keys(PRESETS);
}

function validatePresetType(type) {
  return type in PRESETS;
}

module.exports = {
  PRESETS,
  getPreset,
  getPresetTypes,
  validatePresetType,
};
