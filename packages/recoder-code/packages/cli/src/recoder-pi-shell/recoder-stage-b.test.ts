/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stage B coverage for the Recoder layer ported onto pi:
 *  - BRANDING: the vendored `@recoder/pi-coding-agent` package.json carries the
 *    Recoder `piConfig` (so pi's TUI renders "Recoder").
 *  - AUTH: the pre-launch auth gate proceeds when authenticated and prompts +
 *    exits (without launching pi) when not — using an injected auth check.
 *  - MCP: the bridge degrades gracefully when a server fails and surfaces which
 *    Recoder tool groups loaded vs degraded.
 *
 * The flag-off default path is covered in launcher.test.ts and is unchanged.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

// Mirror launcher.test.ts: resolve `recoder-code-core` (a published build that
// predates the recodergit/brain resolvers) onto the REAL local resolver source
// so the launch plan exercises genuine resolver logic deterministically.
vi.mock('recoder-code-core', async () => {
  const codeGraph = await import(
    '../../../core/src/code-graph/recodergit-server.js'
  );
  const brain = await import('../../../core/src/memory/brain-server.js');
  return {
    withDefaultCodeGraphServer: codeGraph.withDefaultCodeGraphServer,
    withDefaultBrainServer: brain.withDefaultBrainServer,
  };
});

import { runRecoderPiShell, type PiMainEntry } from './launcher.js';
import {
  createRecoderMcpBridgeFactory,
  type BridgedMcpConnection,
  type PiBridgedTool,
  type RecoderToolGroupSummary,
} from './mcp-bridge.js';

function resolvableEnv(
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    HOME: '/home/tester',
    RECODER_PI_SHELL: '1',
    RECODERGIT_BIN: 'recodergit',
    RECODER_BRAIN_BIN: 'recoder-brain',
    ...extra,
  };
}

const NO_VENDORED = () => false;

// ---------------------------------------------------------------------------
// 1. BRANDING — the vendored pi package.json carries Recoder identity.
// ---------------------------------------------------------------------------

describe('Stage B branding: pi piConfig is set to Recoder', () => {
  it('vendored @recoder/pi-coding-agent package.json brands the TUI as Recoder', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const piPackageJsonPath = join(
      here,
      '../../../../../pi-coding-agent/package.json',
    );
    const pkg = JSON.parse(readFileSync(piPackageJsonPath, 'utf-8')) as {
      piConfig?: { name?: string; configDir?: string };
    };

    // pi derives APP_NAME / APP_TITLE from piConfig.name at module load, so this
    // is what makes the TUI render "Recoder" instead of "pi"/"π".
    expect(pkg.piConfig?.name).toBe('Recoder');
    // pi derives CONFIG_DIR_NAME from piConfig.configDir: ~/.recoder, matching
    // the Recoder config identity (and the env-override default).
    expect(pkg.piConfig?.configDir).toBe('.recoder');
  });
});

// ---------------------------------------------------------------------------
// 2. AUTH — the pre-launch gate decides whether pi launches.
// ---------------------------------------------------------------------------

