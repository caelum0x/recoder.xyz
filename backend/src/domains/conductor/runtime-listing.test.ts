/**
 * Runtime-selection surface (`GET /runtimes` backing logic).
 *
 * Proves: the listing merges the PATH-probed CLI runtimes with the native
 * in-process openfang runtime; openfang availability is the REAL substrate
 * probe (wired + engine up ⇒ available; unwired or engine-down ⇒ a truthful
 * `available:false` WITH the reason — never hidden, never faked); and the
 * module surface exposes the same listing so a workspace can choose
 * `runtimeId: 'openfang'` exactly when the injected env made the engine real.
 */
import { describe, it, expect } from 'vitest';
import type { RuntimeAvailability } from '@recoder/substrate';
import { listConductorRuntimes } from './adapters/runtime-listing.adapter.js';
import { createConductorRegistry } from './adapters/substrate-registry.adapter.js';
import { sliceConductorConfig } from './config.js';
import { makeConfig, FakeSubstrate } from './__fixtures__/harness.js';

const cfg = () => sliceConductorConfig(makeConfig());

const probeCli = async (): Promise<readonly RuntimeAvailability[]> => [
  {
    runtimeId: 'claude_code',
    bin: 'claude',
    available: true,
    path: '/usr/local/bin/claude',
  },
  { runtimeId: 'codex', bin: 'codex', available: false },
  {
    runtimeId: 'opencode',
    bin: 'opencode',
    available: true,
    path: '/usr/local/bin/opencode',
  },
  {
    runtimeId: 'cursor',
    bin: 'cursor-agent',
    available: false,
    reason:
      "'cursor-agent' not found on PATH — only the Cursor editor ('cursor' at /usr/local/bin/cursor) is installed, which is attach-only and not launchable as a terminal agent",
  },
];

describe('conductor runtime listing (selection surface)', () => {
  it('merges CLI probe results with the in-process openfang runtime', async () => {
    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [new FakeSubstrate({ id: 'in_process' })],
    });

    const runtimes = await listConductorRuntimes({ registry, probeCli });

    expect(runtimes.map(r => r.runtimeId)).toEqual([
      'claude_code',
      'codex',
      'opencode',
      'cursor',
      'openfang',
    ]);
    const claude = runtimes.find(r => r.runtimeId === 'claude_code');
    expect(claude).toMatchObject({
      kind: 'cli',
      available: true,
      path: '/usr/local/bin/claude',
    });
    const codex = runtimes.find(r => r.runtimeId === 'codex');
    expect(codex).toMatchObject({ kind: 'cli', available: false });
  });

  it('lists opencode as a real launchable CLI runtime with its probed path', async () => {
    const registry = createConductorRegistry({ config: cfg() });

    const runtimes = await listConductorRuntimes({ registry, probeCli });
    const opencode = runtimes.find(r => r.runtimeId === 'opencode');

    expect(opencode).toMatchObject({
      kind: 'cli',
      bin: 'opencode',
      available: true,
      path: '/usr/local/bin/opencode',
    });
    expect(opencode?.reason).toBeUndefined();
  });

  it('surfaces the probe reason verbatim for cursor when only the attach-only editor is installed', async () => {
    const registry = createConductorRegistry({ config: cfg() });

    const runtimes = await listConductorRuntimes({ registry, probeCli });
    const cursor = runtimes.find(r => r.runtimeId === 'cursor');

    expect(cursor).toMatchObject({
      kind: 'cli',
      bin: 'cursor-agent',
      available: false,
    });
    expect(cursor?.path).toBeUndefined();
    expect(cursor?.reason).toMatch(/attach-only/);
    expect(cursor?.reason).toMatch(/cursor-agent/);
  });

  it('reports an absent CLI binary truthfully (available:false + reason, no path)', async () => {
    const registry = createConductorRegistry({ config: cfg() });
    const absentProbe = async (): Promise<readonly RuntimeAvailability[]> => [
      {
        runtimeId: 'opencode',
        bin: 'opencode',
        available: false,
        reason: "'opencode' not found on PATH",
      },
    ];

    const runtimes = await listConductorRuntimes({
      registry,
      probeCli: absentProbe,
    });
    const opencode = runtimes.find(r => r.runtimeId === 'opencode');

    expect(opencode).toMatchObject({ kind: 'cli', available: false });
    expect(opencode?.path).toBeUndefined();
    expect(opencode?.reason).toBe("'opencode' not found on PATH");
  });

  it('reports openfang available when the in_process substrate is wired and its engine is up', async () => {
    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [new FakeSubstrate({ id: 'in_process', available: true })],
    });

    const runtimes = await listConductorRuntimes({ registry, probeCli });
    const openfang = runtimes.find(r => r.runtimeId === 'openfang');

    expect(openfang).toEqual({
      runtimeId: 'openfang',
      kind: 'in_process',
      available: true,
    });
  });

  it('reports openfang unavailable WITH the engine reason when the substrate probe says down', async () => {
    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [
        new FakeSubstrate({
          id: 'in_process',
          available: false,
          unavailableReason:
            'openfang native engine unavailable — addon not built',
        }),
      ],
    });

    const runtimes = await listConductorRuntimes({ registry, probeCli });
    const openfang = runtimes.find(r => r.runtimeId === 'openfang');

    expect(openfang?.available).toBe(false);
    expect(openfang?.reason).toMatch(/addon not built/);
  });

  it('reports openfang unavailable with a truthful reason when in_process is not wired at all', async () => {
    const registry = createConductorRegistry({ config: cfg() });

    const runtimes = await listConductorRuntimes({ registry, probeCli });
    const openfang = runtimes.find(r => r.runtimeId === 'openfang');

    expect(openfang?.available).toBe(false);
    expect(openfang?.reason).toMatch(/not wired/);
  });

  it('degrades a THROWING substrate probe into available:false + the error text (never fakes up)', async () => {
    const boom = new FakeSubstrate({ id: 'in_process' });
    boom.available = async () => {
      throw new Error('engine probe exploded');
    };
    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [boom],
    });

    const runtimes = await listConductorRuntimes({ registry, probeCli });
    const openfang = runtimes.find(r => r.runtimeId === 'openfang');

    expect(openfang?.available).toBe(false);
    expect(openfang?.reason).toMatch(/engine probe exploded/);
  });
});
