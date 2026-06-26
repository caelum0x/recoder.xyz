/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import type { MCPServerConfig } from '../config/config.js';
import {
  DEFAULT_CODE_GRAPH_SERVER_NAME,
  resolveRecodergitCommand,
  resolveCodeGraphServerConfig,
  withDefaultCodeGraphServer,
  type EnvLike,
  type ExistsFn,
} from './recodergit-server.js';

/** Absolute path to the vendored recodergit entry under a fake monorepo root. */
const ROOT = join('/', 'repo');
const VENDORED = join(
  ROOT,
  'ts',
  'recodergit',
  'recodergit',
  'dist',
  'cli',
  'index.js',
);

/** An `exists` that returns true only for the listed paths. */
function existsFor(paths: string[]): ExistsFn {
  const set = new Set(paths);
  return (p: string) => set.has(p);
}

const NEVER_EXISTS: ExistsFn = () => false;
const NOT_ON_PATH = () => false;

describe('resolveRecodergitCommand', () => {
  it('prefers the vendored build (spawned via node) when it exists', () => {
    const cmd = resolveRecodergitCommand({
      startDir: join(ROOT, 'packages', 'recoder-code', 'packages', 'core'),
      exists: existsFor([VENDORED]),
      env: {},
      isOnPath: NOT_ON_PATH,
    });
    expect(cmd).toEqual({ command: 'node', args: [VENDORED, 'mcp'] });
  });

  it('falls back to the RECODERGIT_BIN env override when no vendored build', () => {
    const cmd = resolveRecodergitCommand({
      startDir: ROOT,
      exists: NEVER_EXISTS,
      env: { RECODERGIT_BIN: '/opt/recodergit' },
      isOnPath: NOT_ON_PATH,
    });
    expect(cmd).toEqual({ command: '/opt/recodergit', args: ['mcp'] });
  });

  it('falls back to a `recodergit` on PATH when nothing else resolves', () => {
    const cmd = resolveRecodergitCommand({
      startDir: ROOT,
      exists: NEVER_EXISTS,
      env: {},
      isOnPath: (name) => name === 'recodergit',
    });
    expect(cmd).toEqual({ command: 'recodergit', args: ['mcp'] });
  });

  it('returns undefined when the engine cannot be resolved (fail-safe)', () => {
    const cmd = resolveRecodergitCommand({
      startDir: ROOT,
      exists: NEVER_EXISTS,
      env: {},
      isOnPath: NOT_ON_PATH,
    });
    expect(cmd).toBeUndefined();
  });

  it('uses the default PATH scan to find recodergit on PATH', () => {
    const binDir = join('/', 'usr', 'local', 'bin');
    const cmd = resolveRecodergitCommand({
      startDir: ROOT,
      exists: existsFor([join(binDir, 'recodergit')]),
      env: { PATH: `${binDir}:/usr/bin` },
      // no isOnPath -> exercises the real PATH scan
    });
    expect(cmd).toEqual({ command: 'recodergit', args: ['mcp'] });
  });
});

describe('resolveCodeGraphServerConfig', () => {
  it('produces a stdio MCPServerConfig consumable by the client manager', () => {
    const config = resolveCodeGraphServerConfig({
      startDir: ROOT,
      exists: existsFor([VENDORED]),
      env: {},
      isOnPath: NOT_ON_PATH,
    });
    expect(config).toBeDefined();
    expect(config?.command).toBe('node');
    expect(config?.args).toEqual([VENDORED, 'mcp']);
    expect(typeof config?.description).toBe('string');
    // No HTTP transport fields — this is a local stdio server.
    expect(config?.url).toBeUndefined();
    expect(config?.httpUrl).toBeUndefined();
  });

  it('returns undefined when the engine is absent (fail-safe)', () => {
    const config = resolveCodeGraphServerConfig({
      startDir: ROOT,
      exists: NEVER_EXISTS,
      env: {},
      isOnPath: NOT_ON_PATH,
    });
    expect(config).toBeUndefined();
  });
});

describe('withDefaultCodeGraphServer', () => {
  const RESOLVES = {
    startDir: ROOT,
    exists: existsFor([VENDORED]),
    env: {} as EnvLike,
    isOnPath: NOT_ON_PATH,
  };

  it('merges the default recodergit server when the bin resolves', () => {
    const merged = withDefaultCodeGraphServer({}, RESOLVES);
    expect(merged[DEFAULT_CODE_GRAPH_SERVER_NAME]).toEqual({
      command: 'node',
      args: [VENDORED, 'mcp'],
      description:
        'Recoder code-graph (recodergit): impact, context, query, scope, explain, cypher',
    });
  });

  it('preserves existing user servers while adding the default', () => {
    const userServer: MCPServerConfig = { command: 'my-server' };
    const merged = withDefaultCodeGraphServer(
      { mine: userServer },
      RESOLVES,
    );
    expect(merged['mine']).toBe(userServer);
    expect(merged[DEFAULT_CODE_GRAPH_SERVER_NAME]).toBeDefined();
  });

  it('does NOT add an entry when the bin cannot be resolved (fail-safe)', () => {
    const merged = withDefaultCodeGraphServer(
      {},
      { startDir: ROOT, exists: NEVER_EXISTS, env: {}, isOnPath: NOT_ON_PATH },
    );
    expect(merged[DEFAULT_CODE_GRAPH_SERVER_NAME]).toBeUndefined();
    expect(Object.keys(merged)).toHaveLength(0);
  });

  it('lets a user-configured recodergit entry override the default', () => {
    const userOverride: MCPServerConfig = {
      command: 'recodergit',
      args: ['mcp', '--http'],
    };
    const merged = withDefaultCodeGraphServer(
      { recodergit: userOverride },
      RESOLVES,
    );
    expect(merged[DEFAULT_CODE_GRAPH_SERVER_NAME]).toBe(userOverride);
  });

  it('treats a falsy recodergit entry as an explicit opt-out and strips it', () => {
    const merged = withDefaultCodeGraphServer(
      // Settings may carry `"recodergit": false` to disable the default.
      { recodergit: false as unknown as MCPServerConfig },
      RESOLVES,
    );
    expect(DEFAULT_CODE_GRAPH_SERVER_NAME in merged).toBe(false);
  });

  it('is disabled by RECODER_CODE_GRAPH=false', () => {
    const merged = withDefaultCodeGraphServer(
      {},
      { ...RESOLVES, env: { RECODER_CODE_GRAPH: 'false' } },
    );
    expect(merged[DEFAULT_CODE_GRAPH_SERVER_NAME]).toBeUndefined();
  });

  it('is disabled by an explicit enabled: false', () => {
    const merged = withDefaultCodeGraphServer(
      {},
      { ...RESOLVES, enabled: false },
    );
    expect(merged[DEFAULT_CODE_GRAPH_SERVER_NAME]).toBeUndefined();
  });

  it('does not mutate the input map', () => {
    const input: Record<string, MCPServerConfig> = {};
    const merged = withDefaultCodeGraphServer(input, RESOLVES);
    expect(input).not.toBe(merged);
    expect(Object.keys(input)).toHaveLength(0);
  });
});