describe('Stage B auth gate: pi runs only when authenticated', () => {
  it('authenticated: gate passes and pi interactive main is launched', async () => {
    const piMain = vi.fn(async () => undefined);
    const ensureAuthenticated = vi.fn(async () => true);
    const onUnauthenticated = vi.fn();
    const exit = vi.fn();

    await runRecoderPiShell({
      env: resolvableEnv(),
      exists: NO_VENDORED,
      argv: [],
      ensureAuthenticated,
      onUnauthenticated,
      exit,
      loadPiMain: async () => piMain as unknown as PiMainEntry,
    });

    expect(ensureAuthenticated).toHaveBeenCalledTimes(1);
    expect(onUnauthenticated).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(piMain).toHaveBeenCalledTimes(1);
  });

  it('unauthenticated: prompts `recoder auth login`, exits, and never launches pi', async () => {
    const env = resolvableEnv();
    const piMain = vi.fn(async () => undefined);
    const applyEnv = vi.fn();
    const ensureAuthenticated = vi.fn(async () => false);
    const onUnauthenticated = vi.fn();
    const exit = vi.fn();

    await runRecoderPiShell({
      env,
      exists: NO_VENDORED,
      argv: [],
      ensureAuthenticated,
      onUnauthenticated,
      exit,
      applyEnv,
      loadPiMain: async () => piMain as unknown as PiMainEntry,
    });

    expect(ensureAuthenticated).toHaveBeenCalledTimes(1);
    // The login prompt fired and the process was asked to exit non-zero...
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    // ...and pi was never launched, nor was the env mutated.
    expect(piMain).not.toHaveBeenCalled();
    expect(applyEnv).not.toHaveBeenCalled();
    expect(env['RECODER_CODING_AGENT_DIR']).toBeUndefined();
  });

  it('default onUnauthenticated surfaces the `recoder auth login` hint', async () => {
    const env = resolvableEnv();
    const errors: string[] = [];
    const spy = vi
      .spyOn(console, 'error')
      .mockImplementation((msg?: unknown) => {
        errors.push(String(msg));
      });
    try {
      await runRecoderPiShell({
        env,
        exists: NO_VENDORED,
        argv: [],
        ensureAuthenticated: async () => false,
        exit: () => {},
        loadPiMain: async () =>
          (() => undefined) as unknown as PiMainEntry,
      });
    } finally {
      spy.mockRestore();
    }
    expect(errors.some((e) => e.includes('recoder auth login'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. MCP — graceful degradation + surfacing of loaded vs degraded groups.
// ---------------------------------------------------------------------------

function fakeRegistrar() {
  const tools: PiBridgedTool[] = [];
  return {
    tools,
    registerTool(tool: PiBridgedTool) {
      tools.push(tool);
    },
  };
}

function fakeConnection(
  tools: Array<{ name: string }>,
): BridgedMcpConnection {
  return {
    listTools: async () => ({ tools }),
    callTool: async () => ({ content: [] }),
    close: async () => {},
  };
}

describe('Stage B MCP bridge: degrades + surfaces tool groups', () => {
  it('reports loaded and degraded groups when one server fails', async () => {
    const summaries: RecoderToolGroupSummary[] = [];
    const connect = vi.fn(async (name: string) => {
      if (name === 'recodergit') {
        throw new Error('spawn ENOENT');
      }
      return fakeConnection([{ name: 'recall' }, { name: 'store' }]);
    });

    const factory = createRecoderMcpBridgeFactory(
      {
        recodergit: { command: 'recodergit' } as never,
        brain: { command: 'recoder-brain' } as never,
      },
      {
        connect,
        onWarn: () => {},
        onGroupsResolved: (s) => summaries.push(s),
      },
    );

    const pi = fakeRegistrar();
    // Never throws — the broken group is skipped, the healthy group still loads.
    await expect(factory(pi)).resolves.toBeUndefined();

    expect(pi.tools.map((t) => t.name).sort()).toEqual([
      'brain__recall',
      'brain__store',
    ]);

    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    expect(summary.loaded).toEqual([{ name: 'brain', toolCount: 2 }]);
    expect(summary.degraded).toEqual([
      { name: 'recodergit', reason: 'spawn ENOENT' },
    ]);
  });

  it('reports all groups loaded when every server is healthy', async () => {
    const summaries: RecoderToolGroupSummary[] = [];
    const connect = vi.fn(async (name: string) =>
      name === 'recodergit'
        ? fakeConnection([{ name: 'impact' }])
        : fakeConnection([{ name: 'recall' }]),
    );

    const factory = createRecoderMcpBridgeFactory(
      {
        recodergit: { command: 'recodergit' } as never,
        brain: { command: 'recoder-brain' } as never,
      },
      { connect, onGroupsResolved: (s) => summaries.push(s) },
    );

    await factory(fakeRegistrar());

    expect(summaries[0].degraded).toEqual([]);
    expect(summaries[0].loaded.map((g) => g.name).sort()).toEqual([
      'brain',
      'recodergit',
    ]);
  });
});
