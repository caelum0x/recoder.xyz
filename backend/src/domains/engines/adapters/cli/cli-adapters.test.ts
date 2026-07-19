/**
 * Degrade-safe contract tests for the CLI engine adapters + the `runCli`
 * primitive. Every adapter must, with its binary/engine ABSENT: report a truthful
 * `down` health (never faked `up`) and return `{ ok:false, reason }` from
 * `invoke` (never throw across the seam, never fabricate). The bounded `runCli`
 * primitive must resolve (never reject) on both success and a missing binary.
 */
import { describe, it, expect } from 'vitest';
import type { Logger } from '../../../../shared/logger.js';
import { enginesConfigSchema, type EnginesConfig } from '../../config.js';
import { runCli } from './cli-exec.js';
import { BeadsAdapter } from './beads.adapter.js';
import { TmuxAdapter } from './tmux.adapter.js';
import { DmuxAdapter } from './dmux.adapter.js';
import { RecodergitAdapter } from './recodergit.adapter.js';

const log = { warn() {}, info() {}, debug() {}, error() {}, child: () => log } as unknown as Logger;

function config(overrides: Partial<EnginesConfig> = {}): EnginesConfig {
  return enginesConfigSchema.parse({
    isProduction: false,
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    repoRoot: null,
    palRootDir: null,
    napiPaths: { openfang: null, tensorzero: null, governance: null },
    daemonBins: { colbert: null, 'ops-recorder': null, multica: null, ziti: null, 'tensorzero-loopback': null },
    externalUrls: {
      colbert: null,
      'ops-recorder': null,
      multica: null,
      ziti: null,
      'tensorzero-loopback': null,
      mem0: null,
      'browser-use': null,
    },
    sidecarPython: { mem0: null, 'browser-use': null, 'pal-mcp': null },
    enabled: {},
    napiFirst: true,
    ...overrides,
  });
}

