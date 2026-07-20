/**
 * Conductor run flow USES the engine capabilities — the backend (not the agent)
 * calls memory, governance, and code-intel in order as a user creates a workspace
 * and runs an agent. Proves, with in-memory fakes:
 *  - (c) memory RECALL enriches the prompt on launch,
 *  - governance GATE decides `workspace.create` before the write,
 *  - (a) recodergit INDEX + (b) beads TRACK fire on create (fire-and-forget),
 *  - the runtimeId→substrate selector routes CLI → tmux_worktree, openfang → in_process,
 *  - path (b) enriches the prompt and hands it to the in-process substrate as the turn.
 */
import { describe, it, expect } from 'vitest';
import type { RunEvent, Workspace } from '@recoder/agent-os';
import type { BrainEnrichInput } from '@recoder/substrate';
import type { ConductorBrainMemory, RunHarvestInput } from './adapters/brain-memory.adapter.js';
import type { CodeIntelPort } from './ports/code-intel.port.js';
import { createConductorCodeIntel } from './adapters/code-intel.adapter.js';
import { createCompletionHookSink } from './adapters/completion-hook.adapter.js';
import type { IssueGraphWriter } from './adapters/issue-graph.adapter.js';
import { composeConductor, FakeSubstrate, makeCreateInput, makeLogger, makePrincipal } from './__fixtures__/harness.js';

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
      return {
        prompt: `## Recalled context\n- [mem0] prior run\n\n${input.prompt}`,
        sources: [{ source: 'mem0', ref: 'mem_1' }],
      };
    },
    async harvestOnCompletion(input) {
      harvestCalls.push(input);
      return { harvested: true };
    },
  };
}

interface RecordingCodeIntel extends CodeIntelPort {
  readonly index: Array<{ repoPath: string; repoId: string }>;
  readonly reindex: Array<{ repoId: string }>;
  readonly track: Array<{ taskId: string; workspaceId: string }>;
  readonly complete: Array<{ taskId: string; outcome: string }>;
}

function makeCodeIntel(): RecordingCodeIntel {
  const index: RecordingCodeIntel['index'] = [];
  const reindex: RecordingCodeIntel['reindex'] = [];
  const track: RecordingCodeIntel['track'] = [];
  const complete: RecordingCodeIntel['complete'] = [];
  return {
    index,
    reindex,
    track,
    complete,
    async indexRepo(repoPath, repoId) {
      index.push({ repoPath, repoId });
    },
    async reindexRepo(repoId) {
      reindex.push({ repoId });
    },
    async trackWork(taskId, workspaceId) {
      track.push({ taskId, workspaceId });
    },
    async completeWork(taskId, outcome) {
      complete.push({ taskId, outcome });
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('conductor run flow uses engines', () => {
  it('CLI path: recalls memory (enrich) + gates the write + indexes repo + tracks work', async () => {
    const brain = makeBrain();
    const codeIntel = makeCodeIntel();
    const { module, gate } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      brain,
      codeIntel,
    });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal('user_alice'));
    await flush();

    expect(result.ok).toBe(true);
    // (c) recall — the engine enriched the CLI prompt via the injected brain.
    expect(brain.enrichCalls).toHaveLength(1);
    expect(brain.enrichCalls[0]!.userId).toBe('user_alice');
    // governance gate decided BEFORE the write, and audited AFTER.
    expect(gate.decisions).toContain('workspace.create');
    expect(gate.audits.find((a) => a.action === 'workspace.create')).toBeDefined();
    // (a) recodergit index on create, keyed by a deterministic repoId.
    expect(codeIntel.index).toHaveLength(1);
    expect(codeIntel.index[0]!.repoPath).toBe('/tmp/fake-repo');
    expect(codeIntel.index[0]!.repoId).toBe('project_1');
    // (b) beads track on create, anchored to the workspace.
    expect(codeIntel.track).toHaveLength(1);
    expect(codeIntel.track[0]!.taskId).toBe('task_1');
    expect(codeIntel.track[0]!.workspaceId).toBe(result.value!.workspaceId);
  });

  it('openfang path: selects the in_process substrate and enriches the prompt as the turn command', async () => {
    const brain = makeBrain();
    const { module } = composeConductor({
      substrates: [
        new FakeSubstrate({ id: 'tmux_worktree' }),
        new FakeSubstrate({ id: 'in_process' }),
      ],
      brain,
    });

    const result = await module.createWorkspace(
      makeCreateInput({ runtimeId: 'openfang', substrate: undefined }),
      makePrincipal('user_bob'),
    );

    expect(result.ok).toBe(true);
    // Routed to the native in-process substrate (not tmux).
    expect(result.value!.substrate).toBe('in_process');
    // The composer enriched the prompt for path (b) (recall on launch).
    expect(brain.enrichCalls).toHaveLength(1);
    expect(brain.enrichCalls[0]!.userId).toBe('user_bob');
  });

  it('CLI path routes to tmux_worktree even without an explicit substrate', async () => {
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
    });

    const result = await module.createWorkspace(
      makeCreateInput({ substrate: undefined }),
      makePrincipal(),
    );

    expect(result.ok).toBe(true);
    expect(result.value!.substrate).toBe('tmux_worktree');
  });

  it('degrade-safe: a code-intel index throw never blocks the launch', async () => {
    const codeIntel = makeCodeIntel();
    codeIntel.indexRepo = async () => {
      throw new Error('recodergit down');
    };
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      codeIntel,
    });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());
    await flush();
    // The workspace still launched — the engine capability degraded, not the run.
    expect(result.ok).toBe(true);
  });
});

