/**
 * lifecycle/harvest-shaping tests — the reusable-lesson distiller (thesis §7).
 *
 * Contract under test:
 *  - a run with convergence provenance shapes a STRUCTURED lesson body
 *    ("On <repo>, task '<title>': converged N agents; kept …; contested …;
 *    verified …; outcome=….") that ALWAYS cites its evidence anchor;
 *  - deterministic: identical input → identical string;
 *  - truthful: an absent field OMITS its clause (never a fabricated
 *    "converged 0 agents" / "verified pass");
 *  - `hasConvergenceProvenance` gates shaping vs the plain default.
 */
import { describe, it, expect } from 'vitest';
import {
  hasConvergenceProvenance,
  shapeHarvestBody,
  shapeHarvestTitle,
  type HarvestShapeInput,
} from './harvest-shaping.js';

const base: HarvestShapeInput = {
  taskId: 't1',
  artifactId: 'a1',
  outcome: 'completed',
};

const full: HarvestShapeInput = {
  ...base,
  repo: '/srv/recoder.xyz',
  taskTitle: 'fix auth verify',
  convergedAgents: 3,
  winningApproach: 'delegated HTTP verify',
  contestedPaths: ['packages/auth/src/session.ts', 'app/lib/auth-config.ts'],
  verified: true,
};

describe('shapeHarvestBody', () => {
  it('composes a structured, evidence-anchored lesson from full convergence provenance', () => {
    const body = shapeHarvestBody(full);
    expect(body).toBe(
      "On recoder.xyz, task 'fix auth verify': converged 3 agents; " +
        'kept delegated HTTP verify; contested packages/auth/src/session.ts, app/lib/auth-config.ts; ' +
        'verified pass; outcome=completed. Evidence: task t1, artifact a1.',
    );
  });

  it('is deterministic — identical input yields identical output', () => {
    expect(shapeHarvestBody(full)).toBe(shapeHarvestBody({ ...full }));
  });

  it('ALWAYS cites the evidence anchor (task + artifact)', () => {
    const body = shapeHarvestBody({ ...base, repo: 'recoder.xyz', convergedAgents: 2 });
    expect(body).toContain('Evidence: task t1, artifact a1.');
  });

  it('OMITS clauses for absent fields (never fabricates converged 0 / verified)', () => {
    const body = shapeHarvestBody({ ...base, repo: 'recoder.xyz' });
    expect(body).not.toContain('converged');
    expect(body).not.toContain('kept');
    expect(body).not.toContain('contested');
    expect(body).not.toContain('verified');
    // The outcome + evidence always survive.
    expect(body).toContain('outcome=completed');
    expect(body).toContain('Evidence: task t1, artifact a1.');
  });

  it('records a failed verification truthfully', () => {
    const body = shapeHarvestBody({ ...base, convergedAgents: 2, verified: false });
    expect(body).toContain('verified fail');
  });

  it('singularizes a single converged agent', () => {
    expect(shapeHarvestBody({ ...base, convergedAgents: 1 })).toContain('converged 1 agent;');
    expect(shapeHarvestBody({ ...base, convergedAgents: 1 })).not.toContain('1 agents');
  });

  it('drops empty / whitespace contested paths without fabricating a clause', () => {
    const body = shapeHarvestBody({ ...base, contestedPaths: ['', '   '] });
    expect(body).not.toContain('contested');
  });

  it('embeds the repo BASENAME so a later run can repo-match it', () => {
    const body = shapeHarvestBody({ ...base, repo: '/Users/x/recoder.xyz/', convergedAgents: 2 });
    expect(body).toContain('On recoder.xyz,');
  });

  it('falls back to a truthful repo/task label when unknown', () => {
    const body = shapeHarvestBody(base);
    expect(body).toContain('On the workspace repo, ');
    expect(body).toContain("task 't1':");
  });
});

describe('shapeHarvestTitle', () => {
  it('distils a lesson title with the repo when both are known', () => {
    expect(shapeHarvestTitle(full)).toBe('Lesson: fix auth verify (recoder.xyz)');
  });

  it('degrades to the run id when there is no task title or repo', () => {
    expect(shapeHarvestTitle(base)).toBe('Lesson from run t1');
  });
});

describe('hasConvergenceProvenance', () => {
  it('is true when any convergence field is present', () => {
    expect(hasConvergenceProvenance({ ...base, convergedAgents: 2 })).toBe(true);
    expect(hasConvergenceProvenance({ ...base, repo: 'recoder.xyz' })).toBe(true);
    expect(hasConvergenceProvenance({ ...base, winningApproach: 'x' })).toBe(true);
    expect(hasConvergenceProvenance({ ...base, contestedPaths: ['p'] })).toBe(true);
    expect(hasConvergenceProvenance({ ...base, verified: false })).toBe(true);
  });

  it('is false for a bare run with no convergence data (keep the plain default)', () => {
    expect(hasConvergenceProvenance(base)).toBe(false);
    expect(hasConvergenceProvenance({ ...base, contestedPaths: ['  '] })).toBe(false);
  });
});
