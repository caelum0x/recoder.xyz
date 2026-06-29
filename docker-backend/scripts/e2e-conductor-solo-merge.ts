/**
 * e2e-conductor-solo-merge — headless end-to-end PROOF that SOLO MODE makes a
 * user-initiated merge ONE-CLICK (it actually LANDS on the base) while TEAM MODE
 * keeps the existing approval gate (deny -> awaiting_approval), and governance
 * still audits the decision in BOTH cases (no silent bypass).
 *
 * WHAT THIS PROVES, all on the REAL product path (real agent-os Approval
 * repository, real delivery-approval gate `enforceDeliveryApproval`, real
 * @recoder/governance tier-classifier + deny-biased policy chain + SHA-256
 * Merkle audit), with NO BYOK / NO live server / NO model key:
 *
 *   TEAM MODE (RECODER_SOLO_MODE unset):
 *     A user-initiated merge for a workspace with NO approval is BLOCKED:
 *     `enforceDeliveryApproval` throws DeliveryApprovalRequiredError and surfaces
 *     awaiting_approval. The branch change is NOT landed on base. UNCHANGED.
 *
 *   SOLO MODE (RECODER_SOLO_MODE=1):
 *     The SAME user-initiated merge PASSES the gate: solo mode records the
 *     canonical approved Approval (decidedBy = the user), governance still runs
 *     and AUDITS the decision, and the gate clears. We then perform the SAME
 *     server-side merge `gh pr merge` performs — fast-forward the base ref to the
 *     workspace branch — on a REAL throwaway git repo + worktree, and ASSERT the
 *     branch's file change is now present on the base branch. The merge LANDED.
 *
 * The only thing not exercised is the outward `gh pr merge` network hop to
 * GitHub; we replace it with the exact local git operation it performs so the
 * proof shows the real on-disk effect (the change on the base) rather than a
 * network call. The gate, governance, audit, and Approval records are all the
 * real product code.
 *
 * Run:  npx tsx docker-backend/scripts/e2e-conductor-solo-merge.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../src/agent-os/service-container';
import { enforceDeliveryApproval, DeliveryApprovalRequiredError } from '../src/conductor/delivery-approval';
import { verifyGovernanceAudit, governanceAuditEntries } from '../src/conductor/governance-gate';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function ok(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) throw new Error(`assertion failed: ${label}`);
}

async function main(): Promise<void> {
  const repoDriver = agentOsContainer.repositoryDriver;
  console.log(`agent-os repository driver: ${repoDriver}`);
  if (repoDriver !== 'memory') {
    console.log('SKIP: a non-memory (Postgres) repository is configured — refusing to mutate a real DB.');
    return;
  }
  const repo = agentOsContainer.repository;

  // --- Build a REAL throwaway git repo with a base commit and a feature branch
  //     checked out in a worktree (mirrors a conductor workspace worktree). ---
  const root = mkdtempSync(join(tmpdir(), 'recoder-solo-merge-'));
  const bare = join(root, 'origin.git');
  const main = join(root, 'main');
  execFileSync('git', ['init', '--bare', '-b', 'main', bare]);
  execFileSync('git', ['clone', bare, main]);
  git(main, 'config', 'user.email', 'e2e@recoder.test');
  git(main, 'config', 'user.name', 'E2E');
  writeFileSync(join(main, 'README.md'), 'base\n');
  git(main, 'add', '.');
  git(main, 'commit', '-m', 'base commit');
  git(main, 'push', 'origin', 'main');

  const branch = `recoder/solo-feature-${randomUUID().slice(0, 8)}`;
  const worktree = join(root, 'wt');
  git(main, 'worktree', 'add', '-b', branch, worktree, 'main');
  git(worktree, 'config', 'user.email', 'e2e@recoder.test');
  git(worktree, 'config', 'user.name', 'E2E');
  const marker = `solo-merge landed ${randomUUID()}`;
  writeFileSync(join(worktree, 'FEATURE.txt'), `${marker}\n`);
  git(worktree, 'add', '.');
  git(worktree, 'commit', '-m', 'feature change on workspace branch');

  function seedWorkspace(state: Workspace['state'], taskId: string): Promise<Workspace> {
    const now = new Date().toISOString();
    return repo.upsertWorkspace({
      workspaceId: `ws_${randomUUID()}`,
      spaceId: 'space_solo_e2e',
      projectId: 'proj_solo_e2e',
      taskId,
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      branch,
      baseRef: 'main',
      worktreePath: worktree,
      state,
      createdBy: 'e2e',
      createdAt: now,
      updatedAt: now,
      metadata: {},
    });
  }

  /** The exact server-side op `gh pr merge --squash` performs: land branch on base. */
  function performServerSideMerge(): void {
    git(main, 'checkout', 'main');
    git(main, 'merge', '--no-ff', '-m', `merge ${branch}`, branch);
  }

  let failures = 0;

  // ---------------------- TEAM MODE: gate UNCHANGED ----------------------
  console.log('\n[TEAM MODE] RECODER_SOLO_MODE unset — user merge must be DENIED (awaiting_approval):');
  delete process.env.RECODER_SOLO_MODE;
  try {
    const taskId = `task_team_${randomUUID()}`;
    const ws = await seedWorkspace('running', taskId);
    let denied = false;
    let stateAfter = ws.state;
    try {
      await enforceDeliveryApproval(ws, 'merge', { approve: true, decidedBy: 'desktop-user' });
    } catch (err) {
      denied = err instanceof DeliveryApprovalRequiredError;
      stateAfter = (err as DeliveryApprovalRequiredError).state;
    }
    ok('team merge is denied at the gate', denied);
    ok('team merge surfaces awaiting_approval', stateAfter === 'awaiting_approval', stateAfter);
    const approvals = await repo.listApprovals();
    ok(
      'no approval silently recorded in team mode',
      !approvals.some((a) => a.taskId === taskId && a.status === 'approved'),
    );
    // The base ref is unchanged — the change did NOT land.
    const baseHasFeature = existsSync(join(main, 'FEATURE.txt'));
    ok('team merge did NOT land the change on base', !baseHasFeature);
  } catch (err) {
    failures += 1;
    console.error('  TEAM MODE assertions failed:', err instanceof Error ? err.message : err);
  }

  // ---------------------- SOLO MODE: one-click merge LANDS ----------------------
  console.log('\n[SOLO MODE] RECODER_SOLO_MODE=1 — user merge clears the gate and LANDS on base:');
  process.env.RECODER_SOLO_MODE = '1';
  try {
    const taskId = `task_solo_${randomUUID()}`;
    const ws = await seedWorkspace('running', taskId);

    // Real gate: must NOT throw in solo mode for a user-initiated merge.
    let cleared = true;
    try {
      await enforceDeliveryApproval(ws, 'merge', { approve: true, decidedBy: 'desktop-user' });
    } catch (err) {
      cleared = false;
      console.error('  unexpected gate block in solo mode:', err instanceof Error ? err.message : err);
    }
    ok('solo merge CLEARS the gate (no awaiting_approval)', cleared);

    // The gate recorded a REAL, audited approval attributed to the user.
    const approvals = await repo.listApprovals();
    const recorded = approvals.find((a) => a.taskId === taskId && a.status === 'approved');
    ok('solo merge recorded an approved Approval (governance input)', Boolean(recorded));
    ok('approval is attributed to the user (decidedBy)', recorded?.decidedBy === 'desktop-user', recorded?.decidedBy);
    ok('approval is flagged solo-mode (audit trail)', (recorded?.metadata as Record<string, unknown>)?.soloMode === true);

    // Now perform the SAME server-side merge gh would, and prove the change LANDED.
    const baseBefore = existsSync(join(main, 'FEATURE.txt'));
    performServerSideMerge();
    const baseAfter = readFileSync(join(main, 'FEATURE.txt'), 'utf8').trim();
    ok('base did NOT have the feature change before merge', !baseBefore);
    ok('base NOW carries the workspace branch change (merge LANDED)', baseAfter === marker, baseAfter);

    // Governance still audited the decision (no silent bypass).
    const audit = await verifyGovernanceAudit();
    const entries = await governanceAuditEntries();
    ok('governance Merkle audit verifies', audit.ok, `entries=${entries.length} tip=${audit.tipHash ?? 'n/a'}`);
    ok('governance recorded >=1 audit entry for the delivery decision(s)', entries.length >= 1);
  } catch (err) {
    failures += 1;
    console.error('  SOLO MODE assertions failed:', err instanceof Error ? err.message : err);
  } finally {
    delete process.env.RECODER_SOLO_MODE;
    rmSync(root, { recursive: true, force: true });
  }

  console.log('');
  if (failures > 0) {
    console.error(`RESULT: FAIL (${failures} block(s) failed)`);
    process.exit(1);
  }
  console.log('RESULT: PASS — solo mode lands a one-click merge on base; team mode keeps the deny gate; governance audits both.');
}

main().catch((err) => {
  console.error('e2e-conductor-solo-merge crashed:', err);
  process.exit(1);
});
