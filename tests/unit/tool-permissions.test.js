// Tests for tool permission model in registry.js
'use strict';

describe('tool permissions', () => {
  let checkToolPermission;
  let getToolCostTier;
  let registry;

  beforeEach(() => {
    vi.resetModules();
    registry = require('../../src/tools/registry');
    checkToolPermission = registry.checkToolPermission;
    getToolCostTier = registry.getToolCostTier;
    // Load tools so the registry is populated
    registry.loadTools();
  }, 30000);

  // ── getToolCostTier ──────────────────────────────────────────────────

  describe('getToolCostTier', () => {
    it('returns the default tier for known tools', () => {
      expect(getToolCostTier('system_status')).toBe('low');
      expect(getToolCostTier('code_write')).toBe('medium');
      expect(getToolCostTier('bash_exec')).toBe('high');
      expect(getToolCostTier('deploy_openbrain')).toBe('critical');
    });

    it('defaults to medium for unknown tools', () => {
      expect(getToolCostTier('totally_unknown_tool')).toBe('medium');
    });

    it('uses costTier from tool module.exports if present', () => {
      // Register a fake tool with a custom costTier
      const tools = registry.getTools();
      tools.set('fake_custom_tier', {
        name: 'fake_custom_tier',
        costTier: 'low',
        execute: async () => ({ success: true, data: null, summary: 'ok' }),
      });
      expect(getToolCostTier('fake_custom_tier')).toBe('low');
      // Clean up
      tools.delete('fake_custom_tier');
    });
  });

  // ── checkToolPermission ──────────────────────────────────────────────

  describe('checkToolPermission', () => {
    it('internal brand (ikawn) can use any tool including critical', () => {
      const result = checkToolPermission('deploy_openbrain', { brandId: 'ikawn' });
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('critical');
    });

    it('isInternal flag grants full access', () => {
      const result = checkToolPermission('deploy_openbrain', { brandId: 'some-brand', isInternal: true });
      expect(result.allowed).toBe(true);
    });

    it('external brand blocked from critical tools (deploy_openbrain)', () => {
      const result = checkToolPermission('deploy_openbrain', { brandId: 'maxfashion' });
      expect(result.allowed).toBe(false);
      expect(result.tier).toBe('critical');
      expect(result.reason).toContain('manual approval');
    });

    it('external brand blocked from high tools (bash_exec)', () => {
      const result = checkToolPermission('bash_exec', { brandId: 'maxfashion' });
      expect(result.allowed).toBe(false);
      expect(result.tier).toBe('high');
      expect(result.reason).toContain('restricted');
    });

    it('external brand blocked from high tools (notify)', () => {
      const result = checkToolPermission('notify', { brandId: 'external-co' });
      expect(result.allowed).toBe(false);
      expect(result.tier).toBe('high');
    });

    it('external brand allowed for low tools (system_status)', () => {
      const result = checkToolPermission('system_status', { brandId: 'maxfashion' });
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('low');
    });

    it('external brand allowed for low tools (code_read)', () => {
      const result = checkToolPermission('code_read', { brandId: 'maxfashion' });
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('low');
    });

    it('external brand allowed for medium tools (code_write)', () => {
      const result = checkToolPermission('code_write', { brandId: 'maxfashion' });
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('medium');
    });

    it('external brand allowed for medium tools (code_edit)', () => {
      const result = checkToolPermission('code_edit', { brandId: 'maxfashion' });
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('medium');
    });

    it('tool with custom costTier on module.exports overrides default', () => {
      // bash_exec defaults to 'high', but if tool exports costTier: 'low', that wins
      const tools = registry.getTools();
      tools.set('bash_exec_custom', {
        name: 'bash_exec_custom',
        costTier: 'low',
        execute: async () => ({ success: true, data: null, summary: 'ok' }),
      });

      const result = checkToolPermission('bash_exec_custom', { brandId: 'external-co' });
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('low');

      tools.delete('bash_exec_custom');
    });

    it('unknown tool defaults to medium tier and is allowed for external', () => {
      const result = checkToolPermission('some_unknown_tool', { brandId: 'external-co' });
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('medium');
    });

    it('no context defaults to allowing (medium tier unknown tool)', () => {
      const result = checkToolPermission('some_unknown_tool');
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('medium');
    });
  });
});
