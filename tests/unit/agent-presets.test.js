'use strict';

const { PRESETS, getPreset, getPresetTypes, validatePresetType } = require('../../src/engine/agent-presets');
const { CATEGORIES } = require('../../src/engine/tool-interface');

const REQUIRED_FIELDS = ['type', 'role', 'toolScope', 'tokenBudget', 'dollarCap', 'modelTier', 'systemPromptAddition'];

describe('agent-presets', () => {
  it('defines all 6 presets', () => {
    const types = ['coordinator', 'researcher', 'builder', 'reviewer', 'deployer', 'analyst'];
    expect(Object.keys(PRESETS)).toEqual(expect.arrayContaining(types));
    expect(Object.keys(PRESETS)).toHaveLength(6);
  });

  it('each preset has all required fields', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      for (const field of REQUIRED_FIELDS) {
        expect(preset).toHaveProperty(field);
      }
    }
  });

  it('coordinator has all 6 tool categories', () => {
    expect(PRESETS.coordinator.toolScope).toEqual(expect.arrayContaining([...CATEGORIES]));
    expect(PRESETS.coordinator.toolScope).toHaveLength(CATEGORIES.length);
  });

  it('researcher limited to observe+analyze only', () => {
    expect(PRESETS.researcher.toolScope).toEqual(['observe', 'analyze']);
  });

  it('deployer limited to execute+ship only', () => {
    expect(PRESETS.deployer.toolScope).toEqual(['execute', 'ship']);
  });

  it('all presets are frozen', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(Object.isFrozen(preset)).toBe(true);
    }
  });

  it('getPreset returns correct preset', () => {
    expect(getPreset('coordinator')).toBe(PRESETS.coordinator);
    expect(getPreset('builder')).toBe(PRESETS.builder);
    expect(getPreset('analyst')).toBe(PRESETS.analyst);
  });

  it('getPreset returns null for unknown type', () => {
    expect(getPreset('unknown')).toBeNull();
    expect(getPreset('')).toBeNull();
    expect(getPreset(undefined)).toBeNull();
  });

  it('validatePresetType works correctly', () => {
    expect(validatePresetType('coordinator')).toBe(true);
    expect(validatePresetType('researcher')).toBe(true);
    expect(validatePresetType('unknown')).toBe(false);
    expect(validatePresetType('')).toBe(false);
  });

  it('PRESETS container is frozen', () => {
    expect(Object.isFrozen(PRESETS)).toBe(true);
  });
});
