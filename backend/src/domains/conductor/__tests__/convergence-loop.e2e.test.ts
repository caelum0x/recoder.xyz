/**
 * THE END-TO-END CONVERGENCE PROOF — the full product loop driven deterministically
 * through the composed `ConductorModule`, over REAL git temp repos + a deterministic
 * test substrate (NO LLM agents), asserting each stage genuinely works:
 *
 *   1. LAUNCH  — create a repo + task, launch 2 agents in ONE taskGroup (parallel
 *      siblings), each producing a DIFFERENT real committed diff (contested +
 *      non-contested files) via {@link RealGitSubstrate}.
 *   2. COMPARE — `module.compareTaskGroup` aggregates the siblings + the CONTESTED
 *      set (files 2+ siblings touched) + per-sibling diffstat, from real `git diff`.
 *   3. CONVERGE — `module.planConvergence` folds a per-file selection (pick winners +
 *      one synthesize) into a COMPLETE plan; `module.composeConvergence` materializes
 *      it into a NEW reviewable convergence worktree with the merged files (real git).
 *   4. MERGE   — `module.mergeWorkspace` lands the convergence branch through the
 *      GOVERNED gate and emits a SEALED convergence-evidence record (verdict + seal),
 *      readable via `module.getConvergenceEvidence`; the change lands in base `main`.
 *   5. HARVEST — the run-completion memory-harvest adapter the module composes shapes
 *      a reusable lesson candidate for the converged delivery.
 *   6. ASSISTED — a contested file whose mechanical 3-way CONFLICTS resolves via an
 *      injected fake inference (`@assisted`); without it, the same file degrades
 *      truthfully to `synthesize-conflict`.
 *
 * This is a real integration test: it drives the module's PUBLIC surface and its real
 * host-git edges — nothing is mocked away except the LLM (a deterministic substrate
 * stands in for the agent, an injectable fake inference for the assist model).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RunEvent } from '@recoder/agent-os';
import type { BrainEnrichInput } from '@recoder/substrate';
import type {
  ConductorBrainMemory,
  RunHarvestInput,
} from '../adapters/brain-memory.adapter.js';
import type { ConvergeInferenceFn } from '../converge/converge.ops.js';
import type {
  ConvergenceDecisionRecord,
  ConvergenceFeedbackPort,
  ConvergenceFlagDisposition,
  ConvergenceFlagFeedbackEvent,
} from '../ports/convergence-feedback.port.js';
import {
  SYNTHESIZE_SELECTION,
  ASSISTED_SELECTION,
} from '../converge/converge-plan.service.js';
import { createCompletionHookSink } from '../adapters/completion-hook.adapter.js';
import {
  composeConductor,
  makeCreateInput,
  makeLogger,
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

/** Read a path from the base repo's committed `main` (proves the merge LANDED). */
function showMain(repo: string, relPath: string): string {
  return git(repo, ['show', `main:${relPath}`]);
}

