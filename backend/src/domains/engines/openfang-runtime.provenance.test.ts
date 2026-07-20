/**
 * launchOpenfangRun — manifest-provenance governance gate (openfang-manifest-workflow
 * fusion). Proves the fusion FIRES:
 *  - a signed manifest is verified via the engine's `verifySignedManifest` and the
 *    distilled provenance rides into `governance.decide` BEFORE `spawnAgent`,
 *  - a `deny` decision BLOCKS the spawn (no `spawnAgent` call), emits a truthful
 *    `failed` RunEvent, and returns `{ available:true, ok:false }`,
 *  - an `allow` decision lets the spawn proceed to a completed turn,
 *  - no governance gate wired ⇒ the gate is SKIPPED (spawn proceeds) — degrade-truthful,
 *  - a reused-by-name agent is NOT re-gated (already gated at its own spawn).
 */
import { describe, it, expect, vi } from 'vitest';
import type { OpenfangEngineInstance } from './openfang-native.js';
import {
  launchOpenfangRun,
  type OpenfangProvenanceGate,
  type OpenfangProvenanceRequest,
  type OpenfangRunEventSink,
} from './openfang-runtime.js';
import type { RunEvent } from '@recoder/agent-os';

/** A stub engine: every method returns `{ok:true}` unless overridden. */
function stubEngine(
  overrides: Partial<Record<keyof OpenfangEngineInstance, unknown>> = {},
): OpenfangEngineInstance {
  const jsonOk = (): string => JSON.stringify({ ok: true });
  const base: Record<string, (...args: unknown[]) => string> = {
    // No existing agents ⇒ reuse lookup misses ⇒ the spawn path (and gate) run.
    listAgents: () => JSON.stringify({ ok: true, agents: [] }),
    spawnAgent: () => JSON.stringify({ ok: true, agent_id: 'agent_1' }),
    runAgent: () => JSON.stringify({ ok: true, response: 'hello', iterations: 1 }),
    verifySignedManifest: () =>
      JSON.stringify({ ok: true, manifest: { name: 'signed', signer: 'key-1' } }),
  };
  return new Proxy({ ...base, ...(overrides as Record<string, unknown>) } as OpenfangEngineInstance, {
    get(target, prop: string) {
      return (target as Record<string, unknown>)[prop] ?? jsonOk;
    },
  });
}

function collectingSink(): { sink: OpenfangRunEventSink; events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { sink: { append: (e) => void events.push(e) }, events };
}

const INPUT = {
  workspaceId: 'ws1',
  taskId: 't1',
  runId: 'run_ws1',
  prompt: 'go',
  agentName: 'fusion-agent',
};

describe('launchOpenfangRun — manifest provenance gate', () => {
  it('verifies the signed manifest and DENY blocks the spawn (truthful failed)', async () => {
    const spawnAgent = vi.fn(() => JSON.stringify({ ok: true, agent_id: 'agent_1' }));
    const verifySignedManifest = vi.fn(
      () => JSON.stringify({ ok: true, manifest: { name: 'signed', signer: 'key-1' } }),
    );
    const engine = stubEngine({ spawnAgent, verifySignedManifest });

    const seen: OpenfangProvenanceRequest[] = [];
    const governance: OpenfangProvenanceGate = {
      decide: async (req) => {
        seen.push(req);
        return { allow: false, reason: 'untrusted signer' };
      },
    };
    const { sink, events } = collectingSink();

    const result = await launchOpenfangRun(
      { ...INPUT, signedManifestJson: '{"manifest":{},"sig":"abc"}' },
      { engine: () => engine, sink, governance },
    );

    // The gate FIRED with verified provenance, and blocked the spawn.
    expect(verifySignedManifest).toHaveBeenCalledWith('{"manifest":{},"sig":"abc"}');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      action: 'agent.spawn',
      agentName: 'fusion-agent',
      provenance: { signed: true, verified: true, signer: 'key-1' },
    });
    expect(spawnAgent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ available: true, ok: false });
    if (result.available && !result.ok) expect(result.error).toMatch(/provenance denied/);

    const failed = events.find((e) => e.type === 'failed');
    expect(failed).toBeDefined();
    expect(failed?.data).toMatchObject({ verified: true, signer: 'key-1' });
    // Never a completed event when the gate denies.
    expect(events.some((e) => e.type === 'completed')).toBe(false);
  });

  it('ALLOW lets the spawn proceed to a completed turn', async () => {
    const spawnAgent = vi.fn(() => JSON.stringify({ ok: true, agent_id: 'agent_1' }));
    const engine = stubEngine({ spawnAgent });
    const governance: OpenfangProvenanceGate = {
      decide: async () => ({ allow: true, reason: 'trusted' }),
    };
    const { sink, events } = collectingSink();

    const result = await launchOpenfangRun(
      { ...INPUT, signedManifestJson: '{"sig":"ok"}' },
      { engine: () => engine, sink, governance },
    );

    expect(spawnAgent).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ available: true, ok: true, response: 'hello' });
    expect(events.some((e) => e.type === 'completed')).toBe(true);
  });

  it('SKIPS the gate when no governance is wired (spawn proceeds — degrade-truthful)', async () => {
    const spawnAgent = vi.fn(() => JSON.stringify({ ok: true, agent_id: 'agent_1' }));
    const engine = stubEngine({ spawnAgent });
    const { sink, events } = collectingSink();

    const result = await launchOpenfangRun(INPUT, { engine: () => engine, sink });

    expect(spawnAgent).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ available: true, ok: true });
    expect(events.some((e) => e.type === 'completed')).toBe(true);
  });

  it('does NOT re-gate a reused-by-name agent (already gated at its own spawn)', async () => {
    const spawnAgent = vi.fn(() => JSON.stringify({ ok: true, agent_id: 'agent_new' }));
    const engine = stubEngine({
      // Reuse lookup HITS: an agent with the same name already exists.
      listAgents: () =>
        JSON.stringify({ ok: true, agents: [{ id: 'agent_existing', name: 'fusion-agent' }] }),
      spawnAgent,
    });
    const decide = vi.fn(async () => ({ allow: false, reason: 'should not be consulted' }));
    const governance: OpenfangProvenanceGate = { decide };

    const result = await launchOpenfangRun(
      { ...INPUT, signedManifestJson: '{"sig":"x"}' },
      { engine: () => engine, governance },
    );

    expect(decide).not.toHaveBeenCalled();
    expect(spawnAgent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ available: true, ok: true, agentId: 'agent_existing' });
  });

  it('a gate that THROWS folds into a deny-biased failed (never a fabricated allow)', async () => {
    const spawnAgent = vi.fn(() => JSON.stringify({ ok: true, agent_id: 'agent_1' }));
    const engine = stubEngine({ spawnAgent });
    const governance: OpenfangProvenanceGate = {
      decide: async () => {
        throw new Error('kernel unreachable');
      },
    };

    const result = await launchOpenfangRun(
      { ...INPUT, signedManifestJson: '{"sig":"x"}' },
      { engine: () => engine, governance },
    );

    expect(spawnAgent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ available: true, ok: false });
    if (result.available && !result.ok) expect(result.error).toMatch(/provenance denied/);
  });
});
