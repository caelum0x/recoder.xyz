/**
 * C3 regression gate — recodergit code-map fusion (conductor half).
 *
 * Locks the two conductor-domain invariants of the recodergit trio so a future
 * refactor cannot silently regress them:
 *
 *  (3) LAUNCH code-map (the NEW C1 wire, `enrichOpenfangCommand`):
 *      - `RECODER_CODE_GRAPH_ENABLED` OFF / not-indexed ⇒ `queryContext` returns a
 *        truthful `null` ⇒ the launched command is BYTE-IDENTICAL to a launch with
 *        NO code-intel seam at all (memory-only). This is the PolyForm gate: the
 *        code-graph is NEVER a hard dependency and NEVER fabricates a block.
 *      - ON + indexed ⇒ the rendered block is appended after the memory block.
 *      - FIRST launch of a never-indexed repo races the fire-and-forget index and
 *        truthfully gets `null` ⇒ memory-only (the honest timing degrade, NOT a bug).
 *
 *  (2) `reindexOnPush` freshness (SHIPPED Wave 4, `completion-hook.adapter.ts`):
 *      - the completion hook fires `codeIntel.reindexRepo(repoId)` on BOTH terminal
 *        outcomes (`completed` AND `failed`) — committed code can exist even on a
 *        failed run — keyed by the deterministic repoId.
 *
 * All IO is the in-memory conductor harness — no tmux, DB, engine, or network.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RunEvent, Workspace } from '@recoder/agent-os';
import type { SubstrateHandle, SubstrateLaunchInput } from '@recoder/substrate';
import type { ConductorBrainMemory } from './adapters/brain-memory.adapter.js';
import type { CodeIntelPort } from './ports/code-intel.port.js';
import { createCompletionHookSink } from './adapters/completion-hook.adapter.js';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makeLogger,
  makePrincipal,
} from './__fixtures__/harness.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** An `in_process` FakeSubstrate that records the exact command it is launched with. */
class RecordingInProcSubstrate extends FakeSubstrate {
  readonly commands: Array<string | undefined> = [];

  constructor() {
    super({ id: 'in_process' });
  }

  override async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
    this.commands.push(input.command);
    return super.launch(input);
  }
}

/** A brain that folds a fixed memory block over the incoming prompt. */
function makeBrain(memoryPrompt: string): ConductorBrainMemory {
  return {
    async enrichPrompt() {
      return { prompt: memoryPrompt, sources: [] };
    },
    async harvestOnCompletion() {
      return { harvested: false, reason: 'not exercised' };
    },
  };
}

/** A code-intel seam whose `queryContext` returns a fixed block (or a truthful null). */
function makeCodeIntel(block: string | null): CodeIntelPort {
  return {
    async indexRepo() {
      /* launch-time index is fire-and-forget, not exercised here */
    },
    async reindexRepo() {
      /* no-op */
    },
    async trackWork() {
      /* no-op */
    },
    async completeWork() {
      /* no-op */
    },
    async queryContext() {
      return block;
    },
  };
}

/** Launch an openfang workspace and return the command handed to the in-proc substrate. */
async function launchOpenfang(
  compose: Parameters<typeof composeConductor>[0],
  inProc: RecordingInProcSubstrate,
): Promise<string | undefined> {
  const { module } = composeConductor(compose);
  const result = await module.createWorkspace(
    makeCreateInput({
      projectId: 'project_1',
      repoPath: '/tmp/enrich-repo',
      runtimeId: 'openfang',
      substrate: undefined,
      prompt: 'refactor the AuthService.login handler',
    }),
    makePrincipal('user_ann'),
  );
  await flush();
  expect(result.ok).toBe(true);
  expect(inProc.commands).toHaveLength(1);
  return inProc.commands[0];
}