describe('runCli (bounded, degrade-safe primitive)', () => {
  it('resolves ok:true with stdout on a clean exit', async () => {
    const result = await runCli(process.execPath, ['-e', 'process.stdout.write("hi")']);
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('hi');
  });

  it('resolves ok:false (never rejects) when the binary is missing', async () => {
    const result = await runCli('definitely-not-a-real-binary-xyz', ['--help']);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('enforces the timeout deadline and reports timedOut', async () => {
    const result = await runCli(process.execPath, ['-e', 'setTimeout(()=>{}, 5000)'], { timeoutMs: 150 });
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
  });
});

describe('BeadsAdapter', () => {
  it('reports down + fails invoke when bd is unresolvable', async () => {
    const adapter = new BeadsAdapter({ config: config(), log, resolveBin: () => undefined });
    const health = await adapter.health();
    expect(health.status).toBe('down');
    expect(health.reason).toContain('bd');
    const res = await adapter.invoke({ op: 'ready', input: {} });
    expect(res.ok).toBe(false);
  });

  it('degrades truthfully when disabled by config', async () => {
    const adapter = new BeadsAdapter({ config: config({ enabled: { beads: false } }), log, resolveBin: () => '/bin/bd' });
    expect((await adapter.health()).status).toBe('down');
    const res = await adapter.invoke({ op: 'ready', input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('disabled');
  });

  it('rejects a bad op with a truthful reason (no throw)', async () => {
    const adapter = new BeadsAdapter({ config: config(), log, resolveBin: () => process.execPath });
    const res = await adapter.invoke({ op: 'create', input: {} }); // missing title
    expect(res.ok).toBe(false);
  });

  it('rejects the new graph ops with missing/invalid args (bad_input, no throw)', async () => {
    const adapter = new BeadsAdapter({ config: config(), log, resolveBin: () => process.execPath });
    // graph/deps require an id
    const noId = await adapter.invoke({ op: 'graph', input: {} });
    expect(noId.ok).toBe(false);
    if (!noId.ok) expect(noId.code).toBe('bad_input');
    // an unknown dep-tree direction is bad input, not a silent default
    const badDir = await adapter.invoke({ op: 'graph', input: { id: 'rc-1', direction: 'sideways' } });
    expect(badDir.ok).toBe(false);
    // an unknown stats group attribute is bad input
    const badGroup = await adapter.invoke({ op: 'stats', input: { groupBy: 'phase' } });
    expect(badGroup.ok).toBe(false);
    if (!badGroup.ok) expect(badGroup.code).toBe('bad_input');
  });
});

describe('TmuxAdapter', () => {
  it('reports down when the tmux binary does not run', async () => {
    const adapter = new TmuxAdapter({ config: config(), log, bin: '/nonexistent/tmux-xyz' });
    const health = await adapter.health();
    expect(health.status).toBe('down');
    const res = await adapter.invoke({ op: 'list-sessions', input: {} });
    expect(res.ok).toBe(false);
  });

  it('rejects send-keys without a target', async () => {
    const adapter = new TmuxAdapter({ config: config(), log, bin: '/nonexistent/tmux-xyz' });
    const res = await adapter.invoke({ op: 'send-keys', input: { keys: 'ls' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
  });
});

describe('DmuxAdapter (optional engine)', () => {
  it('reports down truthfully when dmux is unavailable', async () => {
    const adapter = new DmuxAdapter({
      config: config(),
      log,
      availability: async () => ({ available: false, bin: 'dmux', vendored: false, tmuxBin: 'tmux', tmuxPinned: false, reason: 'not installed' }),
    });
    const health = await adapter.health();
    expect(health.status).toBe('down');
    const res = await adapter.invoke({ op: 'launch', input: { repoPath: '/tmp/x' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('unavailable');
  });

  it('returns availability without launching a process', async () => {
    const adapter = new DmuxAdapter({
      config: config(),
      log,
      availability: async () => ({ available: true, bin: '/v/dmux', vendored: true, tmuxBin: '/v/tmux', tmuxPinned: true }),
    });
    const res = await adapter.invoke({ op: 'availability', input: {} });
    expect(res.ok).toBe(true);
    const health = await adapter.health();
    expect(health.status).toBe('up');
  });

  it('maps the pane/layout ops onto the injected layout port', async () => {
    const seen: Record<string, unknown> = {};
    const adapter = new DmuxAdapter({
      config: config(),
      log,
      layout: {
        async presets() {
          seen.presets = true;
          return { ok: true, value: { presets: [], sidebarWidth: 40 } };
        },
        async listPanes(input) {
          seen.listPanes = input;
          return { ok: true, value: { panes: [] } };
        },
        async createPanes(input) {
          seen.createPanes = input;
          return { ok: true, value: { target: input.target, created: [], panes: [], layout: input.layout ?? null } };
        },
        async applyLayout(input) {
          seen.applyLayout = input;
          return { ok: true, value: { target: input.target, preset: input.preset, tmuxLayout: 'tiled', panes: [] } };
        },
      },
    });

    expect((await adapter.invoke({ op: 'layout-presets', input: {} })).ok).toBe(true);
    expect(seen.presets).toBe(true);

    await adapter.invoke({ op: 'panes-list', input: { target: 'recoder-x' } });
    expect(seen.listPanes).toEqual({ target: 'recoder-x' });

    await adapter.invoke({ op: 'panes-create', input: { target: 'recoder-x', count: 3, layout: 'agent-grid' } });
    expect(seen.createPanes).toMatchObject({ target: 'recoder-x', count: 3, layout: 'agent-grid' });

    await adapter.invoke({ op: 'layout-apply', input: { target: 'recoder-x', preset: 'tiled' } });
    expect(seen.applyLayout).toEqual({ target: 'recoder-x', preset: 'tiled' });
  });

  it('rejects panes-create / layout-apply without a target (bad_input, no throw)', async () => {
    const adapter = new DmuxAdapter({ config: config(), log });
    const create = await adapter.invoke({ op: 'panes-create', input: { count: 2 } });
    expect(create.ok).toBe(false);
    if (!create.ok) expect(create.code).toBe('bad_input');
    const apply = await adapter.invoke({ op: 'layout-apply', input: { preset: 'tiled' } });
    expect(apply.ok).toBe(false);
    if (!apply.ok) expect(apply.code).toBe('bad_input');
  });
});

describe('RecodergitAdapter', () => {
  it('reports down + fails invoke when the code-graph gate is off', async () => {
    const adapter = new RecodergitAdapter({ config: config(), log, serviceDeps: { isEnabled: () => false } });
    const health = await adapter.health();
    expect(health.status).toBe('down');
    const res = await adapter.invoke({ op: 'status', input: { repoId: 'r' } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('disabled');
  });
});
