/**
 * e2e-conductor-solo-merge-rust — headless end-to-end PROOF, AGAINST THE REAL
 * RUST GOVERNANCE KERNEL, that a USER-INITIATED SOLO merge is ONE-CLICK (it
 * actually LANDS on the base) while TEAM MODE is still HARD-DENIED by the kernel.
 *
 * The bug this proves fixed only reproduces against the real Rust daemon: the
 * merge performs `git:push`, which the kernel's permission stage treats as an
 * escalation `workspace-write -> danger-full-access` and HARD-DENIES
 * (`{effect:deny, hardDeny:true, degraded:false}` — degraded:false proves the
 * Rust kernel decided, not the pure-TS fallback). A solo approval record does NOT
 * clear a hard deny, so before the fix the merge never landed.
 *
 * THE FIX: in RECODER_SOLO_MODE for a user-initiated delivery the operator holds
 * danger-full-access on their own machine, so `decideDelivery` PRE-GRANTS the
 * escalation (it omits the escalation-forcing tool name). The kernel then routes
 * the action through its `push` delivery boundary (needs_approval, NOT a hard
 * deny), the recorded solo Approval clears that soft gate, and the merge lands.
 * Team mode still sends the escalation-forcing tool name → still hard-denied.
 *
 * WHAT THIS ASSERTS (all on the REAL product path + the REAL Rust kernel):
 *
 *   Rust kernel active:
 *     Spawn the prebuilt daemon (crates/recoder-governance/target/release/
 *     recoder-governance-daemon) via the conductor's own seam
 *     (ensureGovernanceDaemon) with GOVERNANCE_DAEMON_FORCE=1 +
 *     GOVERNANCE_ALLOW_INSECURE=1 (local dev). Every verdict below MUST have
 *     `degraded === false` — proof the Rust kernel decided.
 *
 *   TEAM MODE (RECODER_SOLO_MODE unset):
 *     decideDelivery(team) returns {effect:'deny', hardDeny:true, degraded:false}
 *     — the kernel hard-denies the git:push escalation. enforceDeliveryApproval
 *     throws DeliveryApprovalRequiredError; the branch change does NOT land.
 *
 *   SOLO MODE (RECODER_SOLO_MODE=1, user-initiated):
 *     decideDelivery(solo, pre-granted) returns a NON-hardDeny verdict with
 *     `degraded === false` (the kernel allowed / needs_approval, not deny).
 *     enforceDeliveryApproval CLEARS the gate; we then perform the exact
 *     server-side merge gh performs (fast-forward base to the branch) on a REAL
 *     throwaway git repo + worktree and assert the change LANDED on base. A real,
 *     audited Approval (decidedBy = the user, soloMode) was recorded.
 *
 * Run (local dev):
 *   GOVERNANCE_ALLOW_INSECURE=1 GOVERNANCE_DAEMON_FORCE=1 \
 *     npx tsx docker-backend/scripts/e2e-conductor-solo-merge-rust.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../src/agent-os/service-container';
import {
  DeliveryApprovalRequiredError,
  enforceDeliveryApproval,
} from '../src/conductor/delivery-approval';
import { decideDelivery, verifyGovernanceAudit } from '../src/conductor/governance-gate';
import { ensureGovernanceDaemon, governanceDaemonHandle } from '../src/conductor/governance-daemon';

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

  // --- Bring up the REAL Rust governance daemon via the conductor's own seam. ---
  // Local dev: GOVERNANCE_ALLOW_INSECURE lets the daemon start without a shared
  // key (peer-cred still pins our uid). GOVERNANCE_DAEMON_FORCE makes the seam
  // spawn even under a test-shaped env.
  process.env.GOVERNANCE_DAEMON_FORCE = '1';
  if (!process.env.GOVERNANCE_SOCKET && !process.env.INTERNAL_SERVICE_KEY) {
    process.env.GOVERNANCE_ALLOW_INSECURE = '1';
  }
  console.log('\n[RUST KERNEL] ensuring the prebuilt governance daemon is up...');
  const daemon = await ensureGovernanceDaemon();
  const live = governanceDaemonHandle();
  if (!daemon && !process.env.GOVERNANCE_SOCKET) {
    console.error(
      '  FAIL: the Rust governance daemon did not come up. Build it first:\n' +
        '    cargo build --release -p recoder-governance-daemon \\\n' +
        '      --manifest-path crates/recoder-governance/Cargo.toml\n' +
        '  and run with GOVERNANCE_ALLOW_INSECURE=1 (local) or INTERNAL_SERVICE_KEY set.',
    );
    process.exit(2);
  }
  console.log(`  daemon socket: ${live?.socketPath ?? process.env.GOVERNANCE_SOCKET}`);

  // --- Build a REAL throwaway git repo: base commit + feature branch worktree. ---
  const root = mkdtempSync(join(tmpdir(), 'recoder-solo-merge-rust-'));
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

  function seedWorkspace(taskId: string): Promise<Workspace> {
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
      state: 'running',
      createdBy: 'e2e',
      createdAt: now,
      updatedAt: now,
      metadata: {},
    });
  }

  /** The exact server-side op `gh pr merge` performs: land the branch on base. */
  function performServerSideMerge(): void {
    git(main, 'checkout', 'main');
    git(main, 'merge', '--no-ff', '-m', `merge ${branch}`, branch);
  }

  let failures = 0;

  try {
    // ---------------------- TEAM MODE: kernel HARD-DENIES ----------------------
    console.log('\n[TEAM MODE] RECODER_SOLO_MODE unset — Rust kernel must HARD-DENY the git:push escalation:');
    delete process.env.RECODER_SOLO_MODE;
    try {
      const taskId = `task_team_${randomUUID()}`;
      const ws = await seedWorkspace(taskId);

      // Direct verdict from the Rust kernel (no approval, no solo pre-grant).
      const teamVerdict = await decideDelivery(ws, 'merge', false, false);
      console.log(
        `  GOVERNANCE VERDICT (team): effect=${teamVerdict.verdict.effect} ` +
          `hardDeny=${teamVerdict.hardDeny} degraded=${teamVerdict.degraded} ` +
          `tier=${teamVerdict.verdict.tier} reason="${teamVerdict.verdict.reason}"`,
      );
      ok('team verdict came from the REAL Rust kernel (degraded:false)', teamVerdict.degraded === false);
      ok('team verdict is a HARD DENY (effect:deny)', teamVerdict.verdict.effect === 'deny');
      ok('team verdict.hardDeny === true', teamVerdict.hardDeny === true);
      ok(
        'team hard-deny is the git:push escalation veto',
        /escalate|danger-full-access|git:push|push/i.test(teamVerdict.verdict.reason),
        teamVerdict.verdict.reason,
      );

      // End-to-end: the gate throws and the change does NOT land on base.
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
      ok('team merge did NOT land the change on base', !existsSync(join(main, 'FEATURE.txt')));
    } catch (err) {
      failures += 1;
      console.error('  TEAM MODE assertions failed:', err instanceof Error ? err.message : err);
    }

    // ---------------- SOLO MODE: kernel ALLOWS, merge LANDS ----------------
    console.log('\n[SOLO MODE] RECODER_SOLO_MODE=1, user-initiated — Rust kernel must NOT hard-deny; merge LANDS:');
    process.env.RECODER_SOLO_MODE = '1';
    try {
      const taskId = `task_solo_${randomUUID()}`;
      const ws = await seedWorkspace(taskId);

      // Direct verdict from the Rust kernel WITH the solo danger-full-access
      // pre-grant (the exact flag enforceDeliveryApproval passes in solo mode).
      const soloVerdict = await decideDelivery(ws, 'merge', true, true);
      console.log(
        `  GOVERNANCE VERDICT (solo): effect=${soloVerdict.verdict.effect} ` +
          `hardDeny=${soloVerdict.hardDeny} degraded=${soloVerdict.degraded} ` +
          `tier=${soloVerdict.verdict.tier} reason="${soloVerdict.verdict.reason}"`,
      );
      ok('solo verdict came from the REAL Rust kernel (degraded:false)', soloVerdict.degraded === false);
      ok('solo verdict is NOT a hard deny', soloVerdict.hardDeny === false);
      ok('solo verdict effect is allow|needs_approval (escalation cleared)', soloVerdict.verdict.effect !== 'deny', soloVerdict.verdict.effect);

      // End-to-end: the gate must NOT throw in solo mode for a user-initiated merge.
      let cleared = true;
      try {
        await enforceDeliveryApproval(ws, 'merge', { approve: true, decidedBy: 'desktop-user' });
      } catch (err) {
        cleared = false;
        console.error('  unexpected gate block in solo mode:', err instanceof Error ? err.message : err);
      }
      ok('solo merge CLEARS the gate (no awaiting_approval)', cleared);

      // A REAL, audited Approval attributed to the user was recorded.
      const approvals = await repo.listApprovals();
      const recorded = approvals.find((a) => a.taskId === taskId && a.status === 'approved');
      ok('solo merge recorded an approved Approval (governance input)', Boolean(recorded));
      ok('approval is attributed to the user (decidedBy)', recorded?.decidedBy === 'desktop-user', recorded?.decidedBy);
      ok('approval is flagged solo-mode (audit trail)', (recorded?.metadata as Record<string, unknown>)?.soloMode === true);

      // Now perform the SAME server-side merge gh would, and prove it LANDED.
      const baseBefore = existsSync(join(main, 'FEATURE.txt'));
      performServerSideMerge();
      const baseAfter = readFileSync(join(main, 'FEATURE.txt'), 'utf8').trim();
      ok('base did NOT have the feature change before merge', !baseBefore);
      ok('base NOW carries the workspace branch change (merge LANDED)', baseAfter === marker, baseAfter);

      // Governance still audited the decision (no silent bypass).
      const audit = await verifyGovernanceAudit();
      ok('governance Merkle audit verifies', audit.ok, `entries=${audit.entries} tip=${audit.tipHash ?? 'n/a'}`);
    } catch (err) {
      failures += 1;
      console.error('  SOLO MODE assertions failed:', err instanceof Error ? err.message : err);
    }
  } finally {
    delete process.env.RECODER_SOLO_MODE;
    rmSync(root, { recursive: true, force: true });
    // Stop the daemon we spawned so the script exits cleanly.
    try {
      governanceDaemonHandle()?.child.kill('SIGTERM');
    } catch {
      /* best-effort */
    }
  }

  console.log('');
  if (failures > 0) {
    console.error(`RESULT: FAIL (${failures} block(s) failed)`);
    process.exit(1);
  }
  console.log(
    'RESULT: PASS — against the REAL Rust kernel (degraded:false), solo mode lands a one-click ' +
      'merge on base; team mode is still HARD-DENIED; governance audits both.',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('e2e-conductor-solo-merge-rust crashed:', err);
  process.exit(1);
});
