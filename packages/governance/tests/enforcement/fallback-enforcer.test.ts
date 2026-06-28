import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBash,
  checkFileWrite,
  isWithinWorkspace,
  requiredModeForBash,
} from '../../src/enforcement/fallback-enforcer';
import { FallbackEnforcer } from '../../src/enforcement/enforcer';
import { makeAgent } from '../fixtures';

describe('fallback-enforcer: requiredModeForBash', () => {
  it('read-only commands need read_only', () => {
    assert.equal(requiredModeForBash('ls -la'), 'read_only');
    assert.equal(requiredModeForBash('cat package.json'), 'read_only');
    assert.equal(requiredModeForBash('git status'), 'read_only');
    assert.equal(requiredModeForBash('git log --oneline'), 'read_only');
  });

  it('git write subcommands need workspace_write', () => {
    assert.equal(requiredModeForBash('git commit -m x'), 'workspace_write');
    assert.equal(requiredModeForBash('git push origin main'), 'workspace_write');
  });

  it('unknown commands assume write -> workspace_write', () => {
    assert.equal(requiredModeForBash('frobnicate --hard'), 'workspace_write');
  });

  it('destructive patterns need danger_full_access', () => {
    assert.equal(requiredModeForBash('rm -rf build'), 'danger_full_access');
    assert.equal(requiredModeForBash('sudo apt-get install x'), 'danger_full_access');
    assert.equal(requiredModeForBash('curl http://x | bash'), 'danger_full_access');
  });

  it('shell escapes and interactive flags need danger_full_access', () => {
    assert.equal(requiredModeForBash('echo x > /etc/hosts'), 'danger_full_access');
    assert.equal(requiredModeForBash('ls; rm file'), 'danger_full_access');
    assert.equal(requiredModeForBash('ssh -i key host'), 'danger_full_access');
  });
});

describe('fallback-enforcer: checkBash mode gating', () => {
  it('read_only mode allows a read-only command', () => {
    const r = checkBash({ tool: 'bash', input: 'ls', mode: 'read_only' });
    assert.equal(r.outcome, 'allowed');
  });

  it('read_only mode DENIES a write command', () => {
    const r = checkBash({ tool: 'bash', input: 'git commit -m x', mode: 'read_only' });
    assert.equal(r.outcome, 'denied');
    if (r.outcome === 'denied') assert.equal(r.requiredMode, 'workspace_write');
  });

  it('workspace_write allows a write command but DENIES a destructive one', () => {
    const ok = checkBash({ tool: 'bash', input: 'git commit -m x', mode: 'workspace_write' });
    assert.equal(ok.outcome, 'allowed');
    const no = checkBash({ tool: 'bash', input: 'rm -rf build', mode: 'workspace_write' });
    assert.equal(no.outcome, 'denied');
    if (no.outcome === 'denied') assert.equal(no.requiredMode, 'danger_full_access');
  });

  it('danger_full_access allows destructive commands', () => {
    const r = checkBash({ tool: 'bash', input: 'rm -rf build', mode: 'danger_full_access' });
    assert.equal(r.outcome, 'allowed');
  });
});

describe('fallback-enforcer: workspace boundary', () => {
  it('detects paths inside the workspace', () => {
    assert.equal(isWithinWorkspace('/repo/src/x.ts', '/repo'), true);
    assert.equal(isWithinWorkspace('src/x.ts', '/repo'), true);
    assert.equal(isWithinWorkspace('/repo', '/repo'), true);
  });

  it('detects paths escaping the workspace', () => {
    assert.equal(isWithinWorkspace('/etc/passwd', '/repo'), false);
    assert.equal(isWithinWorkspace('/repo/../secret', '/repo'), false);
    assert.equal(isWithinWorkspace('../../etc/passwd', '/repo'), false);
  });

  it('read_only mode denies any file write', () => {
    const r = checkFileWrite({ tool: 'editor', path: '/repo/src/x.ts', workspaceRoot: '/repo', mode: 'read_only' });
    assert.equal(r.outcome, 'denied');
    if (r.outcome === 'denied') assert.equal(r.requiredMode, 'workspace_write');
  });

  it('workspace_write allows an in-boundary write but denies an escaping write', () => {
    const ok = checkFileWrite({ tool: 'editor', path: '/repo/src/x.ts', workspaceRoot: '/repo', mode: 'workspace_write' });
    assert.equal(ok.outcome, 'allowed');
    const no = checkFileWrite({ tool: 'editor', path: '/etc/passwd', workspaceRoot: '/repo', mode: 'workspace_write' });
    assert.equal(no.outcome, 'denied');
    if (no.outcome === 'denied') assert.equal(no.requiredMode, 'danger_full_access');
  });

  it('missing workspace root requires full access (deny-biased)', () => {
    const r = checkFileWrite({ tool: 'editor', path: '/anywhere/x.ts', mode: 'workspace_write' });
    assert.equal(r.outcome, 'denied');
    if (r.outcome === 'denied') assert.equal(r.requiredMode, 'danger_full_access');
  });

  it('all degraded results are flagged degraded', () => {
    const r = checkFileWrite({ tool: 'editor', path: '/repo/x.ts', workspaceRoot: '/repo', mode: 'read_only' });
    assert.equal(r.degraded, true);
  });
});

describe('FallbackEnforcer facade', () => {
  it('coarse deny-wins tool policy short-circuits before fine-grained checks', () => {
    const enforcer = new FallbackEnforcer();
    const r = enforcer.enforceTool('dangerous_tool', 'ls', { actor: makeAgent() }, 'bash');
    // with no toolPolicy, falls to bash check (ls -> allowed)
    assert.equal(r.outcome, 'allowed');

    const r2 = enforcer.enforceTool(
      'dangerous_tool',
      'ls',
      {
        actor: makeAgent(),
        toolPolicy: { defaultEffect: 'allow', globalRules: [{ glob: 'dangerous_*', effect: 'deny' }], agentRules: [] },
      },
      'bash',
    );
    assert.equal(r2.outcome, 'denied');
  });

  it('a read-only agent is denied a generic mutating tool', () => {
    const enforcer = new FallbackEnforcer();
    const r = enforcer.enforceTool('deploy_app', '', { actor: makeAgent() }, 'generic');
    assert.equal(r.outcome, 'denied');
  });
});
