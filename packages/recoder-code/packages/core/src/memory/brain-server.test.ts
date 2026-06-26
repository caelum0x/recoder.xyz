/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import type { MCPServerConfig } from '../config/config.js';
import {
  DEFAULT_BRAIN_SERVER_NAME,
  resolveBrainCommand,
  resolveBrainServerConfig,
  withDefaultBrainServer,
  type EnvLike,
  type ExistsFn,
} from './brain-server.js';

/** Absolute path to the vendored Brain MCP entry under a fake monorepo root. */
const ROOT = join('/', 'repo');
const VENDORED = join(ROOT, 'packages', 'brain', 'dist', 'seams', 'mcp-stdio.js');

/** An `exists` that returns true only for the listed paths. */
function existsFor(paths: string[]): ExistsFn {
  const set = new Set(paths);
  return (p: string) => set.has(p);
}

const NEVER_EXISTS: ExistsFn = () => false;
const NOT_ON_PATH = () => false;

describe('resolveBrainCommand', () => {
  it('prefers the vendored build (spawned via node) when it exists', () => {
    const cmd = resolveBrainCommand({
      startDir: join(ROOT, 'packages', 'recoder-code', 'packages', 'core'),
      exists: existsFor([VENDORED]),
      env: {},
      isOnPath: NOT_ON_PATH,
    });
    // The vendored entry IS the stdio server — no extra subcommand.
    expect(cmd).toEqual({ command: 'node', args: [VENDORED] });
  });

  it('falls back to the RECODER_BRAIN_BIN env override when no vendored build', () => {
    const cmd = resolveBrainCommand({
      startDir: ROOT,
      exists: NEVER_EXISTS,
      env: { RECODER_BRAIN_BIN: '/opt/recoder-brain' },
      isOnPath: NOT_ON_PATH,
    });
    expect(cmd).toEqual({ command: '/opt/recoder-brain', args: [] });
  });

  it('falls back to a `recoder-brain` on PATH when nothing else resolves', () => {
    const cmd = resolveBrainCommand({
      startDir: ROOT,
      exists: NEVER_EXISTS,
      env: {},
      isOnPath: (name) => name === 'recoder-brain',
    });
    expect(cmd).toEqual({ command: 'recoder-brain', args: [] });
  });

  it('returns undefined when the Brain entry cannot be resolved (fail-safe)', () => {
    const cmd = resolveBrainCommand({
      startDir: ROOT,
      exists: NEVER_EXISTS,
      env: {},
      isOnPath: NOT_ON_PATH,
    });
    expect(cmd).toBeUndefined();
  });

  it('uses the default PATH scan to find recoder-brain on PATH', () => {
    const binDir = join('/', 'usr', 'local', 'bin');
    const cmd = resolveBrainCommand({
      startDir: ROOT,
      exists: existsFor([join(binDir, 'recoder-brain')]),
      env: { PATH: `${binDir}:/usr/bin` },
      // no isOnPath -> exercises the real PATH scan
    });
    expect(cmd).toEqual({ command: 'recoder-brain', args: [] });
  });
});

describe('resolveBrainServerConfig', () => {
  it('produces a stdio MCPServerConfig consumable by the client manager', () => {
    const config = resolveBrainServerConfig({
      startDir: ROOT,
      exists: existsFor([VENDORED]),
      env: {},
      isOnPath: NOT_ON_PATH,
    });
    expect(config).toBeDefined();
    expect(config?.command).toBe('node');
    expect(config?.args).toEqual([VENDORED]);
    expect(typeof config?.description).toBe('string');
    // No HTTP transport fields — this is a local stdio server.
    expect(config?.url).toBeUndefined();
    expect(config?.httpUrl).toBeUndefined();
  });

  it('returns undefined when the Brain entry is absent (fail-safe)', () => {
    const config = resolveBrainServerConfig({
      startDir: ROOT,
      exists: NEVER_EXISTS,
      env: {},
      isOnPath: NOT_ON_PATH,
    });
    expect(config).toBeUndefined();
  });
});

describe('withDefaultBrainServer', () => {
  const RESOLVES = {
    startDir: ROOT,
    exists: existsFor([VENDORED]),
    env: {} as EnvLike,
    isOnPath: NOT_ON_PATH,
  };

  it('merges the default brain server when the entry resolves', () => {
    const merged = withDefaultBrainServer({}, RESOLVES);
    expect(merged[DEFAULT_BRAIN_SERVER_NAME]).toEqual({
      command: 'node',
      args: [VENDORED],
      description:
        'Recoder Brain (shared memory): brain_assemble, brain_recall, brain_record',
    });
  });

  it('preserves existing user servers while adding the default', () => {
    const userServer: MCPServerConfig = { command: 'my-server' };
    const merged = withDefaultBrainServer({ mine: userServer }, RESOLVES);
    expect(merged['mine']).toBe(userServer);
    expect(merged[DEFAULT_BRAIN_SERVER_NAME]).toBeDefined();
  });

  it('coexists with the default code-graph server (independent keys)', () => {
    const recodergit: MCPServerConfig = { command: 'node', args: ['/x', 'mcp'] };
    const merged = withDefaultBrainServer({ recodergit }, RESOLVES);
    expect(merged['recodergit']).toBe(recodergit);
    expect(merged[DEFAULT_BRAIN_SERVER_NAME]).toBeDefined();
  });

  it('does NOT add an entry when the entry cannot be resolved (fail-safe)', () => {
    const merged = withDefaultBrainServer(
      {},
      { startDir: ROOT, exists: NEVER_EXISTS, env: {}, isOnPath: NOT_ON_PATH },
    );
    expect(merged[DEFAULT_BRAIN_SERVER_NAME]).toBeUndefined();
    expect(Object.keys(merged)).toHaveLength(0);
  });

  it('lets a user-configured brain entry override the default', () => {
    const userOverride: MCPServerConfig = {
      command: 'recoder-brain',
      args: ['--http'],
    };
    const merged = withDefaultBrainServer({ brain: userOverride }, RESOLVES);
    expect(merged[DEFAULT_BRAIN_SERVER_NAME]).toBe(userOverride);
  });

  it('treats a falsy brain entry as an explicit opt-out and strips it', () => {
    const merged = withDefaultBrainServer(
      // Settings may carry `"brain": false` to disable the default.
      { brain: false as unknown as MCPServerConfig },
      RESOLVES,
    );
    expect(DEFAULT_BRAIN_SERVER_NAME in merged).toBe(false);
  });

  it('is disabled by RECODER_BRAIN=false', () => {
    const merged = withDefaultBrainServer(
      {},
      { ...RESOLVES, env: { RECODER_BRAIN: 'false' } },
    );
    expect(merged[DEFAULT_BRAIN_SERVER_NAME]).toBeUndefined();
  });

  it('is disabled by an explicit enabled: false', () => {
    const merged = withDefaultBrainServer({}, { ...RESOLVES, enabled: false });
    expect(merged[DEFAULT_BRAIN_SERVER_NAME]).toBeUndefined();
  });

  it('does not mutate the input map', () => {
    const input: Record<string, MCPServerConfig> = {};
    const merged = withDefaultBrainServer(input, RESOLVES);
    expect(input).not.toBe(merged);
    expect(Object.keys(input)).toHaveLength(0);
  });
});
