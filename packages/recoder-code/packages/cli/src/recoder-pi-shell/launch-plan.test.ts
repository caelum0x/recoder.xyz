/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

// `recoder-code-core` resolves to the published package in this repo, which
// predates the recodergit/brain resolvers. Mock it onto the REAL local resolver
// source so the plan exercises genuine resolver logic deterministically (mirrors
// how the existing cli config.test.ts mocks recoder-code-core).
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
  buildRecoderPiLaunchPlan,
  RECODER_PI_AGENT_DIR_ENV,
  RECODER_APP_NAME,
  RECODER_APP_TITLE,
  resolveRecoderConfigDir,
} from './launch-plan.js';

/**
 * Env that forces both default MCP servers to resolve deterministically via the
 * `*_BIN` env-pinned branch (no vendored build, no PATH lookup), so the plan is
 * stable regardless of the machine the test runs on.
 */
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

describe('buildRecoderPiLaunchPlan', () => {
  it('seeds the recodergit + brain MCP servers for pi', () => {
    const plan = buildRecoderPiLaunchPlan({
      env: resolvableEnv(),
      exists: NO_VENDORED,
      argv: [],
    });

    expect(Object.keys(plan.mcpServers).sort()).toEqual(['brain', 'recodergit']);
    expect(plan.mcpServers['recodergit'].command).toBe('recodergit');
    expect(plan.mcpServers['brain'].command).toBe('recoder-brain');
  });

  it('carries Recoder branding/app identity', () => {
    const plan = buildRecoderPiLaunchPlan({
      env: resolvableEnv(),
      exists: NO_VENDORED,
      argv: [],
    });

    expect(plan.appName).toBe(RECODER_APP_NAME);
    expect(plan.appName).toBe('recoder');
    expect(plan.appTitle).toBe(RECODER_APP_TITLE);
  });

  it('points pi at the Recoder config dir via env override', () => {
    const plan = buildRecoderPiLaunchPlan({
      env: resolvableEnv(),
      exists: NO_VENDORED,
      argv: [],
    });

    expect(plan.configDir).toBe('/home/tester/.recoder');
    expect(plan.piAgentDir).toBe('/home/tester/.recoder/agent');
    expect(RECODER_PI_AGENT_DIR_ENV).toBe('RECODER_CODING_AGENT_DIR');
    expect(plan.envOverrides[RECODER_PI_AGENT_DIR_ENV]).toBe(
      '/home/tester/.recoder/agent',
    );
  });

  it('honors an explicit RECODER_CONFIG_DIR override', () => {
    const plan = buildRecoderPiLaunchPlan({
      env: resolvableEnv({ RECODER_CONFIG_DIR: '/custom/recoder' }),
      exists: NO_VENDORED,
      argv: [],
    });

    expect(plan.configDir).toBe('/custom/recoder');
    expect(plan.piAgentDir).toBe('/custom/recoder/agent');
  });

  it('forwards argv to pi', () => {
    const plan = buildRecoderPiLaunchPlan({
      env: resolvableEnv(),
      exists: NO_VENDORED,
      argv: ['--model', 'anthropic/claude-sonnet-4'],
    });

    expect(plan.piArgs).toEqual(['--model', 'anthropic/claude-sonnet-4']);
  });

  it('is fail-safe: adds no servers when none resolve', () => {
    const plan = buildRecoderPiLaunchPlan({
      env: { HOME: '/home/tester' }, // no *_BIN, no PATH
      exists: NO_VENDORED,
      isOnPath: () => false,
      argv: [],
    });

    expect(plan.mcpServers).toEqual({});
  });

  it('respects opt-out env flags', () => {
    const plan = buildRecoderPiLaunchPlan({
      env: resolvableEnv({
        RECODER_CODE_GRAPH: 'false',
        RECODER_BRAIN: 'false',
      }),
      exists: NO_VENDORED,
      argv: [],
    });

    expect(plan.mcpServers).toEqual({});
  });
});

describe('resolveRecoderConfigDir', () => {
  it('defaults to ~/.recoder', () => {
    expect(resolveRecoderConfigDir({ HOME: '/home/x' })).toBe('/home/x/.recoder');
  });

  it('prefers RECODER_CONFIG_DIR, then RECODER_PI_CONFIG_DIR', () => {
    expect(
      resolveRecoderConfigDir({ HOME: '/h', RECODER_CONFIG_DIR: '/a' }),
    ).toBe('/a');
    expect(
      resolveRecoderConfigDir({ HOME: '/h', RECODER_PI_CONFIG_DIR: '/b' }),
    ).toBe('/b');
  });
});
