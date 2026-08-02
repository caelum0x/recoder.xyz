/**
 * `createCloudSandboxSubstrate` — execution PATH (c): a REMOTE, off-box coding
 * agent inside a cloud sandbox (Daytona / E2B / SSH host), over the cloud
 * domain's sandbox provisioner. This is the substrate that closes the "parallel
 * isolated sandbox execution" story: before it, a `daytona`/`ssh` workspace could
 * only ever report `available:false` because no conductor substrate bridged to
 * the cloud provider adapters.
 *
 * REUSE: it does NOT re-implement the remote clone/launch/capture/exit-sentinel
 * mechanics — those are the proven `@recoder/substrate` `createDaytonaSubstrate`
 * (log-file + `.recoder/agent.exit` sentinel; a transient probe is treated as
 * "still alive / unknown", NEVER a fabricated finished run). This adapter's only
 * job is the SEAM: it adapts the conductor-owned {@link CloudSandboxGatewayPort}
 * (bootstrap builds it over `cloud.provisioner()`) onto the package's
 * `DaytonaClientPort`, then returns the remote substrate with its `id` pinned to
 * the gateway's `substrateId` (`daytona` or `ssh`) so the registry routes both
 * remote runtimes here.
 *
 * The conductor domain stays cloud-free: it depends only on the narrow gateway
 * port, never on the cloud module (seam law / monorepo boundary).
 *
 * Degrade-safe + truthful: the gateway's `isEnabled()`/`isAvailable()` drive the
 * substrate's `available()` — an absent provider key ⇒ `available:false` and the
 * selector degrades to the local substrate; a launch that cannot provision throws
 * (the engine records a `failed` workspace, never a fabricated session).
 */
import {
  createDaytonaSubstrate,
  type ConductorSubstrate,
  type DaytonaClientPort,
  type DaytonaCreateSandboxContext,
  type DaytonaExecOptions,
  type DaytonaExecResult,
  type DaytonaSandboxRef,
  type LoggerPort,
} from '@recoder/substrate';
import type { CloudSandboxGatewayPort } from '../ports/cloud-sandbox.port.js';

/** A no-op logger so the substrate works even when none is injected. */
const NOOP_LOGGER: LoggerPort = {
  info() {},
  warn() {},
  error() {},
};

export interface CreateCloudSandboxSubstrateDeps {
  /** The bootstrap-built bridge to the cloud sandbox provisioner (tenant-bound). */
  readonly gateway: CloudSandboxGatewayPort;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
}

/**
 * Adapt the conductor {@link CloudSandboxGatewayPort} onto the package's
 * `DaytonaClientPort`. The shapes are intentionally 1:1 (output/exitCode +
 * cwd/timeoutSecs), so this is a pure name-bridge — no behavior lives here.
 */
function toDaytonaClient(gateway: CloudSandboxGatewayPort): DaytonaClientPort {
  return {
    isEnabled: (): boolean => gateway.isEnabled(),
    isAvailable: (): Promise<boolean> => gateway.isAvailable(),
    async createSandbox(context?: DaytonaCreateSandboxContext): Promise<DaytonaSandboxRef> {
      // Thread the launching run's id into the provisioner so the sandbox's
      // lifecycle RunEvents carry a resolvable runId (recoder-qyvu).
      const provisioned = await gateway.provision(
        context?.runId !== undefined ? { runId: context.runId } : undefined,
      );
      return { id: provisioned.id };
    },
    getWorkDir: (sandboxId: string): Promise<string> => gateway.getWorkDir(sandboxId),
    async execCommand(
      sandboxId: string,
      command: string,
      options?: DaytonaExecOptions,
    ): Promise<DaytonaExecResult> {
      const result = await gateway.exec(sandboxId, command, {
        ...(options?.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options?.timeoutSecs !== undefined ? { timeoutSecs: options.timeoutSecs } : {}),
      });
      return {
        output: result.output,
        ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
      };
    },
    deleteSandbox: (sandboxId: string): Promise<void> => gateway.destroy(sandboxId),
  };
}

/**
 * Build the remote cloud-sandbox {@link ConductorSubstrate}. Register it via the
 * conductor module's `substrates` array (bootstrap) alongside the CLI + openfang
 * substrates. The returned substrate's `id` is the gateway's `substrateId`, so a
 * `daytona` gateway yields the `daytona` substrate and an `ssh` gateway the `ssh`
 * substrate — both driven by the SAME proven remote mechanics.
 */
export function createCloudSandboxSubstrate(
  deps: CreateCloudSandboxSubstrateDeps,
): ConductorSubstrate {
  const logger = deps.logger ?? NOOP_LOGGER;
  const base = createDaytonaSubstrate({ client: toDaytonaClient(deps.gateway), logger });
  // Pin the substrate id to the gateway's target so `ssh` gateways register as the
  // `ssh` substrate (the package impl hardcodes `daytona`); every other behavior —
  // clone, backgrounded launch, capture, exit-sentinel, diff, teardown — is reused.
  return { ...base, id: deps.gateway.substrateId };
}
