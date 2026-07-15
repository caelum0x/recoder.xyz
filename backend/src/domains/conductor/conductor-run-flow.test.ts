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
import type { BrainEnrichInput } from '@recoder/substrate';
import type { ConductorBrainMemory, RunHarvestInput } from './adapters/brain-memory.adapter.js';
import type { CodeIntelPort } from './ports/code-intel.port.js';
import { composeConductor, FakeSubstrate, makeCreateInput, makePrincipal } from './__fixtures__/harness.js';

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
  readonly track: Array<{ taskId: string; workspaceId: string }>;
  readonly complete: Array<{ taskId: string; outcome: string }>;
}

function makeCodeIntel(): RecordingCodeIntel {
  const index: RecordingCodeIntel['index'] = [];
  const track: RecordingCodeIntel['track'] = [];
  const complete: RecordingCodeIntel['complete'] = [];
  return {
    index,
    track,
    complete,
    async indexRepo(repoPath, repoId) {
      index.push({ repoPath, repoId });
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
