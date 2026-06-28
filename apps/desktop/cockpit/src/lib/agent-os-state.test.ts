/**
 * Unit tests for agent-os-state.ts — pure request-shaping and presentation
 * helpers for the Policy and Memory-Candidate panels. Real inputs only; no mocks.
 * These prove the request body is shaped exactly as the backend route validates
 * and that every badge/state derivation is a faithful mapping over the real
 * response value (never a fabricated decision/status).
 */
import { describe, expect, it } from 'vitest';
import type {
  MemoryCandidate,
  MemoryCandidateStatus,
  PolicyDecisionEffect,
} from '../types';
import {
  MEMORY_SCOPES,
  POLICY_ACTIONS,
  buildPolicyEvaluateBody,
  candidateStatusLabel,
  candidateStatusTone,
  effectLabel,
  effectTone,
  hasEvidence,
  isCandidatePending,
  isPolicyFormValid,
} from './agent-os-state';

describe('POLICY_ACTIONS / MEMORY_SCOPES', () => {
  it('exposes the exact action set the engine accepts', () => {
    expect(POLICY_ACTIONS).toEqual([
      'file.read',
      'file.write',
      'command.run',
      'tool.call',
      'memory.write',
      'artifact.publish',
      'deploy.preview',
      'branch.push',
      'pr.create',
    ]);
  });

  it('exposes the exact memory scope set the lifecycle route accepts', () => {
    expect(MEMORY_SCOPES).toEqual(['user', 'org', 'space', 'repo', 'path', 'agent', 'task-type']);
  });
});

describe('buildPolicyEvaluateBody', () => {
  it('builds a full actor with a real permissions object and trims the agentId', () => {
    const body = buildPolicyEvaluateBody({ actor: '  agent-x  ', action: 'file.read', target: '' });
    expect(body.actor.agentId).toBe('agent-x');
    // The route requires actor.permissions to be a record; assert it is a real
    // permission policy shape, not a faked decision input.
    expect(typeof body.actor.permissions).toBe('object');
    expect(body.actor.permissions).toMatchObject({
      defaultFileEffect: 'allow',
      pathRules: [],
      toolRules: [],
      allowSecretsAccess: false,
    });
    expect(body.action).toBe('file.read');
  });

  it('routes the target value to `path` for file.read / file.write', () => {
    expect(buildPolicyEvaluateBody({ actor: 'a', action: 'file.read', target: 'src/x.ts' }).target).toEqual({
      path: 'src/x.ts',
    });
    expect(buildPolicyEvaluateBody({ actor: 'a', action: 'file.write', target: 'src/y.ts' }).target).toEqual({
      path: 'src/y.ts',
    });
  });

  it('routes the target value to `command` for command.run', () => {
    expect(buildPolicyEvaluateBody({ actor: 'a', action: 'command.run', target: 'rm -rf /' }).target).toEqual({
      command: 'rm -rf /',
    });
  });

  it('routes the target value to `toolName` for tool.call', () => {
    expect(buildPolicyEvaluateBody({ actor: 'a', action: 'tool.call', target: 'browser.nav' }).target).toEqual({
      toolName: 'browser.nav',
    });
  });

  it('routes the target value to `environment` for other actions', () => {
    expect(
      buildPolicyEvaluateBody({ actor: 'a', action: 'deploy.preview', target: 'production' }).target,
    ).toEqual({ environment: 'production' });
  });

  it('produces an empty target object when the value is blank/whitespace', () => {
    expect(buildPolicyEvaluateBody({ actor: 'a', action: 'file.write', target: '   ' }).target).toEqual({});
    expect(buildPolicyEvaluateBody({ actor: 'a', action: 'file.write' }).target).toEqual({});
  });
});

describe('isPolicyFormValid', () => {
  it('requires a non-empty actor id', () => {
    expect(isPolicyFormValid({ actor: 'a', action: 'file.read' })).toBe(true);
    expect(isPolicyFormValid({ actor: '', action: 'file.read' })).toBe(false);
    expect(isPolicyFormValid({ actor: '   ', action: 'file.read' })).toBe(false);
  });
});

describe('effectTone / effectLabel', () => {
  it('maps each real effect to its tone', () => {
    expect(effectTone('allow')).toBe('good');
    expect(effectTone('needs_approval')).toBe('warn');
    expect(effectTone('deny')).toBe('bad');
  });

  it('returns a tone for every defined effect', () => {
    const effects: PolicyDecisionEffect[] = ['allow', 'deny', 'needs_approval'];
    for (const e of effects) {
      expect(effectTone(e).length).toBeGreaterThan(0);
    }
  });

  it('falls back to neutral for an unexpected effect', () => {
    expect(effectTone('weird' as PolicyDecisionEffect)).toBe('neutral');
  });

  it('labels effects with underscores spaced', () => {
    expect(effectLabel('needs_approval')).toBe('needs approval');
    expect(effectLabel('allow')).toBe('allow');
  });
});

describe('candidate status helpers', () => {
  const ALL: MemoryCandidateStatus[] = ['candidate_created', 'reviewed', 'accepted', 'rejected'];

  it('maps each status to its tone', () => {
    expect(candidateStatusTone('accepted')).toBe('good');
    expect(candidateStatusTone('rejected')).toBe('bad');
    expect(candidateStatusTone('reviewed')).toBe('progress');
    expect(candidateStatusTone('candidate_created')).toBe('neutral');
  });

  it('returns a tone for every status', () => {
    for (const s of ALL) expect(candidateStatusTone(s).length).toBeGreaterThan(0);
  });

  it('labels statuses with underscores spaced', () => {
    expect(candidateStatusLabel('candidate_created')).toBe('candidate created');
    expect(candidateStatusLabel('accepted')).toBe('accepted');
  });

  it('isCandidatePending only for not-yet-decided statuses', () => {
    expect(isCandidatePending('candidate_created')).toBe(true);
    expect(isCandidatePending('reviewed')).toBe(true);
    expect(isCandidatePending('accepted')).toBe(false);
    expect(isCandidatePending('rejected')).toBe(false);
  });
});

describe('hasEvidence', () => {
  function candidate(evidence: MemoryCandidate['evidence']): Pick<MemoryCandidate, 'evidence'> {
    return { evidence };
  }

  it('is true only when both taskId and artifactId are present', () => {
    expect(hasEvidence(candidate({ taskId: 't1', artifactId: 'a1' }))).toBe(true);
    expect(hasEvidence(candidate({ taskId: '', artifactId: 'a1' }))).toBe(false);
    expect(hasEvidence(candidate({ taskId: 't1', artifactId: '' }))).toBe(false);
    expect(hasEvidence(candidate({ taskId: '', artifactId: '' }))).toBe(false);
  });
});