describe('C3 gate — recodergit launch code-map fusion (flag-off is byte-identical)', () => {
  it('flag-off / not-indexed (queryContext=null) ⇒ command is byte-identical to the no-seam baseline', async () => {
    // Baseline: NO code-intel seam at all (the pre-fusion memory-only launch).
    const baselineProc = new RecordingInProcSubstrate();
    const baseline = await launchOpenfang(
      {
        substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), baselineProc],
        brain: makeBrain('MEM'),
      },
      baselineProc,
    );

    // Flag-off / not-indexed: the seam IS wired but returns a truthful null.
    const flagOffProc = new RecordingInProcSubstrate();
    const flagOff = await launchOpenfang(
      {
        substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), flagOffProc],
        brain: makeBrain('MEM'),
        codeIntel: makeCodeIntel(null),
      },
      flagOffProc,
    );

    // PolyForm gate: no fabricated code-intel, no hard dependency — same bytes.
    expect(flagOff).toBe(baseline);
    expect(flagOff).toBe('MEM');
  });

  it('on + indexed ⇒ the rendered code block is appended after the memory block', async () => {
    const inProc = new RecordingInProcSubstrate();
    const command = await launchOpenfang(
      {
        substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), inProc],
        brain: makeBrain('MEM'),
        codeIntel: makeCodeIntel('CODEBLOCK'),
      },
      inProc,
    );
    expect(command).toBe('MEM\n\nCODEBLOCK');
  });

  it('first launch of a never-indexed repo races the index ⇒ null ⇒ memory-only (honest timing degrade)', async () => {
    // The index is fire-and-forget AFTER enrichment, so the first query truthfully
    // finds nothing — represented here by a null-returning queryContext.
    const inProc = new RecordingInProcSubstrate();
    const command = await launchOpenfang(
      {
        substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), inProc],
        brain: makeBrain('MEM'),
        codeIntel: makeCodeIntel(null),
      },
      inProc,
    );
    expect(command).toBe('MEM');
  });
});

function ws(over: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_1',
    spaceId: 'space_1',
    projectId: 'project_1',
    taskId: 'task_1',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/ws_1',
    baseRef: 'HEAD',
    state: 'running',
    createdBy: 'user_alice',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {},
    ...over,
  } as Workspace;
}

function event(type: RunEvent['type']): RunEvent {
  return {
    eventId: `evt_${type}`,
    type,
    taskId: 'task_1',
    runId: 'run_ws_1',
    createdAt: new Date().toISOString(),
    data: { workspaceId: 'ws_1' },
  } as RunEvent;
}

describe('C3 gate — recodergit reindexOnPush fires on BOTH terminal outcomes (SHIPPED Wave 4)', () => {
  it.each(['completed', 'failed'] as const)(
    'reindexes the code-graph on a %s run, keyed by the deterministic repoId',
    async (outcome) => {
      const reindexRepo = vi.fn(async () => {});
      const sink = createCompletionHookSink({
        inner: { append: vi.fn(async () => {}) },
        codeIntel: {
          indexRepo: vi.fn(async () => {}),
          reindexRepo,
          trackWork: vi.fn(async () => {}),
          completeWork: vi.fn(async () => {}),
        },
        getWorkspace: async () => ws(),
        logger: makeLogger(),
      });

      await sink.append(event(outcome));
      await flush();

      expect(reindexRepo).toHaveBeenCalledTimes(1);
      expect(reindexRepo).toHaveBeenCalledWith('project_1');
    },
  );

  it('does NOT reindex on a non-terminal event (no push happened yet)', async () => {
    const reindexRepo = vi.fn(async () => {});
    const sink = createCompletionHookSink({
      inner: { append: vi.fn(async () => {}) },
      codeIntel: {
        indexRepo: vi.fn(async () => {}),
        reindexRepo,
        trackWork: vi.fn(async () => {}),
        completeWork: vi.fn(async () => {}),
      },
      getWorkspace: async () => ws(),
      logger: makeLogger(),
    });

    await sink.append(event('log'));
    await flush();

    expect(reindexRepo).not.toHaveBeenCalled();
  });
});
