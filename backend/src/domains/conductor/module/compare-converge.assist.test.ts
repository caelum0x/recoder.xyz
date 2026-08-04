/**
 * ConductorCompareConverge — the COMPOSITION-layer proof that the assisted
 * convergence synthesis actually RUNS: that `ctx.infer` is threaded through
 * `convergeDeps()` into the ops as `ConvergeOpsDeps.inference`.
 *
 * The ops themselves (`converge.ops.ts`) are unit-tested with a fake inference dep
 * already; what was previously UNPROVEN — and silently degraded on every real run —
 * is the WIRING: whether an injected one-shot reaches the compose op at all.
 *
 * Proves (real git through the module facade):
 *  - WITH a fake `ctx.infer` returning a clean merge, an `assisted` convergence of a
 *    mechanically-unmergeable contested file RESOLVES the conflict, commits the
 *    model's content, and records `plan.assisted` + the per-file provenance/evidence;
 *  - WITHOUT `ctx.infer`, the SAME conflict degrades truthfully to
 *    synthesize-conflict (the mechanical behavior) — `ok:false`, `code:'unresolved'`,
 *    nothing registered.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { Principal } from '../../identity/types.js';
import type { GateVerdict } from '../ports/index.js';
import { ASSISTED_SELECTION } from '../converge/converge-plan.service.js';
import type { ConvergeInferenceFn } from '../converge/converge.ops.js';
import { ConductorCompareConverge } from './compare-converge.js';
import type { ConductorContext } from './shared.js';

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

const principal: Principal = {
  userId: 'user-1',
  scopes: ['write'],
  kind: 'session',
  isAnonymous: false,
  raw: null,
};

/** An allow verdict — the governance gate is stubbed to permit the compose write. */
const allowVerdict: GateVerdict = {
  verdictId: 'v-1',
  requestId: 'r-1',
  effect: 'allow',
  tier: 'low',
  reason: 'test allow',
  degraded: false,
  engine: 'synthetic',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function git(cwd: string, args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.email=t@t.dev', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', ...args],
    { cwd, stdio: 'pipe' },
  );
}

function makeWs(over: Partial<Workspace> & { workspaceId: string; worktreePath: string }): Workspace {
  return {
    spaceId: 's',
    projectId: 'p',
    taskId: 'task-1',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: `b-${over.workspaceId}`,
    baseRef: 'main',
    state: 'awaiting_review',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    // The F3 launch stamps the shared group key here; compose folds the group over it.
    metadata: { taskGroup: 'grp-1' },
    ...over,
  } as Workspace;
}

