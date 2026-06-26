/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

// See launch-plan.test.ts: mock recoder-code-core onto the real local resolvers.
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

import {
  isPiShellEnabled,
  maybeRunRecoderPiShell,
  runRecoderPiShell,
  type PiMainEntry,
} from './launcher.js';

function resolvableEnv(
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    HOME: '/home/tester',
    RECODERGIT_BIN: 'recodergit',
    RECODER_BRAIN_BIN: 'recoder-brain',
    ...extra,
  };
}

const NO_VENDORED = () => false;

describe('isPiShellEnabled', () => {
  it('is true only for truthy flag values', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on', ' on ']) {
      expect(isPiShellEnabled({ RECODER_PI_SHELL: v })).toBe(true);
    }
  });

  it('is false when unset or falsy', () => {
    expect(isPiShellEnabled({})).toBe(false);
    for (const v of ['', '0', 'false', 'no', 'off', 'nope']) {
      expect(isPiShellEnabled({ RECODER_PI_SHELL: v })).toBe(false);
    }
  });
});

describe('maybeRunRecoderPiShell (the CLI gate)', () => {
  it('flag OFF: does NOT launch pi and returns false (legacy path runs)', async () => {
    const loadPiMain = vi.fn();
    const launched = await maybeRunRecoderPiShell({
      env: resolvableEnv(), // RECODER_PI_SHELL unset
      exists: NO_VENDORED,
      argv: [],
      loadPiMain: loadPiMain as unknown as () => Promise<PiMainEntry>,
    });

    expect(launched).toBe(false);
    expect(loadPiMain).not.toHaveBeenCalled();
  });

  it('flag ON: launches pi and returns true', async () => {
    const piMain = vi.fn(async () => undefined);
    const launched = await maybeRunRecoderPiShell({
      env: resolvableEnv({ RECODER_PI_SHELL: '1' }),
      exists: NO_VENDORED,
      argv: [],
      ensureAuthenticated: async () => true,
      loadPiMain: async () => piMain as unknown as PiMainEntry,
    });

    expect(launched).toBe(true);
    expect(piMain).toHaveBeenCalledTimes(1);
  });
});

describe('runRecoderPiShell wiring', () => {
  it('invokes pi interactive main with configDir + branding + MCP servers bridged', async () => {
    const env = resolvableEnv({ RECODER_PI_SHELL: '1' });
    const piMain = vi.fn(async () => undefined);
    const bridgeFactory = () => {};
    const buildBridge = vi.fn(() => bridgeFactory);

    const plan = await runRecoderPiShell({
      env,
      exists: NO_VENDORED,
      argv: ['--foo'],
      ensureAuthenticated: async () => true,
      loadPiMain: async () => piMain as unknown as PiMainEntry,
      buildBridge,
    });

    // The plan carries the correct config (branding + MCP servers).
    expect(plan.appName).toBe('recoder');
    expect(Object.keys(plan.mcpServers).sort()).toEqual([
      'brain',
      'recodergit',
    ]);

    // configDir env wiring was really applied to the env. After the Stage B
    // rebrand pi's APP_NAME is "Recoder", so the env var it honors is
    // RECODER_CODING_AGENT_DIR (not the stock PI_CODING_AGENT_DIR).
    expect(env['RECODER_CODING_AGENT_DIR']).toBe('/home/tester/.recoder/agent');

    // The bridge was built from exactly the seeded MCP servers...
    expect(buildBridge).toHaveBeenCalledTimes(1);
    expect(buildBridge).toHaveBeenCalledWith(plan.mcpServers);

    // ...and pi's interactive main was called once with the bridge factory.
    expect(piMain).toHaveBeenCalledTimes(1);
    const [piArgs, options] = piMain.mock.calls[0] as [
      string[],
      { extensionFactories?: unknown[] },
    ];
    expect(piArgs).toEqual(['--foo']);
    expect(options?.extensionFactories).toEqual([bridgeFactory]);
  });

  it('default-builds a real MCP bridge factory when none injected', async () => {
    const env = resolvableEnv({ RECODER_PI_SHELL: '1' });
    const piMain = vi.fn(async () => undefined);

    await runRecoderPiShell({
      env,
      exists: NO_VENDORED,
      argv: [],
      ensureAuthenticated: async () => true,
      loadPiMain: async () => piMain as unknown as PiMainEntry,
    });

    const [, options] = piMain.mock.calls[0] as [
      string[],
      { extensionFactories?: unknown[] },
    ];
    expect(options?.extensionFactories).toHaveLength(1);
    expect(typeof options?.extensionFactories?.[0]).toBe('function');
  });
});
