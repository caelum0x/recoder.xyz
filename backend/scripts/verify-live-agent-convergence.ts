/**
 * Authenticated live-agent product proof over a Recoder-owned fixture.
 *
 * The committed fixture is copied into a temporary git repo; its source is never
 * edited. Two real Codex CLI processes run in isolated worktrees through the
 * Conductor workspace engine, after which the public compare/converge/merge APIs
 * deliver one selected result and durable feedback is read back from SQLite.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunEvent } from '@recoder/agent-os';
import { createConvergenceFeedbackStore } from '../src/domains/conductor/adapters/convergence-feedback.adapter.js';
import { createSqliteKvStore } from '../src/domains/persistence/repositories/sqlite-kv-store.repository.js';
import {
  composeConductor,
  makeCreateInput,
  makePrincipal,
} from '../src/domains/conductor/__fixtures__/harness.js';
import { SpawningSubstrate } from '../src/domains/conductor/__fixtures__/spawn-substrate.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(SCRIPT_DIR, '../fixtures/live-convergence');
const DECISION_FILE = 'decision.md';
const TIMEOUT_MS = 2 * 60 * 1_000;
const POLL_MS = 500;

function git(cwd: string, args: readonly string[]): string {
  return execFileSync(
    'git',
    [
      '-c', 'user.email=live-proof@recoder.local',
      '-c', 'user.name=Recoder Live Proof',
      '-c', 'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const out = (name: string, value: unknown): void => {
  process.stdout.write(`${name} ${JSON.stringify(value)}\n`);
};

async function waitForTerminal(
  module: ReturnType<typeof composeConductor>['module'],
  workspaceId: string,
): Promise<RunEvent> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const events = await module.listWorkspaceEvents(workspaceId);
    const terminal = events.find(event => event.type === 'completed' || event.type === 'failed');
    if (terminal) return terminal;
    await sleep(POLL_MS);
  }
  const events = await module.listWorkspaceEvents(workspaceId);
  out(`candidate.${workspaceId}.timeoutEvents`, events.slice(-5));
  throw new Error(`live agent ${workspaceId} did not settle within ${TIMEOUT_MS}ms`);
}

async function main(): Promise<void> {
  const fixtureBefore = readFileSync(path.join(FIXTURE, DECISION_FILE), 'utf8');
  const root = mkdtempSync(path.join(tmpdir(), 'recoder-owned-live-loop-'));
  const repo = path.join(root, 'fixture-repo');
  const worktreesDir = path.join(root, 'worktrees');
  const isolatedCodexHome = path.join(root, 'codex-home');
  const sourceCodexHome = process.env.CODEX_HOME?.trim() || path.join(homedir(), '.codex');
  const sourceAuth = path.join(sourceCodexHome, 'auth.json');
  const installationId = path.join(sourceCodexHome, 'installation_id');
  cpSync(FIXTURE, repo, { recursive: true });
  mkdirSync(worktreesDir, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'Recoder live convergence fixture']);

  const state = createSqliteKvStore(path.join(root, 'recoder-state.sqlite'));
  const substrate = new SpawningSubstrate({
    worktreesDir,
    pathDirs: (process.env.PATH ?? '').split(path.delimiter).filter(Boolean),
    inheritEnv: true,
    // The managed parent may expose ~/.codex read-only. A minimal writable home
    // lets the nested authenticated CLI initialize its app-server without
    // mutating the operator's real Codex state. It is deleted in `finally`.
    env: { CODEX_HOME: isolatedCodexHome },
  });
  const { module } = composeConductor({
    substrates: [substrate],
    convergenceFeedback: createConvergenceFeedbackStore(state),
    overrides: { mergeTrustGate: 'warn' },
  });
  const principal = makePrincipal('recoder_live_fixture_operator');
  const taskGroup = `recoder-owned-${Date.now().toString(36)}`;
  const launched: string[] = [];
  const basePrompt = [
    `This is Recoder's isolated live-agent fixture. Modify exactly the tracked ${DECISION_FILE} file.`,
    'Replace only the line beginning "Product direction:" with the exact replacement below.',
    'Do not modify any other line or file. Do not run tests. Do not commit. Stop immediately after the edit.',
  ].join(' ');
  const prompts = [
    `${basePrompt}\n\nProduct direction: prioritize deterministic convergence feedback.`,
    `${basePrompt}\n\nProduct direction: prioritize authenticated multi-agent execution.`,
  ];

  out('proof.root', root);
  out('proof.target', 'backend/fixtures/live-convergence');
  out('proof.transport', 'process_worktree');
  out('proof.runtime', 'codex');
  out('proof.runtimeHome', 'isolated_writable_auth_copy');

  try {
    if (!existsSync(sourceAuth)) {
      throw new Error(`authenticated Codex credentials unavailable at ${sourceAuth}`);
    }
    mkdirSync(isolatedCodexHome, { recursive: true });
    copyFileSync(sourceAuth, path.join(isolatedCodexHome, 'auth.json'));
    if (existsSync(installationId)) {
      copyFileSync(installationId, path.join(isolatedCodexHome, 'installation_id'));
    }
    for (const [index, prompt] of prompts.entries()) {
      const result = await module.createWorkspace(
        makeCreateInput({
          spaceId: 'space_recoder_live_fixture',
          projectId: 'recoder-live-convergence',
          taskId: `recoder_live_candidate_${index + 1}`,
          repoPath: repo,
          runtimeId: 'codex',
          substrate: 'tmux_worktree',
          prompt,
          metadata: { taskGroup, repoId: 'recoder-live-convergence' },
        }),
        principal,
      );
      if (!result.ok || !result.value) throw new Error(result.reason ?? `candidate ${index + 1} launch failed`);
      launched.push(result.value.workspaceId);
      out(`candidate.${index + 1}.launched`, {
        workspaceId: result.value.workspaceId,
        worktreePath: result.value.worktreePath,
      });
    }

    const terminals = await Promise.all(launched.map(id => waitForTerminal(module, id)));
    terminals.forEach((event, index) => out(`candidate.${index + 1}.terminal`, {
      type: event.type,
      exitCode: event.data?.exitCode,
    }));
    if (terminals.some(event => event.type !== 'completed')) {
      for (const [index, workspaceId] of launched.entries()) {
        const events = await module.listWorkspaceEvents(workspaceId);
        out(`candidate.${index + 1}.failureEvidence`, events.slice(-4).map(event => ({
          type: event.type,
          ...(event.message ? { message: event.message.slice(-1_200) } : {}),
          ...(event.data?.exitCode !== undefined ? { exitCode: event.data.exitCode } : {}),
        })));
      }
      throw new Error('one or more Codex candidates failed');
    }

    const compare = await module.compareTaskGroup(taskGroup, principal);
    out('compare', { count: compare.count, contested: compare.contested.map(row => row.path) });
    if (!compare.contested.some(row => row.path === DECISION_FILE)) {
      throw new Error(`${DECISION_FILE} was not contested`);
    }
    const selection = Object.fromEntries(compare.contested.map(row => [row.path, launched[1]!]));
    const composed = await module.composeConvergence({ taskGroup, selection, createdBy: principal.userId }, principal);
    if (!composed.ok || !composed.value) throw new Error(composed.reason ?? 'compose failed');
    out('compose', composed.value);

    const merge = await module.mergeWorkspace(composed.value.workspaceId, {}, principal);
    if (!merge.ok || !merge.value?.merged) throw new Error(merge.reason ?? 'merge failed');
    out('merge', {
      merged: merge.value.merged,
      trustTier: merge.value.trustTier,
      trustScore: merge.value.trustScore,
      vote: merge.value.vote,
      evidenceHash: merge.value.evidenceHash,
    });
    out('feedback', await module.getConvergenceDecisionProfile(composed.value.workspaceId));
    out('delivered', readFileSync(path.join(repo, DECISION_FILE), 'utf8'));
    if (readFileSync(path.join(FIXTURE, DECISION_FILE), 'utf8') !== fixtureBefore) {
      throw new Error('committed Recoder fixture was modified');
    }
    out('proof.result', 'PASS');
  } finally {
    for (const workspaceId of launched) {
      const workspace = await module.getWorkspace(workspaceId);
      if (workspace?.state === 'running') await module.stopWorkspace(workspaceId, principal).catch(() => undefined);
    }
    await module.stop().catch(() => undefined);
    state.close();
    // The proof root contains the isolated credential copy, git worktrees, and
    // SQLite evidence. Always erase the whole root on success or failure.
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
