/**
 * Conductor LAUNCH code-map fusion (recodergit → openfang prompt). On the native
 * openfang path the backend enriches the turn `command` with TWO capability blocks:
 * memory recall (unchanged), then the recodergit code-knowledge-graph context
 * (`codeIntel.queryContext`) appended AFTER the memory block. Proves — with the
 * in-memory harness + a recording in-process substrate that captures the exact
 * launched command:
 *  - the code-map block is APPENDED after the memory block (`MEM\n\n<block>`), and
 *    `queryContext` is called with the SAME deterministic repoId `startCodeIntel`
 *    indexes under + the prompt-derived seed terms,
 *  - degrade-truthful: a `null` return (disabled / not-indexed / no seed match)
 *    leaves the prompt memory-only,
 *  - no `repoPath` ⇒ `queryContext` is NOT called (no index was ever built),
 *  - degrade-safe: a `queryContext` throw is caught + skipped, never crashing launch,
 *  - probe-guarded: an older impl without `queryContext` is skipped truthfully,
 *  - no brain + a block ⇒ the code-map appends onto the RAW prompt.
 */
import { describe, it, expect } from 'vitest';
import type { SubstrateHandle, SubstrateLaunchInput } from '@recoder/substrate';
import type { ConductorBrainMemory } from './adapters/brain-memory.adapter.js';
import { deriveSeedTerms } from './adapters/code-intel.adapter.js';
import type { CodeIntelPort } from './ports/code-intel.port.js';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from './__fixtures__/harness.js';

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

interface QueryCall {
  readonly repoId: string;
  readonly seedTerms: string[];
}

/** A code-intel seam whose `queryContext` behavior is configurable per test. */
function makeCodeIntel(
  opts: {
    block?: string | null;
    throwOnQuery?: boolean;
    omitQueryContext?: boolean;
  } = {},
): CodeIntelPort & { readonly queries: QueryCall[] } {
  const queries: QueryCall[] = [];
  const base: CodeIntelPort & { readonly queries: QueryCall[] } = {
    queries,
    async indexRepo() {
      /* no-op: launch-time index is fire-and-forget, not exercised here */
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
    async queryContext(repoId, seedTerms) {
      queries.push({ repoId, seedTerms });
      if (opts.throwOnQuery) throw new Error('recodergit query-context down');
      return opts.block ?? null;
    },
  };
  if (opts.omitQueryContext) {
    // Older implementors omit the OPTIONAL port method entirely.
    delete (base as { queryContext?: unknown }).queryContext;
  }
  return base;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Launch an openfang workspace and return the command handed to the in-proc substrate. */
async function launchOpenfang(
  compose: Parameters<typeof composeConductor>[0],
  inProc: RecordingInProcSubstrate,
  inputOverrides: Record<string, unknown> = {},
): Promise<string | undefined> {
  const { module } = composeConductor(compose);
  const result = await module.createWorkspace(
    makeCreateInput({
      projectId: 'project_1',
      repoPath: '/tmp/enrich-repo',
      runtimeId: 'openfang',
      substrate: undefined,
      prompt: 'refactor the AuthService.login handler',
      ...inputOverrides,
    }),
    makePrincipal('user_ann'),
  );
  await flush();
  expect(result.ok).toBe(true);
  expect(inProc.commands).toHaveLength(1);
  return inProc.commands[0];
}

describe('conductor launch folds the recodergit code-map into the openfang prompt', () => {
  it('appends the code-map block AFTER the memory block (MEM\\n\\n<block>)', async () => {
    const inProc = new RecordingInProcSubstrate();
    const codeIntel = makeCodeIntel({ block: 'CODEBLOCK' });
    const command = await launchOpenfang(
      {
        substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), inProc],
        brain: makeBrain('MEM'),
        codeIntel,
      },
      inProc,
    );

    expect(command).toBe('MEM\n\nCODEBLOCK');
    // queryContext saw the SAME deterministic repoId `startCodeIntel` indexes under
    // canonical repository identity ('project_1' for this non-remote fixture) + seeds.
    expect(codeIntel.queries).toHaveLength(1);
    expect(codeIntel.queries[0]!.repoId).toBe('project_1');
    expect(codeIntel.queries[0]!.seedTerms).toEqual(
      deriveSeedTerms('refactor the AuthService.login handler'),
    );
    // Sanity: the seeds carried real code-ish tokens from the prompt.
    expect(codeIntel.queries[0]!.seedTerms).toContain('AuthService.login');
  });

  it('degrade-truthful: a null queryContext leaves the prompt memory-only', async () => {
    const inProc = new RecordingInProcSubstrate();
    const codeIntel = makeCodeIntel({ block: null });
    const command = await launchOpenfang(
      {
        substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), inProc],
        brain: makeBrain('MEM'),
        codeIntel,
      },
      inProc,
    );

    expect(command).toBe('MEM');
    // It WAS probed + called — the engine simply returned a truthful null.
    expect(codeIntel.queries).toHaveLength(1);
  });

  it('no repoPath ⇒ queryContext is NOT called (no index was ever built)', async () => {
    const inProc = new RecordingInProcSubstrate();
    const codeIntel = makeCodeIntel({ block: 'CODEBLOCK' });
    const command = await launchOpenfang(
      {
        substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), inProc],
        brain: makeBrain('MEM'),
        codeIntel,
      },
      inProc,
      { repoPath: undefined },
    );

    expect(command).toBe('MEM');
    expect(codeIntel.queries).toHaveLength(0);
  });

  it('degrade-safe: a queryContext throw is caught and the launch proceeds memory-only', async () => {
    const inProc = new RecordingInProcSubstrate();
    const codeIntel = makeCodeIntel({ throwOnQuery: true });
    const command = await launchOpenfang(
      {
        substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), inProc],
        brain: makeBrain('MEM'),
        codeIntel,
      },
      inProc,
    );

    expect(command).toBe('MEM');
    expect(codeIntel.queries).toHaveLength(1);
  });

  it('probe-guarded: an older impl without queryContext is skipped truthfully', async () => {
    const inProc = new RecordingInProcSubstrate();
    const codeIntel = makeCodeIntel({ omitQueryContext: true });
    const command = await launchOpenfang(
      {
        substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), inProc],
        brain: makeBrain('MEM'),
        codeIntel,
      },
      inProc,
    );

    expect(command).toBe('MEM');
    expect(codeIntel.queries).toHaveLength(0);
  });

  it('no brain + a block ⇒ the code-map appends onto the RAW prompt', async () => {
    const inProc = new RecordingInProcSubstrate();
    const codeIntel = makeCodeIntel({ block: 'CODEBLOCK' });
    const command = await launchOpenfang(
      {
        substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), inProc],
        codeIntel,
      },
      inProc,
    );

    expect(command).toBe('refactor the AuthService.login handler\n\nCODEBLOCK');
    expect(codeIntel.queries).toHaveLength(1);
  });

  it('a memory-only prompt with no codey tokens still calls queryContext with empty seeds', async () => {
    const inProc = new RecordingInProcSubstrate();
    const codeIntel = makeCodeIntel({ block: null });
    await launchOpenfang(
      {
        substrates: [new FakeSubstrate({ id: 'tmux_worktree' }), inProc],
        brain: makeBrain('MEM'),
        codeIntel,
      },
      inProc,
      { prompt: 'do the job' },
    );

    // deriveSeedTerms('do the job') === [] — the engine truthfully returns null.
    expect(codeIntel.queries).toHaveLength(1);
    expect(codeIntel.queries[0]!.seedTerms).toEqual([]);
  });
});
