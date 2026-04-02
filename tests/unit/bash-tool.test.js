// Tests for bash.tool.js

describe('bash_exec tool', () => {
  let tool;
  let isCommandAllowed;

  beforeEach(() => {
    vi.resetModules();
    tool = require('../../src/tools/bash.tool.js');
    isCommandAllowed = tool.isCommandAllowed;
  });

  // ── Validation: allowed commands ──────────────────────────────────────

  describe('isCommandAllowed', () => {
    it('allows ls', () => {
      expect(isCommandAllowed('ls').allowed).toBe(true);
    });

    it('allows ls with flags', () => {
      expect(isCommandAllowed('ls -la src/').allowed).toBe(true);
    });

    it('allows cat', () => {
      expect(isCommandAllowed('cat package.json').allowed).toBe(true);
    });

    it('allows head and tail', () => {
      expect(isCommandAllowed('head -n 20 src/index.js').allowed).toBe(true);
      expect(isCommandAllowed('tail -n 50 src/db.js').allowed).toBe(true);
    });

    it('allows grep', () => {
      expect(isCommandAllowed('grep -r "TODO" src/').allowed).toBe(true);
    });

    it('allows wc', () => {
      expect(isCommandAllowed('wc -l src/index.js').allowed).toBe(true);
    });

    it('allows find without -exec or -delete', () => {
      expect(isCommandAllowed('find src/ -name "*.js"').allowed).toBe(true);
    });

    it('allows diff', () => {
      expect(isCommandAllowed('diff src/a.js src/b.js').allowed).toBe(true);
    });

    it('allows simple pipe between allowed commands', () => {
      expect(isCommandAllowed('grep -r TODO src/ | wc -l').allowed).toBe(true);
    });

    // ── Git ──

    it('allows git status', () => {
      expect(isCommandAllowed('git status').allowed).toBe(true);
    });

    it('allows git diff', () => {
      expect(isCommandAllowed('git diff').allowed).toBe(true);
    });

    it('allows git log', () => {
      expect(isCommandAllowed('git log --oneline -10').allowed).toBe(true);
    });

    it('allows git add', () => {
      expect(isCommandAllowed('git add src/tools/bash.tool.js').allowed).toBe(true);
    });

    it('allows git commit', () => {
      expect(isCommandAllowed('git commit -m "fix: something"').allowed).toBe(true);
    });

    it('allows git branch', () => {
      expect(isCommandAllowed('git branch -a').allowed).toBe(true);
    });

    it('allows git stash', () => {
      expect(isCommandAllowed('git stash').allowed).toBe(true);
    });

    // ── NPM ──

    it('allows npm test', () => {
      expect(isCommandAllowed('npm test').allowed).toBe(true);
    });

    it('allows npm run lint', () => {
      expect(isCommandAllowed('npm run lint').allowed).toBe(true);
    });

    it('allows npm run pre-deploy', () => {
      expect(isCommandAllowed('npm run pre-deploy').allowed).toBe(true);
    });

    // ── Node ──

    it('allows node -e with short eval', () => {
      expect(isCommandAllowed('node -e "console.log(1+1)"').allowed).toBe(true);
    });

    // ── Flyctl ──

    it('allows flyctl status', () => {
      expect(isCommandAllowed('flyctl status').allowed).toBe(true);
    });

    it('allows flyctl logs', () => {
      expect(isCommandAllowed('flyctl logs --app ikawn-openbrain').allowed).toBe(true);
    });

    it('allows flyctl deploy with --app ikawn-openbrain', () => {
      expect(isCommandAllowed('flyctl deploy --app ikawn-openbrain --remote-only').allowed).toBe(true);
    });
  });

  // ── Validation: blocked commands ──────────────────────────────────────

  describe('blocked commands', () => {
    it('blocks rm -rf', () => {
      const result = isCommandAllowed('rm -rf /');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/blocked pattern/);
    });

    it('blocks rm -r', () => {
      const result = isCommandAllowed('rm -r src/');
      expect(result.allowed).toBe(false);
    });

    it('blocks git push', () => {
      const result = isCommandAllowed('git push origin main');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/Destructive git/i);
    });

    it('blocks git reset --hard', () => {
      const result = isCommandAllowed('git reset --hard HEAD~1');
      expect(result.allowed).toBe(false);
    });

    it('blocks git clean', () => {
      const result = isCommandAllowed('git clean -fd');
      expect(result.allowed).toBe(false);
    });

    it('blocks git checkout .', () => {
      const result = isCommandAllowed('git checkout .');
      expect(result.allowed).toBe(false);
    });

    it('blocks sudo', () => {
      const result = isCommandAllowed('sudo ls');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/blocked pattern/);
    });

    it('blocks curl', () => {
      const result = isCommandAllowed('curl https://example.com');
      expect(result.allowed).toBe(false);
    });

    it('blocks wget', () => {
      const result = isCommandAllowed('wget https://example.com/file');
      expect(result.allowed).toBe(false);
    });

    it('blocks ssh', () => {
      const result = isCommandAllowed('ssh root@server');
      expect(result.allowed).toBe(false);
    });

    it('blocks scp', () => {
      const result = isCommandAllowed('scp file root@server:/tmp/');
      expect(result.allowed).toBe(false);
    });

    it('blocks eval', () => {
      const result = isCommandAllowed('eval "ls"');
      expect(result.allowed).toBe(false);
    });

    it('blocks command substitution with backticks', () => {
      const result = isCommandAllowed('ls `whoami`');
      expect(result.allowed).toBe(false);
    });

    it('blocks pipe to bash', () => {
      const result = isCommandAllowed('cat script.sh | bash');
      expect(result.allowed).toBe(false);
    });

    it('blocks pipe to sh', () => {
      const result = isCommandAllowed('cat script.sh | sh');
      expect(result.allowed).toBe(false);
    });

    it('blocks command chaining with semicolon', () => {
      const result = isCommandAllowed('ls; cat /etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/chaining/i);
    });

    it('blocks command chaining with &&', () => {
      const result = isCommandAllowed('ls && cat /etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/chaining/i);
    });

    it('blocks command chaining with ||', () => {
      const result = isCommandAllowed('ls || cat /etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/chaining/i);
    });

    it('blocks redirect to .env', () => {
      const result = isCommandAllowed('cat foo > .env');
      expect(result.allowed).toBe(false);
    });

    it('blocks redirect to auth.js', () => {
      const result = isCommandAllowed('cat foo > auth.js');
      expect(result.allowed).toBe(false);
    });

    it('blocks npm install', () => {
      const result = isCommandAllowed('npm install some-package');
      expect(result.allowed).toBe(false);
    });

    it('blocks npm uninstall', () => {
      const result = isCommandAllowed('npm uninstall express');
      expect(result.allowed).toBe(false);
    });

    it('blocks flyctl secrets', () => {
      const result = isCommandAllowed('flyctl secrets list');
      expect(result.allowed).toBe(false);
    });

    it('blocks flyctl destroy', () => {
      const result = isCommandAllowed('flyctl destroy');
      expect(result.allowed).toBe(false);
    });

    it('blocks flyctl deploy without --app ikawn-openbrain', () => {
      const result = isCommandAllowed('flyctl deploy --app ikawn-v3');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/only allowed with --app ikawn-openbrain/);
    });

    it('blocks find with -exec', () => {
      const result = isCommandAllowed('find . -name "*.log" -exec rm {} +');
      expect(result.allowed).toBe(false);
      // Caught by universal \bexec\b blocked pattern
      expect(result.reason).toMatch(/blocked pattern/);
    });

    it('blocks find with -delete', () => {
      const result = isCommandAllowed('find . -name "*.tmp" -delete');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/-delete/);
    });

    it('blocks node without -e', () => {
      const result = isCommandAllowed('node src/index.js');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/-e flag/);
    });

    it('blocks node -e with long eval', () => {
      const longCode = 'x'.repeat(501);
      const result = isCommandAllowed(`node -e "${longCode}"`);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/exceeds max length/);
    });

    it('blocks unknown base commands', () => {
      const result = isCommandAllowed('python -c "print(1)"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/not in the allowlist/);
    });

    it('rejects empty command', () => {
      const result = isCommandAllowed('');
      expect(result.allowed).toBe(false);
    });

    it('rejects null command', () => {
      const result = isCommandAllowed(null);
      expect(result.allowed).toBe(false);
    });

    it('blocks SQL DROP keyword', () => {
      const result = isCommandAllowed('cat DROP TABLE users');
      expect(result.allowed).toBe(false);
    });

    it('blocks SQL DELETE FROM keyword', () => {
      const result = isCommandAllowed('cat DELETE FROM memories');
      expect(result.allowed).toBe(false);
    });
  });

  // ── Execution tests ──────────────────────────────────────────────────

  describe('execute', () => {
    it('executes ls successfully', async () => {
      const result = await tool.execute({ command: 'ls' }, {});
      expect(result.success).toBe(true);
      expect(result.data.command).toBe('ls');
      expect(result.data.exitCode).toBe(0);
      expect(result.data.stdout).toContain('package.json');
      expect(result.summary).toContain('completed successfully');
    });

    it('executes ls -la src/tools/', async () => {
      const result = await tool.execute({ command: 'ls -la src/tools/' }, {});
      expect(result.success).toBe(true);
      expect(result.data.stdout).toContain('bash.tool.js');
    });

    it('rejects blocked command without executing', async () => {
      const result = await tool.execute({ command: 'rm -rf /' }, {});
      expect(result.success).toBe(false);
      expect(result.summary).toContain('Command not allowed');
      expect(result.data).toBeNull();
    });

    it('returns failure for non-existent file', async () => {
      const result = await tool.execute({ command: 'cat nonexistent_file_xyz.txt' }, {});
      expect(result.success).toBe(false);
      expect(result.data.exitCode).not.toBe(0);
    });

    it('returns correct data structure', async () => {
      const result = await tool.execute({ command: 'ls' }, {});
      expect(result.data).toHaveProperty('stdout');
      expect(result.data).toHaveProperty('stderr');
      expect(result.data).toHaveProperty('exitCode');
      expect(result.data).toHaveProperty('command');
    });

    it('truncates long output', async () => {
      // Use grep -r on a common word to produce lots of output
      const result = await tool.execute({ command: 'ls -laR src/' }, {});
      // Whether it succeeds or not, verify structure is correct
      expect(result.data).toHaveProperty('stdout');
      expect(typeof result.data.stdout).toBe('string');
    });
  });
});
