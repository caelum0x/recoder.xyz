/**
 * Docker-CLI `LocalContainerRuntime` — the real implementation of the
 * self-host-tier seam `local-container.adapter.ts` declares but bootstrap left
 * unwired ("ONE seam stays intentionally unwired: `localRuntime`"). This is what
 * turns the `local` `SandboxProvider` from a permanently-truthful-`down` stub
 * into an actually-usable sandbox on the operator's OWN box — a Linux server, a
 * Mac mini, or any VM with a Docker daemon. No off-box API key required.
 *
 * REUSE, not reinvention: process execution goes through the monorepo's own
 * `@recoder/substrate` exec primitives (`execFileSafe` / `commandExists`) — the
 * same seam the tmux/git local substrate already uses — instead of a new child
 * process wrapper. The container runtime itself is plain Docker (OSS, already
 * assumed present on any self-host box); no new npm dependency, no SDK.
 *
 * Honesty invariant (matches the adapter it backs): `ping()` never throws — an
 * absent `docker` binary or an unreachable daemon both resolve to a truthful
 * `false`/`unknown`, never a faked `up`. `run()`/`inspect()`/`remove()`/`exec()`
 * surface real Docker state; a missing container resolves to `null` (inspect)
 * or a no-op success (remove — idempotent), never a fabricated one.
 *
 * Scope: this seam brings a sandbox UP and makes it exec-able. It does NOT
 * clone `spec.repo`/`spec.branch` into the container — that orchestration
 * (seed the worktree, then drive the agent) is the conductor substrate layer's
 * job for whichever provider is wired as a conductor execution substrate (today
 * only `daytona`, per `bootstrap/index.ts`'s `cloudDaytonaSub`). Wiring `local`
 * as a second conductor substrate is a follow-up, not this seam's job.
 */
import { randomUUID } from 'node:crypto';
import { commandExists, execFileSafe, ExecError } from '@recoder/substrate';
import type { Logger } from '../../../shared/logger.js';
import type { ProviderExecInput, ProviderExecResult, ProvisionSpec } from '../ports/sandbox-provider.port.js';
import type { LocalContainerRuntime } from './local-container.adapter.js';

/** Default sandbox image when `ProvisionSpec.image` is absent — a small, widely-cached Debian base with a shell. */
export const DEFAULT_LOCAL_SANDBOX_IMAGE = 'node:22-bookworm-slim';

/** Docker CLI calls are local + fast; a generous but bounded timeout keeps a hung daemon from wedging a request. */
const DEFAULT_CLI_TIMEOUT_MS = 15_000;
/** `docker exec` can run arbitrary agent commands; default ceiling when the caller sets none. */
const DEFAULT_EXEC_TIMEOUT_MS = 120_000;

/** Container label namespace — lets `docker ps -f label=com.recoder.sandbox=true` find every sandbox we own. */
const LABEL_PREFIX = 'com.recoder';

export interface CreateDockerContainerRuntimeDeps {
  readonly logger: Logger;
  /** Override the `docker` binary name/path (tests inject a stub; defaults to `docker` on PATH). */
  readonly bin?: string;
}

/** True only for the specific "object not found" shape Docker emits — never matched on a generic failure. */
function isNotFound(stderr: string): boolean {
  return /no such (object|container)/i.test(stderr);
}

/**
 * Build the Docker-CLI-backed {@link LocalContainerRuntime}. Bootstrap injects
 * this unconditionally (cheap to construct); every call still degrades
 * truthfully when Docker is absent or unreachable — this file adds NO new
 * "is this enabled" gate, it just tells the truth about Docker's real state.
 */
export function createDockerContainerRuntime(deps: CreateDockerContainerRuntimeDeps): LocalContainerRuntime {
  const { logger } = deps;
  const bin = deps.bin ?? 'docker';

  async function ping(): Promise<boolean> {
    if (!(await commandExists(bin))) return false;
    try {
      await execFileSafe(bin, ['info', '--format', '{{.ServerVersion}}'], { timeoutMs: DEFAULT_CLI_TIMEOUT_MS });
      return true;
    } catch {
      return false;
    }
  }

  async function run(spec: ProvisionSpec): Promise<{ containerId: string; workspaceUrl?: string | null }> {
    const name = `recoder-sbx-${randomUUID()}`;
    const image = spec.image ?? DEFAULT_LOCAL_SANDBOX_IMAGE;
    const cpus = Math.max(spec.resources.cpuMillis, 0) / 1000;
    const args: string[] = [
      'run',
      '-d',
      '--name',
      name,
      '--cpus',
      cpus > 0 ? cpus.toFixed(2) : '1',
      '--memory',
      `${Math.max(spec.resources.memMb, 1)}m`,
      '--label',
      `${LABEL_PREFIX}.sandbox=true`,
      '--label',
      `${LABEL_PREFIX}.tenant=${spec.tenantId}`,
    ];
    for (const [key, value] of Object.entries(spec.env ?? {})) {
      args.push('-e', `${key}=${value}`);
    }
    // Keep the container alive indefinitely so subsequent `exec` calls land in a
    // live sandbox — `tail -f /dev/null` is available in effectively every Linux
    // base image (unlike GNU `sleep infinity`, which busybox images lack).
    args.push(image, 'tail', '-f', '/dev/null');

    const { stdout } = await execFileSafe(bin, args, { timeoutMs: DEFAULT_CLI_TIMEOUT_MS });
    const containerId = stdout.trim();
    logger.info({ containerId, name, image }, 'local-container-runtime.docker: sandbox provisioned');
    // No HTTP front door is wired for a bare `docker run` sandbox — never fabricate a URL.
    return { containerId, workspaceUrl: null };
  }

  async function inspect(containerId: string): Promise<{ running: boolean } | null> {
    try {
      const { stdout } = await execFileSafe(bin, ['inspect', '--format', '{{.State.Running}}', containerId], {
        timeoutMs: DEFAULT_CLI_TIMEOUT_MS,
      });
      return { running: stdout.trim() === 'true' };
    } catch (cause) {
      if (cause instanceof ExecError && isNotFound(cause.stderr)) return null;
      throw cause;
    }
  }

  async function remove(containerId: string): Promise<void> {
    try {
      await execFileSafe(bin, ['rm', '-f', containerId], { timeoutMs: DEFAULT_CLI_TIMEOUT_MS });
    } catch (cause) {
      // Idempotent: removing an already-gone container is success, not failure.
      if (cause instanceof ExecError && isNotFound(cause.stderr)) return;
      throw cause;
    }
  }

  async function exec(containerId: string, input: ProviderExecInput): Promise<ProviderExecResult> {
    const args: string[] = ['exec'];
    if (input.cwd) args.push('-w', input.cwd);
    for (const [key, value] of Object.entries(input.env ?? {})) {
      args.push('-e', `${key}=${value}`);
    }
    args.push(containerId, '/bin/sh', '-c', input.command);

    try {
      const { stdout, stderr } = await execFileSafe(bin, args, {
        timeoutMs: input.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
      });
      return { exitCode: 0, stdout, stderr, timedOut: false };
    } catch (cause) {
      if (cause instanceof ExecError) {
        // `code === null` means the LOCAL `docker` CLI process itself was killed
        // (signal, most likely our own timeout) rather than the in-container
        // command exiting non-zero — the honest distinction between "the agent's
        // command failed" and "we gave up waiting on it".
        return { exitCode: cause.code, stdout: cause.stdout, stderr: cause.stderr, timedOut: cause.code === null };
      }
      throw cause;
    }
  }

  return { ping, run, inspect, remove, exec };
}