describe('ConductorCompareConverge assisted synthesis wiring (real git)', () => {
  let root: string;
  let repo: string;
  const BASE_LINES = ['l1', 'l2', 'l3', 'l4', 'l5', ''];
  const VALID_MERGE = 'l1\nl2\nl3-merged\nl4\nl5\n';

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-cc-assist-'));
    repo = path.join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-b', 'main']);
    writeFileSync(path.join(repo, 'shared.ts'), BASE_LINES.join('\n'));
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Two siblings whose SAME-line edits make the mechanical 3-way CONFLICT. */
  function conflictingSiblings(): Record<string, Workspace> {
    const wtA = path.join(root, 'ws-a');
    const wtB = path.join(root, 'ws-b');
    git(repo, ['worktree', 'add', '-b', 'agent-a', wtA, 'main']);
    git(repo, ['worktree', 'add', '-b', 'agent-b', wtB, 'main']);
    const linesA = [...BASE_LINES];
    const linesB = [...BASE_LINES];
    linesA[2] = 'l3-from-A';
    linesB[2] = 'l3-from-B';
    writeFileSync(path.join(wtA, 'shared.ts'), linesA.join('\n'));
    writeFileSync(path.join(wtB, 'shared.ts'), linesB.join('\n'));
    return {
      'ws-a': makeWs({ workspaceId: 'ws-a', worktreePath: wtA, branch: 'agent-a' }),
      'ws-b': makeWs({ workspaceId: 'ws-b', worktreePath: wtB, branch: 'agent-b' }),
    };
  }

  /**
   * A minimal {@link ConductorContext} covering exactly the seams the compose path
   * touches: the governance gate, the workspace engine (list/get), the persistence
   * repository (`upsertWorkspace`), the substrate registry (only reached by the
   * degrade-safe diffStat probe), and the injected `infer` one-shot. Solo mode ⇒ the
   * ownership filter fails open so both siblings fold into the group.
   */
  function buildCtx(
    workspaces: Record<string, Workspace>,
    infer: ConvergeInferenceFn | undefined,
    registered: { ws?: Workspace },
  ): ConductorContext {
    const list = Object.values(workspaces);
    const partial = {
      log: noopLogger,
      cfg: { soloMode: true },
      gate: {
        decide: async () => allowVerdict,
        recordAudit: async () => null,
      },
      engine: {
        listWorkspaces: async () => list,
        getWorkspace: async (id: string) => workspaces[id] ?? null,
        advanceWorkspace: async () => {
          throw new Error('advanceWorkspace not expected in compose');
        },
      },
      engineDeps: {},
      registry: {
        // Only the read-only diffStat probe calls this; it degrades on throw, and the
        // authoritative changed-file list comes from real `git diff` in the worktree.
        getFull: () => ({
          diff: async () => {
            throw new Error('no substrate diff in test');
          },
        }),
      },
      repository: {
        upsertWorkspace: async (ws: Workspace) => {
          registered.ws = ws;
          return ws;
        },
      },
      buildWorkspaceView: async () => ({}),
      ...(infer ? { infer } : {}),
    };
    return partial as unknown as ConductorContext;
  }

  it('a wired ctx.infer RESOLVES the conflict and records plan.assisted + evidence', async () => {
    const calls: Parameters<ConvergeInferenceFn>[0][] = [];
    const infer: ConvergeInferenceFn = async input => {
      calls.push(input);
      return { routed: true, inference_id: 'inf-1', content: VALID_MERGE };
    };
    const registered: { ws?: Workspace } = {};
    const ctx = buildCtx(conflictingSiblings(), infer, registered);
    const cc = new ConductorCompareConverge(ctx);

    const result = await cc.composeConvergence(
      { taskGroup: 'grp-1', selection: { 'shared.ts': ASSISTED_SELECTION }, createdBy: 'user-1' },
      principal,
    );

    // The governed write succeeded and the model's merge landed on the branch.
    expect(result.ok).toBe(true);
    const compose = result.value!;
    const wt = compose.workspace.worktreePath!;
    expect(readFileSync(path.join(wt, 'shared.ts'), 'utf8')).toBe(VALID_MERGE);
    expect(execFileSync('git', ['-C', wt, 'status', '--porcelain'], { encoding: 'utf8' }).trim()).toBe('');

    // The assisted merge is recorded on the returned plan + the workspace provenance
    // (which the exportable evidence serializes) — never a hidden model-authored merge.
    expect(compose.plan.assisted).toEqual([{ path: 'shared.ts', inference_id: 'inf-1' }]);
    const conv = (registered.ws!.metadata as Record<string, unknown>).convergence as {
      selections: { path: string; mode: string; contributors?: string[] }[];
      assisted?: { path: string; inference_id?: string }[];
    };
    expect(conv.assisted).toEqual([{ path: 'shared.ts', inference_id: 'inf-1' }]);
    expect(conv.selections.find(s => s.path === 'shared.ts')).toMatchObject({
      mode: 'assisted',
      contributors: ['ws-a', 'ws-b'],
    });

    // The seam actually reached the ops: ONE call, addressed at the composition-owned
    // function name, carrying both contributor versions.
    expect(calls).toHaveLength(1);
    expect(calls[0].function_name).toBe('recoder_default');
    const prompt = calls[0].input.messages[0].content as string;
    expect(prompt).toContain('l3-from-A');
    expect(prompt).toContain('l3-from-B');
  });

  it('an ABSENT ctx.infer degrades truthfully to synthesize-conflict (nothing registered)', async () => {
    const registered: { ws?: Workspace } = {};
    const ctx = buildCtx(conflictingSiblings(), undefined, registered);
    const cc = new ConductorCompareConverge(ctx);

    const result = await cc.composeConvergence(
      { taskGroup: 'grp-1', selection: { 'shared.ts': ASSISTED_SELECTION }, createdBy: 'user-1' },
      principal,
    );

    // The gate ALLOWED (so this is not a governance deny) but the mechanical 3-way
    // could not merge and no inference was wired ⇒ the truthful 4xx unresolved.
    expect(result.ok).toBe(false);
    expect(result.code).toBe('unresolved');
    expect(result.value).toBeUndefined();
    // The partial convergence worktree was cleaned up and nothing was persisted.
    expect(registered.ws).toBeUndefined();
  });
});
