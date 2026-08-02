/**
 * Cloud-sandbox conductor substrate — fake-gateway driven (no real cloud/git).
 *
 * Proves the SEAM this adapter adds on top of the proven `@recoder/substrate`
 * remote mechanics: the substrate `id` is pinned to the gateway's `substrateId`
 * (so a `daytona` gateway → `daytona` substrate, an `ssh` gateway → `ssh`
 * substrate); `available()` is truthful (`isEnabled()` false ⇒ available:false,
 * enabled+reachable ⇒ available:true); capabilities report a REMOTE substrate;
 * and capture / alive / exitCode / teardown delegate through the gateway's
 * exec/destroy — with the blip-must-not-finalize invariant preserved (a transient
 * exec fault ⇒ alive:true, exitCode:undefined, never a fabricated finish).
 */
import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCloudSandboxSubstrate } from './cloud-sandbox-substrate.adapter.js';
import type {
  CloudSandboxExecOptions,
  CloudSandboxExecResult,
  CloudSandboxGatewayPort,
  CloudSandboxProvisionOptions,
} from '../ports/cloud-sandbox.port.js';
import type { WorkspaceSubstrate } from '@recoder/agent-os';

interface ExecCall {
  sandboxId: string;
  command: string;
  options?: CloudSandboxExecOptions;
}

function makeGateway(
  opts: {
    substrateId?: WorkspaceSubstrate;
    enabled?: boolean;
    available?: boolean;
    exec?: (sandboxId: string, command: string) => CloudSandboxExecResult | Promise<CloudSandboxExecResult>;
  } = {},
): CloudSandboxGatewayPort & {
  execCalls: ExecCall[];
  destroyed: string[];
  provisionCalls: Array<CloudSandboxProvisionOptions | undefined>;
} {
  const execCalls: ExecCall[] = [];
  const destroyed: string[] = [];
  const provisionCalls: Array<CloudSandboxProvisionOptions | undefined> = [];
  const gateway: CloudSandboxGatewayPort = {
    substrateId: opts.substrateId ?? 'daytona',
    isEnabled: () => opts.enabled ?? true,
    isAvailable: async () => opts.available ?? true,
    provision: async (options) => {
      provisionCalls.push(options);
      return { id: 'sbx_1' };
    },
    getWorkDir: async () => '/home/daytona',
    async exec(sandboxId, command, options) {
      execCalls.push({ sandboxId, command, ...(options ? { options } : {}) });
      return (await opts.exec?.(sandboxId, command)) ?? { output: '' };
    },
    async destroy(sandboxId) {
      destroyed.push(sandboxId);
    },
  };
  return Object.assign(gateway, { execCalls, destroyed, provisionCalls });
}

const handle = { ref: 'sbx_1', worktreePath: '/home/daytona/repo', sandboxId: 'sbx_1' };

describe('createCloudSandboxSubstrate', () => {
  it('pins the substrate id to the gateway substrateId (daytona)', () => {
    const sub = createCloudSandboxSubstrate({ gateway: makeGateway({ substrateId: 'daytona' }) });
    expect(sub.id).toBe('daytona');
    expect(sub.capabilities().remote).toBe(true);
    expect(sub.capabilities().supportsPty).toBe(false);
  });

  it('pins the substrate id to the gateway substrateId (ssh)', () => {
    const sub = createCloudSandboxSubstrate({ gateway: makeGateway({ substrateId: 'ssh' }) });
    expect(sub.id).toBe('ssh');
  });

  it('reports available:false truthfully when the gateway is not enabled', async () => {
    const sub = createCloudSandboxSubstrate({ gateway: makeGateway({ enabled: false }) });
    const avail = await sub.available();
    expect(avail.available).toBe(false);
    expect(avail.reason).toMatch(/not configured/i);
  });

  it('reports available:false when enabled but the provider is unreachable', async () => {
    const sub = createCloudSandboxSubstrate({ gateway: makeGateway({ enabled: true, available: false }) });
    const avail = await sub.available();
    expect(avail.available).toBe(false);
  });

  it('reports available:true when enabled and reachable', async () => {
    const sub = createCloudSandboxSubstrate({ gateway: makeGateway({ enabled: true, available: true }) });
    await expect(sub.available()).resolves.toEqual({ available: true, reason: undefined });
  });

  it('captures agent output through the gateway exec seam', async () => {
    const gateway = makeGateway({ exec: () => ({ output: 'hello from sandbox' }) });
    const sub = createCloudSandboxSubstrate({ gateway });
    await expect(sub.capture(handle)).resolves.toBe('hello from sandbox');
    expect(gateway.execCalls[0]!.sandboxId).toBe('sbx_1');
    expect(gateway.execCalls[0]!.command).toMatch(/tail -n/);
  });

  it('maps the exit sentinel: __RUNNING__ ⇒ alive, __FINISHED__ ⇒ not alive', async () => {
    const running = createCloudSandboxSubstrate({ gateway: makeGateway({ exec: () => ({ output: '__RUNNING__' }) }) });
    await expect(running.alive(handle)).resolves.toBe(true);
    const finished = createCloudSandboxSubstrate({ gateway: makeGateway({ exec: () => ({ output: '__FINISHED__' }) }) });
    await expect(finished.alive(handle)).resolves.toBe(false);
  });

  it('reads the exit code sentinel; unknown ⇒ undefined (never a fabricated 0)', async () => {
    const done = createCloudSandboxSubstrate({ gateway: makeGateway({ exec: () => ({ output: '__EXIT__0' }) }) });
    await expect(done.exitCode!(handle)).resolves.toBe(0);
    const none = createCloudSandboxSubstrate({ gateway: makeGateway({ exec: () => ({ output: '__NONE__' }) }) });
    await expect(none.exitCode!(handle)).resolves.toBeUndefined();
  });

  it('preserves blip-must-not-finalize: a transient exec fault ⇒ alive true, exit undefined', async () => {
    const flaky = makeGateway({
      exec: () => {
        throw new Error('sandbox unreachable (transient)');
      },
    });
    const sub = createCloudSandboxSubstrate({ gateway: flaky });
    await expect(sub.alive(handle)).resolves.toBe(true);
    await expect(sub.exitCode!(handle)).resolves.toBeUndefined();
  });

  it('threads the launching run\'s runId into gateway.provision (recoder-qyvu)', async () => {
    // A real repo with an `origin` remote — the substrate resolves it host-side.
    const repoPath = mkdtempSync(join(tmpdir(), 'cloud-substrate-launch-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: repoPath });
      execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/repo.git'], {
        cwd: repoPath,
      });

      const gateway = makeGateway();
      const sub = createCloudSandboxSubstrate({ gateway });
      const launched = await sub.launch({
        workspaceId: 'ws_42',
        command: 'echo hi',
        repoPath,
        branch: 'feature/x',
        baseRef: 'HEAD',
      });

      expect(launched.ref).toBe('sbx_1');
      // The provision carries the deterministic run id, so the sandbox's cloud
      // lifecycle RunEvents resolve to this workspace's live /stream.
      expect(gateway.provisionCalls).toEqual([{ runId: 'run_ws_42' }]);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('tears down by destroying the sandbox through the gateway', async () => {
    const gateway = makeGateway();
    const sub = createCloudSandboxSubstrate({ gateway });
    await sub.teardown(handle);
    expect(gateway.destroyed).toEqual(['sbx_1']);
  });
});