/** True when a path exists on `main` (a deleted file throws → false). */
function existsOnMain(repo: string, relPath: string): boolean {
  try {
    git(repo, ['show', `main:${relPath}`]);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/**
 * The poll tailer (started by every `createWorkspace`) fires its FIRST tick after
 * ~3s. A test finishes its runs so the next tick emits `completed` + self-stops the
 * timer; waiting past one interval lets that tick run so no timer dangles into the
 * next test. (Promoted from the substrate tailer's 3s default.)
 */
const TAIL_DRAIN_MS = 3300;

/** A recording brain: records enrich (recall) + harvest (lesson candidate) calls. */
interface RecordingBrain extends ConductorBrainMemory {
  readonly enrichCalls: BrainEnrichInput[];
  readonly harvestCalls: RunHarvestInput[];
}
function makeBrain(): RecordingBrain {
  const enrichCalls: BrainEnrichInput[] = [];
  const harvestCalls: RunHarvestInput[] = [];
  return {
    enrichCalls,
    harvestCalls,
    async enrichPrompt(input) {
      enrichCalls.push(input);
      return { prompt: input.prompt, sources: [] };
    },
    async harvestOnCompletion(input) {
      harvestCalls.push(input);
      return { harvested: true };
    },
  };
}

describe('convergence loop E2E (real git + deterministic substrate)', () => {
  const PRINCIPAL = makePrincipal('user_e2e');
  let root: string;
  let repo: string;
  let worktreesDir: string;
  let substrate: RealGitSubstrate;
  let brain: RecordingBrain;
  let feedbackRecords: ConvergenceDecisionRecord[];
  let feedbackRules: ConvergenceFlagDisposition[];
  let feedbackHistory: ConvergenceFlagFeedbackEvent[];
  let convergenceFeedback: ConvergenceFeedbackPort;
  let module: ReturnType<typeof composeConductor>['module'];
  let gate: ReturnType<typeof composeConductor>['gate'];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-conv-e2e-'));
    repo = path.join(root, 'repo');
    worktreesDir = path.join(root, 'worktrees');
    mkdirSync(repo, { recursive: true });
    mkdirSync(worktreesDir, { recursive: true });

    // Base commit: two contested seeds (pick.ts, synth.ts), a base-only file
    // (keep.ts), and a file one sibling will delete (del.ts).
    git(repo, ['init', '-b', 'main']);
    writeFileSync(path.join(repo, 'keep.ts'), 'base-keep\n');
    writeFileSync(path.join(repo, 'pick.ts'), 'base-pick\n');
    writeFileSync(path.join(repo, 'synth.ts'), 'l1\nl2\nl3\nl4\nl5\n');
    writeFileSync(path.join(repo, 'del.ts'), 'base-del\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);

    substrate = new RealGitSubstrate({ id: 'tmux_worktree', worktreesDir });
    brain = makeBrain();
    feedbackRecords = [];
    feedbackRules = [];
    feedbackHistory = [];
    convergenceFeedback = {
      durable: true,
      async read(repoId) {
        return {
          repoId,
          durable: true,
          totalDeliveries: feedbackRecords.length,
          contestedPickDecisions: feedbackRecords.reduce((sum, row) => sum + row.picks.length, 0),
          proceededWithFlagDecisions: feedbackRecords.reduce((sum, row) => sum + row.proceededWithFlags.length, 0),
          totalFlagFeedbackDecisions: feedbackHistory.length,
          acceptedFlagRules: feedbackRules.filter(row => row.disposition === 'accepted').length,
          dismissedFlagRules: feedbackRules.filter(row => row.disposition === 'dismissed').length,
          decisions: feedbackRecords,
          flagDispositions: feedbackRules,
          flagFeedbackHistory: feedbackHistory,
        };
      },
      async record(repoId, decision) {
        feedbackRecords = [decision, ...feedbackRecords.filter(row => row.workspaceId !== decision.workspaceId)];
        return this.read(repoId);
      },
      async setFlagDisposition(repoId, input) {
        const decision = feedbackRecords.find(row => row.workspaceId === input.workspaceId);
        if (!decision?.proceededWithFlags.includes(input.flag)) throw new Error('flag was not recorded');
        const key = input.flag.toLowerCase();
        feedbackRules = input.disposition === 'clear'
          ? feedbackRules.filter(row => row.key !== key)
          : [{
              key,
              flag: input.flag,
              disposition: input.disposition,
              actorId: input.actorId,
              workspaceId: input.workspaceId,
              updatedAt: input.decidedAt,
            }, ...feedbackRules.filter(row => row.key !== key)];
        feedbackHistory = [{
          key,
          flag: input.flag,
          disposition: input.disposition,
          actorId: input.actorId,
          workspaceId: input.workspaceId,
          decidedAt: input.decidedAt,
        }, ...feedbackHistory];
        return this.read(repoId);
      },
    };
    ({ module, gate } = composeConductor({ substrates: [substrate], brain, convergenceFeedback }));
  });

  afterEach(async () => {
    // Finish live runs so the poll tailers self-stop on their next tick, wait past
    // one interval so no timer dangles, then remove the temp tree.
    substrate.finishAll(0);
    await sleep(TAIL_DRAIN_MS);
    await module.stop().catch(() => {});
    rmSync(root, { recursive: true, force: true });
  });

  type Module = ReturnType<typeof composeConductor>['module'];

  /** Launch one sibling agent (a deterministic committed diff) in the task group. */
  async function launchSiblingIn(
    mod: Module,
    runtimeId: string,
    taskGroup: string,
    mutation: SubstrateMutation,
  ): Promise<string> {
    const result = await mod.createWorkspace(
      makeCreateInput({
        runtimeId,
        substrate: 'tmux_worktree',
        repoPath: repo,
        taskId: 'task_converge',
        metadata: { taskGroup },
        // Explicit command bypasses CLI resolution — the substrate's env mutation IS
        // the "agent work"; env carries the deterministic per-sibling change.
        command: 'noop',
        env: { [MUTATION_ENV]: encodeMutation(mutation) },
      }),
      PRINCIPAL,
    );
    expect(result.ok).toBe(true);
    return result.value!.workspaceId;
  }

  /** Launch a sibling in the default (no-inference) module. */
  const launchSibling = (runtimeId: string, taskGroup: string, mutation: SubstrateMutation) =>
    launchSiblingIn(module, runtimeId, taskGroup, mutation);

  it('drives the FULL loop: launch → compare → converge → merge → sealed evidence', async () => {
    const taskGroup = 'grp_converge';

    // ---- STAGE 1: LAUNCH two parallel siblings, each a DIFFERENT committed diff ----
    const wsA = await launchSibling('claude_code', taskGroup, {
      write: {
        'a.ts': 'from-a\n',
        'pick.ts': 'pick-by-a\n',
        'synth.ts': 'l1-A\nl2\nl3\nl4\nl5\n',
      },
    });
    const wsB = await launchSibling('codex', taskGroup, {
      write: {
        'b.ts': 'from-b\n',
        'pick.ts': 'pick-by-b\n',
        'synth.ts': 'l1\nl2\nl3\nl4\nl5-B\n',
      },
      delete: ['del.ts'],
    });
    expect(wsA).not.toBe(wsB);
    // Real worktrees materialized with the committed agent work.
    const wtA = (await module.getWorkspace(wsA))!.worktreePath!;
    expect(git(wtA, ['show', 'HEAD:a.ts'])).toBe('from-a\n');

    // ---- STAGE 2: COMPARE — siblings, contested set, per-sibling diffstat ----
    const compare = await module.compareTaskGroup(taskGroup, PRINCIPAL);
    expect(compare.count).toBe(2);
    expect(compare.siblings.map(s => s.agent).sort()).toEqual(['claude_code', 'codex']);
    // The CONTESTED set = the two files BOTH agents touched (from real git diff).
    expect(compare.contested.map(c => c.path).sort()).toEqual(['pick.ts', 'synth.ts']);
    for (const c of compare.contested) {
      expect([...c.workspaceIds].sort()).toEqual([wsA, wsB].sort());
    }
    // Per-sibling diffstat is real (both agents changed ≥3 files; B also deleted del.ts).
    const rowA = compare.siblings.find(s => s.workspaceId === wsA)!;
    const rowB = compare.siblings.find(s => s.workspaceId === wsB)!;
    expect(rowA.diffStat!.files).toBeGreaterThanOrEqual(3);
    expect(rowA.changedFiles).toEqual(expect.arrayContaining(['a.ts', 'pick.ts', 'synth.ts']));
    expect(rowB.changedFiles).toEqual(expect.arrayContaining(['b.ts', 'pick.ts', 'synth.ts', 'del.ts']));

    // ---- STAGE 3: CONVERGE — plan (pick B for pick.ts, SYNTHESIZE synth.ts) → compose ----
    const selection = {
      'pick.ts': wsB, // pick the winner
      'synth.ts': SYNTHESIZE_SELECTION, // line-level 3-way of the non-overlapping edits
    };
    const plan = await module.planConvergence(taskGroup, selection, undefined, PRINCIPAL);
    expect(plan.complete).toBe(true);
    expect(plan.unresolved).toEqual([]);
    // 5 winning files: a.ts, b.ts, del.ts, pick.ts, synth.ts.
    expect(plan.files.map(f => f.path).sort()).toEqual(['a.ts', 'b.ts', 'del.ts', 'pick.ts', 'synth.ts']);
    expect(plan.files.find(f => f.path === 'pick.ts')).toMatchObject({ mode: 'pick', sourceWorkspaceId: wsB, contested: true });
    expect(plan.files.find(f => f.path === 'synth.ts')).toMatchObject({ mode: 'synthesize', contested: true });

    const composed = await module.composeConvergence(
      { taskGroup, selection, createdBy: PRINCIPAL.userId },
      PRINCIPAL,
    );
    expect(composed.ok).toBe(true);
    const conv = composed.value!;
    expect(conv.fileCount).toBe(5);
    // A NEW reviewable workspace with the MERGED files (real git worktree).
    const convWs = (await module.getWorkspace(conv.workspaceId))!;
    expect(convWs.state).toBe('awaiting_review');
    expect(typeof convWs.metadata?.repoId).toBe('string');
    expect(convWs.metadata?.taskGroup).toBeUndefined();
    const convWt = convWs.worktreePath!;
    expect(git(convWt, ['show', 'HEAD:a.ts'])).toBe('from-a\n');
    expect(git(convWt, ['show', 'HEAD:b.ts'])).toBe('from-b\n');
    expect(git(convWt, ['show', 'HEAD:pick.ts'])).toBe('pick-by-b\n'); // winner B
    const synthMerged = git(convWt, ['show', 'HEAD:synth.ts']);
    expect(synthMerged).toContain('l1-A'); // A's edit
    expect(synthMerged).toContain('l5-B'); // B's edit
    expect(synthMerged).not.toContain('<<<<<<<'); // clean 3-way, no markers
    expect(git(convWt, ['show', 'HEAD:keep.ts'])).toBe('base-keep\n'); // base-only untouched
    // B's deletion is reflected in the convergence.
    expect(() => git(convWt, ['show', 'HEAD:del.ts'])).toThrow();

    // ---- STAGE 4: MERGE through the governed gate → sealed evidence record ----
    const merge = await module.mergeWorkspace(conv.workspaceId, {}, PRINCIPAL);
    expect(merge.ok).toBe(true);
    expect(merge.value!.merged).toBe(true);
    expect(merge.value!.mergeMode).toBe('local');
    // The gate decided workspace.merge, and the merge sealed an evidence audit leaf.
    expect(gate.decisions).toContain('workspace.merge');
    expect(merge.value!.auditEntryHash).toBeTruthy();
    expect(merge.value!.evidenceHash).toBeTruthy();
    // The pre-merge trust gate reads the composed workspace's immutable N-source
    // provenance. It must not collapse this real two-agent convergence to `solo`,
    // and the contested whole-file pick must be visible before/at delivery.
    expect(merge.value!.vote).toMatchObject({
      verdict: 'mixed',
      contestedCount: 2,
      converged: ['synth.ts'],
      picked: ['pick.ts'],
    });
    expect(merge.value!.trustFlags?.join(' ')).toMatch(/pick\.ts/i);
    expect(merge.value!.convergenceFeedback).toMatchObject({
      durable: true,
      totalDeliveries: 1,
      contestedPickDecisions: 1,
    });
    expect(feedbackRecords[0]).toMatchObject({
      workspaceId: conv.workspaceId,
      picks: [{ path: 'pick.ts', sourceWorkspaceId: wsB, sourceRuntime: 'codex' }],
      trustTier: 'high',
    });
    expect(feedbackRecords[0]?.proceededWithFlags.join(' ')).toMatch(/pick\.ts/i);
    expect(await module.getConvergenceDecisionProfile(conv.workspaceId)).toMatchObject({
      repoId: convWs.metadata?.repoId,
      totalDeliveries: 1,
      contestedPickDecisions: 1,
    });

    // An explicit disposition — never the merge itself — calibrates the same
    // repository's future trust. Dismiss hides the exact repeat without restoring
    // evidence points; Accept retains it and adds a small confirmed-risk deduction.
    const flag = merge.value!.trustFlags!.find(value => /pick\.ts/i.test(value))!;
    const rawTrust = await module.getConvergenceTrust(conv.workspaceId);
    const dismissed = await module.setConvergenceFlagFeedback(
      conv.workspaceId,
      { flag, disposition: 'dismissed' },
      PRINCIPAL,
    );
    expect(dismissed.ok).toBe(true);
    expect(gate.decisions).toContain('workspace.convergence-feedback');
    expect(dismissed.value).toMatchObject({ dismissedFlagRules: 1, acceptedFlagRules: 0 });
    const dismissedTrust = await module.getConvergenceTrust(conv.workspaceId);
    expect(dismissedTrust!.reviewFlags).not.toContain(flag);
    expect(dismissedTrust!.score).toBe(rawTrust!.score);

    const accepted = await module.setConvergenceFlagFeedback(
      conv.workspaceId,
      { flag, disposition: 'accepted' },
      PRINCIPAL,
    );
    expect(accepted.value).toMatchObject({ dismissedFlagRules: 0, acceptedFlagRules: 1 });
    const acceptedTrust = await module.getConvergenceTrust(conv.workspaceId);
    expect(acceptedTrust!.reviewFlags).toContain(flag);
    expect(acceptedTrust!.score).toBe(rawTrust!.score - 3);
    expect(acceptedTrust!.calibration?.accepted).toEqual([flag]);

    const evidence = await module.getConvergenceEvidence(conv.workspaceId);
    expect(evidence).not.toBeNull();
    expect(evidence!.evidence.chosenWorkspaceId).toBe(conv.workspaceId);
    expect(evidence!.evidence.governance.action).toBe('workspace.merge');
    expect(evidence!.evidence.governance.effect).toBe('allow');
    expect(evidence!.evidence.contentHash).toBeTruthy();
    expect(evidence!.seal.auditEntryHash).toBeTruthy();
    // The per-file convergence provenance shows WHICH sibling won each contested file.
    const sel = evidence!.evidence.convergence!.selections;
    expect(evidence!.evidence.convergence!.fileCount).toBe(5);
    expect(sel.find(s => s.path === 'pick.ts')).toMatchObject({ mode: 'pick', sourceWorkspaceId: wsB, contested: true });
    expect(sel.find(s => s.path === 'synth.ts')).toMatchObject({ mode: 'synthesize', contested: true });

    // The change actually LANDED in the base repo's main (not just a branch).
    expect(showMain(repo, 'a.ts')).toBe('from-a\n');
    expect(showMain(repo, 'b.ts')).toBe('from-b\n');
    expect(showMain(repo, 'pick.ts')).toBe('pick-by-b\n');
    expect(showMain(repo, 'synth.ts')).toContain('l1-A');
    expect(showMain(repo, 'synth.ts')).toContain('l5-B');
    expect(existsOnMain(repo, 'del.ts')).toBe(false); // deletion delivered

    // ---- STAGE 5: HARVEST — the completion hook shapes a lesson candidate ----
    // Exercises the SAME memory-harvest adapter the module's run-event pipeline
    // composes (createCompletionHookSink), wired to this module's brain + live
    // getWorkspace, fed the converged delivery's terminal event.
    const harvestSink = createCompletionHookSink({
      inner: { append: async () => {} },
      brain,
      getWorkspace: id => module.getWorkspace(id),
      logger: makeLogger(),
    });
    await harvestSink.append({
      eventId: 'evt_converge_completed',
      type: 'completed',
      taskId: convWs.taskId,
      runId: `run_${conv.workspaceId}`,
      createdAt: new Date().toISOString(),
      data: {
        workspaceId: conv.workspaceId,
        convergedAgents: 2,
        contestedPaths: ['pick.ts', 'synth.ts'],
        winningApproach: 'pick B for pick.ts; 3-way synthesize for synth.ts',
      },
    } as RunEvent);
    await sleep(0); // let the fire-and-forget harvest settle

    expect(brain.harvestCalls).toHaveLength(1);
    const lesson = brain.harvestCalls[0]!;
    expect(lesson.userId).toBe(PRINCIPAL.userId);
    expect(lesson.taskId).toBe(convWs.taskId);
    expect(lesson.outcome).toBe('completed');
    expect(lesson.convergedAgents).toBe(2);
    expect(lesson.contestedPaths).toEqual(expect.arrayContaining(['pick.ts', 'synth.ts']));
    expect(lesson.winningApproach).toContain('synthesize');
  });

  it('ASSISTED: a mechanically-conflicting contested file resolves via injected inference', async () => {
    const selection = { 'synth.ts': ASSISTED_SELECTION };
    // Overlapping SAME-line edits to synth.ts — the mechanical 3-way CONFLICTS.
    const A_WORK: SubstrateMutation = { write: { 'synth.ts': 'l1\nl2\nl3-from-A\nl4\nl5\n' } };
    const B_WORK: SubstrateMutation = { write: { 'synth.ts': 'l1\nl2\nl3-from-B\nl4\nl5\n' } };

    // ---- Control: with NO inference wired, @assisted degrades truthfully ----
    const degradeGroup = 'grp_assist_degrade';
    const dA = await launchSiblingIn(module, 'claude_code', degradeGroup, A_WORK);
    const dB = await launchSiblingIn(module, 'codex', degradeGroup, B_WORK);
    const dCompare = await module.compareTaskGroup(degradeGroup, PRINCIPAL);
    expect(dCompare.contested.map(c => c.path)).toEqual(['synth.ts']);
    expect([...dCompare.contested[0]!.workspaceIds].sort()).toEqual([dA, dB].sort());

    const noAssist = await module.composeConvergence(
      { taskGroup: degradeGroup, selection, createdBy: PRINCIPAL.userId },
      PRINCIPAL,
    );
    expect(noAssist.ok).toBe(false);
    expect(noAssist.code).toBe('unresolved'); // mechanical synthesize-conflict, no fake merge
    expect(noAssist.reason).toContain('synth.ts');

    // ---- Resolve: a module WITH an injected fake inference resolves the conflict ----
    const VALID_MERGE = 'l1\nl2\nl3-merged\nl4\nl5\n';
    const calls: Parameters<ConvergeInferenceFn>[0][] = [];
    const infer: ConvergeInferenceFn = async input => {
      calls.push(input);
      return { routed: true, inference_id: 'inf-e2e', content: VALID_MERGE };
    };
    const assisted = composeConductor({ substrates: [substrate], brain, infer });
    const resolveGroup = 'grp_assist_resolve';
    // Siblings must live in THIS module's state of record — launch them through it.
    const rA = await launchSiblingIn(assisted.module, 'claude_code', resolveGroup, A_WORK);
    const rB = await launchSiblingIn(assisted.module, 'codex', resolveGroup, B_WORK);
    expect([rA, rB]).toHaveLength(2);

    const composed = await assisted.module.composeConvergence(
      { taskGroup: resolveGroup, selection, createdBy: PRINCIPAL.userId },
      PRINCIPAL,
    );
    expect(composed.ok).toBe(true);
    // The model's validated merge landed as the file content (marker-free).
    const convWt = (await assisted.module.getWorkspace(composed.value!.workspaceId))!.worktreePath!;
    expect(git(convWt, ['show', 'HEAD:synth.ts'])).toBe(VALID_MERGE);
    // The assisted synthesis is recorded on the plan (evidence serializes it).
    expect(composed.value!.plan.assisted).toEqual([{ path: 'synth.ts', inference_id: 'inf-e2e' }]);
    // The call addressed the injected inference with BOTH contested versions.
    expect(calls).toHaveLength(1);
    const prompt = calls[0]!.input.messages[0]!.content as string;
    expect(prompt).toContain('l3-from-A');
    expect(prompt).toContain('l3-from-B');

    await assisted.module.stop().catch(() => {});
  });
});
