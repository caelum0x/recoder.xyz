/**
 * AD-HOC CONVERGE E2E (PW1 #1) — the biggest first-timer unblock: a dev who ran
 * Claude in one workspace and Codex in ANOTHER (each its OWN taskGroup, NOT F3
 * siblings of one group) can still converge them by an EXPLICIT id list. Driven
 * deterministically through the composed `ConductorModule` over REAL git temp repos
 * + the deterministic test substrate (same harness the taskGroup convergence-loop
 * e2e uses — nothing mocked but the agent).
 *
 * Proves:
 *   1. AD-HOC COMPARE — `module.compareAdHoc([wsA, wsB])` over two SEPARATELY
 *      launched workspaces returns the SAME CompareView shape + the CONTESTED set
 *      (files both touched), from real `git diff`.
 *   2. AD-HOC CONVERGE — `planConvergenceAdHoc` folds a selection into a COMPLETE
 *      plan; `composeConvergenceAdHoc` materializes a NEW reviewable convergence
 *      worktree whose provenance records the explicit ad-hoc group.
 *   3. OWNERSHIP GATE — an id the caller does not own ⇒ a no-oracle `not-found`.
 *   4. DIFFERENT-REPO REJECTION — an explicit set spanning two projects/repos ⇒
 *      `incompatible` (never a fabricated cross-repo diff).
 *   5. TOO-FEW — fewer than 2 distinct ids ⇒ `too-few`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SYNTHESIZE_SELECTION } from '../converge/converge-plan.service.js';
import {
  composeConductor,
  makeCreateInput,
  makePrincipal,
} from '../__fixtures__/harness.js';
import {
  RealGitSubstrate,
  encodeMutation,
  MUTATION_ENV,
  type SubstrateMutation,
} from '../__fixtures__/real-git-substrate.js';

/** Host git with a fixed, sign-free identity — deterministic across boxes. */
function git(cwd: string, args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.email=t@t.dev', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
/** Past one poll interval so a tailer tick self-stops before teardown (see loop e2e). */
const TAIL_DRAIN_MS = 3300;

describe('ad-hoc converge E2E (real git + deterministic substrate)', () => {
  const PRINCIPAL = makePrincipal('user_adhoc');
  let root: string;
  let repo: string;
  let repo2: string;
  let worktreesDir: string;
  let substrate: RealGitSubstrate;
  let module: ReturnType<typeof composeConductor>['module'];
  let gate: ReturnType<typeof composeConductor>['gate'];

  function seedRepo(dir: string): void {
    mkdirSync(dir, { recursive: true });
    git(dir, ['init', '-b', 'main']);
    writeFileSync(path.join(dir, 'keep.ts'), 'base-keep\n');
    writeFileSync(path.join(dir, 'pick.ts'), 'base-pick\n');
    writeFileSync(path.join(dir, 'synth.ts'), 'l1\nl2\nl3\nl4\nl5\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-m', 'base']);
  }

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-adhoc-e2e-'));
    repo = path.join(root, 'repo');
    repo2 = path.join(root, 'repo2');
    worktreesDir = path.join(root, 'worktrees');
    mkdirSync(worktreesDir, { recursive: true });
    seedRepo(repo);
    seedRepo(repo2);

    substrate = new RealGitSubstrate({ id: 'tmux_worktree', worktreesDir });
    ({ module, gate } = composeConductor({ substrates: [substrate] }));
  });

  afterEach(async () => {
    substrate.finishAll(0);
    await sleep(TAIL_DRAIN_MS);
    await module.stop().catch(() => {});
    rmSync(root, { recursive: true, force: true });
  });

  type Module = ReturnType<typeof composeConductor>['module'];

  /**
   * Launch ONE workspace with its OWN taskGroup (so it is NOT an F3 sibling of any
   * other) — models a dev launching one agent, then a totally separate one later.
   */
  async function launchSolo(
    mod: Module,
    runtimeId: string,
    mutation: SubstrateMutation,
    overrides: Record<string, unknown> = {},
    principal = PRINCIPAL,
  ): Promise<string> {
    const result = await mod.createWorkspace(
      makeCreateInput({
        runtimeId,
        substrate: 'tmux_worktree',
        repoPath: repo,
        taskId: `task_${runtimeId}_${Math.random().toString(36).slice(2, 8)}`,
        // A UNIQUE taskGroup per launch → each is its own singleton group.
        metadata: { taskGroup: `solo_${runtimeId}_${Math.random().toString(36).slice(2, 8)}` },
        command: 'noop',
        env: { [MUTATION_ENV]: encodeMutation(mutation) },
        ...overrides,
      }),
      principal,
    );
    expect(result.ok).toBe(true);
    return result.value!.workspaceId;
  }

  it('compares + converges two SEPARATELY launched workspaces by explicit id', async () => {
    // Two INDEPENDENT launches on the same repo, each its own group.
    const wsA = await launchSolo(module, 'claude_code', {
      write: { 'a.ts': 'from-a\n', 'pick.ts': 'pick-by-a\n', 'synth.ts': 'l1-A\nl2\nl3\nl4\nl5\n' },
    });
    const wsB = await launchSolo(module, 'codex', {
      write: { 'b.ts': 'from-b\n', 'pick.ts': 'pick-by-b\n', 'synth.ts': 'l1\nl2\nl3\nl4\nl5-B\n' },
    });
    expect(wsA).not.toBe(wsB);

    // ---- AD-HOC COMPARE — same CompareView shape, the contested set from real git ----
    const outcome = await module.compareAdHoc([wsA, wsB], PRINCIPAL);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const compare = outcome.view;
    expect(compare.count).toBe(2);
    expect(compare.taskGroup).toMatch(/^adhoc:/); // synthetic group id
    expect(compare.siblings.map(s => s.agent).sort()).toEqual(['claude_code', 'codex']);
    expect(compare.contested.map(c => c.path).sort()).toEqual(['pick.ts', 'synth.ts']);
    for (const c of compare.contested) {
      expect([...c.workspaceIds].sort()).toEqual([wsA, wsB].sort());
    }

    // Deep inspection uses the SAME explicit set (the synthetic group is not a
    // persisted taskGroup): click-a-file N-up contents and the true A/B line diff.
    const versions = await module.fileVersionsAdHoc(
      [wsA, wsB],
      'pick.ts',
      PRINCIPAL,
    );
    expect(versions.ok).toBe(true);
    if (!versions.ok) return;
    expect(versions.fileVersions.base).toBe('base-pick\n');
    expect(versions.fileVersions.versions.map(v => v.content).sort()).toEqual([
      'pick-by-a\n',
      'pick-by-b\n',
    ]);

    const pairwise = await module.pairwiseDiffAdHoc(
      [wsA, wsB],
      wsA,
      wsB,
      ['pick.ts'],
      PRINCIPAL,
    );
    expect(pairwise.ok).toBe(true);
    if (!pairwise.ok) return;
    expect(pairwise.pairwise.files).toHaveLength(1);
    expect(pairwise.pairwise.files[0].patch).toContain('pick-by-a');
    expect(pairwise.pairwise.files[0].patch).toContain('pick-by-b');

    // ---- AD-HOC PLAN — pick B for pick.ts, synthesize synth.ts ----
    const selection = { 'pick.ts': wsB, 'synth.ts': SYNTHESIZE_SELECTION };
    const planned = await module.planConvergenceAdHoc([wsA, wsB], selection, undefined, PRINCIPAL);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.complete).toBe(true);
    expect(planned.plan.files.map(f => f.path).sort()).toEqual(['a.ts', 'b.ts', 'pick.ts', 'synth.ts']);

    // ---- AD-HOC COMPOSE — a NEW reviewable convergence worktree (real git) ----
    const composed = await module.composeConvergenceAdHoc(
      { workspaceIds: [wsA, wsB], selection, createdBy: PRINCIPAL.userId },
      PRINCIPAL,
    );
    expect('verdict' in composed).toBe(true);
    if (!('verdict' in composed)) return;
    expect(composed.ok).toBe(true);
    const conv = composed.value!;
    expect(conv.fileCount).toBe(4);
    const convWs = (await module.getWorkspace(conv.workspaceId))!;
    expect(convWs.state).toBe('awaiting_review');
    const convWt = convWs.worktreePath!;
    expect(git(convWt, ['show', 'HEAD:a.ts'])).toBe('from-a\n');
    expect(git(convWt, ['show', 'HEAD:b.ts'])).toBe('from-b\n');
    expect(git(convWt, ['show', 'HEAD:pick.ts'])).toBe('pick-by-b\n'); // winner B
    const synthMerged = git(convWt, ['show', 'HEAD:synth.ts']);
    expect(synthMerged).toContain('l1-A');
    expect(synthMerged).toContain('l5-B');
    expect(synthMerged).not.toContain('<<<<<<<');

    // ---- PROVENANCE — records the explicit ad-hoc group (evidence/metadata path) ----
    const meta = convWs.metadata as Record<string, unknown>;
    expect(meta.convergedFromTaskGroup).toBe(compare.taskGroup);
    expect(String(meta.convergedFromTaskGroup)).toContain(wsA);
    expect(String(meta.convergedFromTaskGroup)).toContain(wsB);
    const provenance = meta.convergence as { fromTaskGroup: string; selections: unknown[] };
    expect(provenance.fromTaskGroup).toBe(compare.taskGroup);
    expect(Array.isArray(provenance.selections)).toBe(true);

    // The compose was GATED through workspace.branch (a real governed write).
    expect(gate.decisions).toContain('workspace.branch');
  });

  it('OWNERSHIP: an id the caller does not own ⇒ no-oracle not-found', async () => {
    const mine = await launchSolo(module, 'claude_code', { write: { 'a.ts': 'a\n' } });
    // A workspace owned by a DIFFERENT user — the caller must never learn it exists.
    const theirs = await launchSolo(
      module,
      'codex',
      { write: { 'b.ts': 'b\n' } },
      {},
      makePrincipal('user_other'),
    );

    const outcome = await module.compareAdHoc([mine, theirs], PRINCIPAL);
    expect(outcome).toEqual({ ok: false, code: 'not-found' });

    // A genuinely missing id is byte-identical (no oracle).
    const missing = await module.compareAdHoc([mine, 'ws_does_not_exist'], PRINCIPAL);
    expect(missing).toEqual({ ok: false, code: 'not-found' });

    // Compose refuses the same way (before the gate is ever consulted).
    const before = gate.decisions.length;
    const composed = await module.composeConvergenceAdHoc(
      { workspaceIds: [mine, theirs], selection: {}, createdBy: PRINCIPAL.userId },
      PRINCIPAL,
    );
    expect(composed).toEqual({ ok: false, code: 'not-found' });
    expect(gate.decisions.length).toBe(before); // never gated a foreign set
  });

  it('DIFFERENT-REPO: an explicit set spanning two projects ⇒ incompatible', async () => {
    const wsA = await launchSolo(module, 'claude_code', { write: { 'a.ts': 'a\n' } });
    // A second workspace bound to a DIFFERENT project + repo (converging is nonsense).
    const wsOther = await launchSolo(
      module,
      'codex',
      { write: { 'b.ts': 'b\n' } },
      { projectId: 'project_other', repoPath: repo2 },
    );

    const outcome = await module.compareAdHoc([wsA, wsOther], PRINCIPAL);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('incompatible');
    expect((outcome as { reason: string }).reason).toMatch(/different repos/i);
  });

  it('TOO-FEW: fewer than 2 distinct ids ⇒ too-few', async () => {
    const wsA = await launchSolo(module, 'claude_code', { write: { 'a.ts': 'a\n' } });
    // One id (and a duplicate of it) collapse to a single distinct workspace.
    const single = await module.compareAdHoc([wsA], PRINCIPAL);
    expect(single.ok).toBe(false);
    if (single.ok) return;
    expect(single.code).toBe('too-few');

    const dup = await module.compareAdHoc([wsA, wsA], PRINCIPAL);
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.code).toBe('too-few');
  });
});
