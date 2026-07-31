import { describe, it, expect } from 'vitest';
import { createToolExecGate, describeToolInput } from '../services/tool-exec-gate.js';
import { GovernanceGateService } from '../services/governance-gate.service.js';
import { AuditChainService } from '../services/audit-chain.service.js';
import type { GovernanceGate } from '../ports/gate.port.js';
import type { Principal } from '../../identity/types.js';
import type { ToolEnforcement } from '../types.js';
import { InMemoryAuditRepository, fakeKernel, silentLogger } from './_fakes.js';

function principal(overrides: Partial<Principal> = {}): Principal {
  return { userId: 'u1', scopes: ['write'], kind: 'session', isAnonymous: false, raw: null, ...overrides };
}

/** Build the narrow tool-exec port over a real gate backed by a fake kernel. */
function portOver(tool: ToolEnforcement, auditRepo = new InMemoryAuditRepository()) {
  const gate = new GovernanceGateService({
    kernel: fakeKernel({ tool }),
    audit: new AuditChainService(auditRepo),
    logger: silentLogger,
  });
  return { port: createToolExecGate(gate), auditRepo };
}

describe('describeToolInput — secret-free projection', () => {
  it('drops credential-looking keys and keeps scalar shape', () => {
    const s = describeToolInput({ command: 'ls', apiKey: 'sk-secret', token: 'abc', count: 3, ok: true });
    expect(s).toContain('command');
    expect(s).toContain('ls');
    expect(s).not.toContain('sk-secret');
    expect(s).not.toContain('token');
  });

  it('passes a string through and stringifies scalars', () => {
    expect(describeToolInput('rm -rf /')).toBe('rm -rf /');
    expect(describeToolInput(null)).toBe('');
    expect(describeToolInput(42)).toBe('42');
  });

  it('RECURSES into nested arrays/objects so a nested command reaches the classifier', () => {
    // recoder.workflow.workflow.verify carries its dangerous payload one level
    // deep in checks[].command. The kernel classifier must SEE it.
    const s = describeToolInput({ checks: [{ command: 'rm -rf /' }] });
    expect(s).toContain('command');
    expect(s).toContain('rm -rf /');
  });

  it('still drops secret-named keys when they are nested inside arrays/objects', () => {
    const s = describeToolInput({
      steps: [{ command: 'deploy', apiKey: 'sk-nested-secret' }],
      env: { token: 'nested-token-value', path: '/etc/passwd' },
    });
    expect(s).toContain('command');
    expect(s).toContain('deploy');
    expect(s).toContain('/etc/passwd'); // a nested path still reaches the classifier
    expect(s).not.toContain('sk-nested-secret');
    expect(s).not.toContain('nested-token-value');
  });

  it('stays BOUNDED for huge / deeply-nested payloads (no unbounded blowup)', () => {
    const huge = { blob: 'x'.repeat(200_000), checks: Array.from({ length: 5000 }, (_, i) => ({ command: `c${i}` })) };
    const s = describeToolInput(huge);
    expect(s.length).toBeLessThanOrEqual(8192);

    // Pathologically deep nesting must not recurse without limit.
    let deep: unknown = 'rm -rf /';
    for (let i = 0; i < 500; i += 1) deep = { nested: deep };
    expect(() => describeToolInput(deep)).not.toThrow();
    expect(describeToolInput(deep).length).toBeLessThanOrEqual(8192);
  });
});

describe('createToolExecGate — the narrow per-tool teeth', () => {
  it('DENIES a forbidden real catalog tool (sandbox_exec) and maps the outcome', async () => {
    const { port } = portOver({ outcome: 'denied', reason: 'forbidden command', degraded: false, engine: 'ts' });
    const verdict = await port.enforce({
      toolName: 'recoder.sandbox_exec',
      rawArgs: { command: 'rm -rf /' },
      principal: principal(),
      ctx: { target: { toolName: 'recoder.sandbox_exec' }, taskId: 't1' },
    });
    expect(verdict.outcome).toBe('denied');
    expect(verdict.reason).toContain('forbidden');
    expect(verdict.engine).toBe('ts');
  });

  it('ALLOWS a benign real catalog tool (repo_search)', async () => {
    const { port } = portOver({ outcome: 'allowed', reason: 'ok', degraded: false, engine: 'ts' });
    const verdict = await port.enforce({
      toolName: 'recoder.repo_search',
      rawArgs: { query: 'TODO' },
      principal: principal(),
    });
    expect(verdict.outcome).toBe('allowed');
  });

  it('SECRET-FREE: sealed audit row for workspace_merge carries no raw secret', async () => {
    const { port, auditRepo } = portOver({ outcome: 'denied', reason: 'protected branch', degraded: false, engine: 'ts' });
    await port.enforce({
      toolName: 'recoder.workspace_merge',
      rawArgs: { apiKey: 'sk-super-secret-value', branch: 'main' },
      principal: principal(),
    });
    expect(auditRepo.rows).toHaveLength(1);
    expect(JSON.stringify(auditRepo.rows[0]?.payload)).not.toContain('sk-super-secret-value');
  });

  it('DENY-BIAS: a thrown enforcement seam fails CLOSED (synthetic deny, never an allow)', async () => {
    const throwingGate: GovernanceGate = {
      decide: async () => { throw new Error('unused'); },
      enforceTool: async () => { throw new Error('kernel boom'); },
      route: async () => { throw new Error('unused'); },
      recordAudit: async () => { throw new Error('unused'); },
      verifyAudit: async () => { throw new Error('unused'); },
    };
    const port = createToolExecGate(throwingGate);
    const verdict = await port.enforce({ toolName: 'recoder.sandbox_exec', rawArgs: {}, principal: principal() });
    expect(verdict.outcome).toBe('denied');
    expect(verdict.engine).toBe('synthetic');
  });
});
