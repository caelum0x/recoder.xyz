/**
 * Docker-CLI `LocalContainerRuntime` tests — the self-host-tier seam that
 * replaces the permanently-`down` stub bootstrap previously left unwired.
 *
 * These tests stub the `docker` binary itself (a tiny executable script on
 * PATH via `bin` override + `PATH` prepend) rather than mocking `child_process`
 * internals, so the real `@recoder/substrate` `execFileSafe` codepath is
 * exercised end-to-end — only the Docker daemon is faked, not our own code.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDockerContainerRuntime } from '../adapters/local-container-runtime.docker.js';

const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => silentLogger,
} as unknown as Parameters<typeof createDockerContainerRuntime>[0]['logger'];

/** Write an executable fake `docker` whose behavior is driven by its first arg. */
function fakeDockerBin(dir: string, script: string): string {
  const path = join(dir, 'fake-docker');
  writeFileSync(path, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  chmodSync(path, 0o755);
  return path;
}

let scratchDir: string;

beforeAll(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'recoder-docker-runtime-test-'));
});

afterAll(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

describe('ping — truthful daemon reachability', () => {
  it('is false when the docker binary is not on PATH', async () => {
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin: '/nonexistent/docker-xyz' });
    expect(await runtime.ping()).toBe(false);
  });

  it('is true when `docker info` exits 0', async () => {
    const bin = fakeDockerBin(scratchDir, 'if [ "$1" = "info" ]; then echo "27.0.0"; exit 0; fi; exit 1');
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    expect(await runtime.ping()).toBe(true);
  });

  it('is false when the daemon is unreachable (non-zero exit)', async () => {
    const bin = fakeDockerBin(scratchDir, 'if [ "$1" = "info" ]; then echo "cannot connect" >&2; exit 1; fi; exit 1');
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    expect(await runtime.ping()).toBe(false);
  });
});

describe('run — provisions a real sandbox, never fabricates one', () => {
  it('returns the container id docker reports, with a null workspaceUrl', async () => {
    const bin = fakeDockerBin(
      scratchDir,
      'if [ "$1" = "run" ]; then echo "abc123def456"; exit 0; fi; exit 1',
    );
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    const result = await runtime.run({
      tenantId: 'tnt_1',
      userId: 'user_1',
      region: 'us-east',
      resources: { cpuMillis: 1000, memMb: 512 },
    });
    expect(result.containerId).toBe('abc123def456');
    expect(result.workspaceUrl).toBeNull();
  });

  it('propagates a launch failure as a thrown error (no silent success)', async () => {
    const bin = fakeDockerBin(
      scratchDir,
      'if [ "$1" = "run" ]; then echo "Unable to find image" >&2; exit 125; fi; exit 1',
    );
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    await expect(
      runtime.run({
        tenantId: 'tnt_1',
        userId: 'user_1',
        region: 'us-east',
        resources: { cpuMillis: 500, memMb: 256 },
      }),
    ).rejects.toThrow();
  });
});

describe('inspect — reconciles real container state', () => {
  it('maps a running container', async () => {
    const bin = fakeDockerBin(scratchDir, 'if [ "$1" = "inspect" ]; then echo "true"; exit 0; fi; exit 1');
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    expect(await runtime.inspect('ctr_1')).toEqual({ running: true });
  });

  it('maps a stopped container', async () => {
    const bin = fakeDockerBin(scratchDir, 'if [ "$1" = "inspect" ]; then echo "false"; exit 0; fi; exit 1');
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    expect(await runtime.inspect('ctr_1')).toEqual({ running: false });
  });

  it('returns null (never throws) when the container no longer exists', async () => {
    const bin = fakeDockerBin(
      scratchDir,
      'if [ "$1" = "inspect" ]; then echo "Error: No such object: ctr_gone" >&2; exit 1; fi; exit 1',
    );
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    expect(await runtime.inspect('ctr_gone')).toBeNull();
  });

  it('rethrows a genuine daemon fault (not a "not found")', async () => {
    const bin = fakeDockerBin(
      scratchDir,
      'if [ "$1" = "inspect" ]; then echo "Cannot connect to the Docker daemon" >&2; exit 1; fi; exit 1',
    );
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    await expect(runtime.inspect('ctr_1')).rejects.toThrow();
  });
});

describe('remove — idempotent teardown', () => {
  it('succeeds when docker removes the container', async () => {
    const bin = fakeDockerBin(scratchDir, 'if [ "$1" = "rm" ]; then exit 0; fi; exit 1');
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    await expect(runtime.remove('ctr_1')).resolves.toBeUndefined();
  });

  it('succeeds (idempotent) when the container is already gone', async () => {
    const bin = fakeDockerBin(
      scratchDir,
      'if [ "$1" = "rm" ]; then echo "Error: No such container: ctr_1" >&2; exit 1; fi; exit 1',
    );
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    await expect(runtime.remove('ctr_1')).resolves.toBeUndefined();
  });
});

describe('exec — distinguishes command failure from CLI timeout/kill', () => {
  it('returns the real exit code + output of an in-container command', async () => {
    const bin = fakeDockerBin(
      scratchDir,
      'if [ "$1" = "exec" ]; then echo "hello"; exit 0; fi; exit 1',
    );
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    const result = await runtime.exec!('ctr_1', { externalId: 'ctr_1', command: 'echo hello' });
    expect(result).toEqual({ exitCode: 0, stdout: 'hello\n', stderr: '', timedOut: false });
  });

  it('surfaces a non-zero in-container exit code as a normal (non-timed-out) result', async () => {
    const bin = fakeDockerBin(
      scratchDir,
      'if [ "$1" = "exec" ]; then echo "boom" >&2; exit 7; fi; exit 1',
    );
    const runtime = createDockerContainerRuntime({ logger: silentLogger, bin });
    const result = await runtime.exec!('ctr_1', { externalId: 'ctr_1', command: 'false' });
    expect(result.exitCode).toBe(7);
    expect(result.stderr).toContain('boom');
    expect(result.timedOut).toBe(false);
  });
});