/**
 * The conductor consumes the beads MODULE, not the engine: the fake below is
 * shaped exactly like the bootstrap seam (`memory.issueGraph()` sliced to the
 * conductor's {@link IssueGraphWriter}) and observes the real run-flow writes.
 */
interface WriterCall {
  readonly verb: 'note' | 'update' | 'close';
  readonly id: string;
  readonly actor: string;
  readonly text?: string;
  readonly patch?: { status?: string };
}

function makeIssueGraphWriter(result = true): { writer: IssueGraphWriter; calls: WriterCall[] } {
  const calls: WriterCall[] = [];
  return {
    calls,
    writer: {
      async note(id, text, actor) {
        calls.push({ verb: 'note', id, text, actor });
        return result;
      },
      async update(id, patch, actor) {
        calls.push({ verb: 'update', id, patch, actor });
        return result;
      },
      async close(id, _reason, actor) {
        calls.push({ verb: 'close', id, actor });
        return result;
      },
    },
  };
}

describe('conductor consumes the issue-graph module facet (IssueGraphWriter seam)', () => {
  it('launch: notes the claim evidence then marks in_progress through the module slice', async () => {
    const { writer, calls } = makeIssueGraphWriter();
    // The REAL bootstrap composition: the code-intel adapter over the module
    // slice (recodergit absent ⇒ index is a truthful skip; tracking still fires).
    const codeIntel = createConductorCodeIntel({ recodergit: null, beads: writer, logger: makeLogger() });
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      codeIntel,
    });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());
    await flush();

    expect(result.ok).toBe(true);
    const workspaceId = result.value!.workspaceId;
    // note (claim evidence) → update (in_progress), attributed to this workspace.
    expect(calls.map((c) => c.verb)).toEqual(['note', 'update']);
    expect(calls[0]).toMatchObject({
      id: 'task_1',
      text: expect.stringContaining(workspaceId),
      actor: `conductor:${workspaceId}`,
    });
    expect(calls[1]).toMatchObject({
      id: 'task_1',
      patch: { status: 'in_progress' },
      actor: `conductor:${workspaceId}`,
    });
  });

  it('completion: notes the terminal outcome then closes the issue through the module slice', async () => {
    const { writer, calls } = makeIssueGraphWriter();
    const codeIntel = createConductorCodeIntel({ recodergit: null, beads: writer, logger: makeLogger() });
    // The SAME decorator conductor-module composes around its RunEvent sink.
    const sink = createCompletionHookSink({
      inner: { append: async () => {} },
      codeIntel,
      getWorkspace: async () =>
        ({
          workspaceId: 'ws_1',
          projectId: 'project_1',
          taskId: 'task_1',
          createdBy: 'user_alice',
        }) as unknown as Workspace,
      logger: makeLogger(),
    });

    await sink.append({
      eventId: 'evt_completed',
      type: 'completed',
      taskId: 'task_1',
      runId: 'run_ws_1',
      createdAt: new Date().toISOString(),
      data: { workspaceId: 'ws_1' },
    } as RunEvent);
    await flush();

    // note (run outcome) → close (success), attributed to the conductor subsystem.
    expect(calls.map((c) => c.verb)).toEqual(['note', 'close']);
    expect(calls[0]).toMatchObject({
      id: 'task_1',
      text: 'Recoder workspace run completed',
      actor: 'conductor',
    });
    expect(calls[1]).toMatchObject({ id: 'task_1', actor: 'conductor' });
  });

  it('degrade-safe: a throwing issue-graph slice never blocks the launch', async () => {
    const writer: IssueGraphWriter = {
      note: async () => {
        throw new Error('issue graph down');
      },
      update: async () => {
        throw new Error('issue graph down');
      },
      close: async () => true,
    };
    const codeIntel = createConductorCodeIntel({ recodergit: null, beads: writer, logger: makeLogger() });
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      codeIntel,
    });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());
    await flush();
    // The workspace still launched — the capability degraded, not the run.
    expect(result.ok).toBe(true);
  });
});
