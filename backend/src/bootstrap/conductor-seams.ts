/**
 * Conductor composition-root seams — the small, PURE pieces of the bootstrap →
 * conductor wiring, extracted so they are unit-testable without a full boot
 * (mirrors {@link ./billing-seams.ts} / {@link ./interop-wire-seams.ts} /
 * {@link ./conductor-inference-seam.ts}):
 *
 *   - {@link createCloudSandboxGateway} — the conductor's off-box `daytona`
 *     sandbox gateway ({@link CloudSandboxGatewayPort}) over the Phase-10 cloud
 *     provisioner. Owns the CACHED conductor tenant (a fixed literal id would
 *     never match the auto-provisioned one) and provision/getWorkDir/exec/destroy.
 *     The cloud module is built LATER (Phase-10), so the module is resolved LAZILY
 *     through the `cloudRef` getter — until it is wired the gateway reports
 *     unavailable and the selector falls back to the local substrates.
 *   - {@link createConductorRunSink} — the {@link RunEventSinkPort} that bridges the
 *     conductor run-tailer emission onto the agent-os `RunEventBusPort.ingest`
 *     (`source:'conductor'`); the two ports are structurally different, so this thin
 *     adapter bridges them at the composition root without changing either port.
 *   - {@link createEngineRunSink} — the LATE-BOUND default `OpenfangRunEventSink`
 *     for the engines napi adapter's `launch_run` driver (recoder-a094). Engines
 *     is built BEFORE agent-os, so the sink is created first and the agent-os bus
 *     is attached right after Phase 5a (`source:'engine'`) — in-process openfang
 *     turns then persist to the canonical event log even when the caller threads
 *     no per-call sink. Pre-attach or bus-rejected events are warn-logged
 *     truthfully (visible, never a silent drop).
 *   - {@link createCliMintClosure} — the memoizable `sk_` mint closure the CLI
 *     inference seam ({@link ./conductor-inference-seam.ts}) uses to attribute
 *     substrate-level metering to a stable conductor service subject. Key store /
 *     DB down ⇒ `null` ⇒ the CLI runs unmetered (truthful skip, never a throw).
 *
 * None reads `process.env` or owns cross-domain state; each degrades truthfully.
 */
import type { RunEvent } from '@recoder/agent-os';
import type { Logger } from '../shared/logger.js';
import type { CloudModule, Tenant } from '../domains/cloud/index.js';
import type { CloudSandboxGatewayPort } from '../domains/conductor/ports/cloud-sandbox.port.js';
import type { RunEventSinkPort } from '../domains/conductor/ports/run-event-sink.port.js';
import type { OpenfangRunEventSink } from '../domains/engines/index.js';

/** Deps for the off-box sandbox gateway. */
export interface CloudSandboxGatewayDeps {
  /**
   * Lazily resolve the cloud module (built Phase-10, AFTER the conductor). A
   * getter — not the value — so the late-bind (`cloudRef = cloud`) is observed.
   */
  readonly cloudRef: () => CloudModule | null;
  /**
   * The system tenant conductor off-box runs execute under. `tenancy.ensure`
   * auto-provisions a tenant keyed by this owner and assigns it a real id.
   */
  readonly tenantOwner: string;
  /** Which conductor substrate id this gateway backs. */
  readonly substrateId: 'daytona';
}

/**
 * Build the conductor's off-box sandbox gateway. Truthful + degrade-safe: an
 * unwired/down cloud module ⇒ `isEnabled()`/`isAvailable()` false ⇒ the substrate
 * reports `available:false` and the selector degrades to the local substrates.
 * The resolved tenant is CACHED so provision/exec/destroy all scope to the SAME
 * tenant id.
 */
export function createCloudSandboxGateway(
  deps: CloudSandboxGatewayDeps,
): CloudSandboxGatewayPort {
  const { cloudRef, tenantOwner, substrateId } = deps;
  let conductorTenant: Tenant | null = null;
  const ensureConductorTenant = async (): Promise<Tenant> => {
    const cloud = cloudRef();
    if (!cloud) throw new Error('cloud module not wired');
    if (conductorTenant) return conductorTenant;
    const r = await cloud.tenancy().ensure({ ownerUserId: tenantOwner });
    if (!r.ok) throw new Error(r.error.message);
    conductorTenant = r.value;
    return conductorTenant;
  };
  return {
    substrateId,
    // Enabled once the cloud module is wired; real reachability is the async probe.
    isEnabled: () => cloudRef() !== null,
    isAvailable: async () => {
      const cloud = cloudRef();
      if (!cloud) return false;
      const h = await cloud.provisioner().health();
      return h.status !== 'down';
    },
    provision: async () => {
      const cloud = cloudRef();
      if (!cloud) throw new Error('cloud module not wired');
      const tenant = await ensureConductorTenant();
      const provisioned = await cloud
        .provisioner()
        .provision({ tenant, userId: tenantOwner });
      if (!provisioned.ok) throw new Error(provisioned.error.message);
      return { id: provisioned.value.id };
    },
    getWorkDir: async (sandboxId) => {
      const cloud = cloudRef();
      if (!cloud) return '/';
      const tenant = await ensureConductorTenant();
      const r = await cloud
        .provisioner()
        .execInSandbox(sandboxId, tenant.id, { command: 'pwd' });
      return r.ok ? r.value.stdout.trim() : '/';
    },
    exec: async (sandboxId, command, options) => {
      const cloud = cloudRef();
      if (!cloud) throw new Error('cloud module not wired');
      const tenant = await ensureConductorTenant();
      const r = await cloud.provisioner().execInSandbox(sandboxId, tenant.id, {
        command,
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        ...(options?.timeoutSecs ? { timeoutMs: options.timeoutSecs * 1000 } : {}),
      });
      if (!r.ok) throw new Error(r.error.message);
      return {
        output: `${r.value.stdout}${r.value.stderr}`,
        ...(r.value.exitCode != null ? { exitCode: r.value.exitCode } : {}),
      };
    },
    destroy: async (sandboxId) => {
      const cloud = cloudRef();
      if (!cloud) return;
      const tenant = await ensureConductorTenant();
      await cloud.provisioner().destroy(sandboxId, tenant.id);
    },
  };
}

/** The narrow agent-os RunEvent bus surface the run-sink bridge consumes. */
export interface ConductorRunEventBus {
  ingest(event: RunEvent, source: 'conductor'): Promise<unknown>;
}

/**
 * Bridge the conductor run-tailer's {@link RunEventSinkPort} emission onto the
 * agent-os RunEvent bus (`source:'conductor'`) — the two ports are structurally
 * different; this adapter joins them so NEITHER domain's public port changes.
 */
export function createConductorRunSink(bus: ConductorRunEventBus): RunEventSinkPort {
  return {
    async append(event) {
      await bus.ingest(event, 'conductor');
    },
  };
}

/** The narrow agent-os RunEvent bus surface the engines default-sink bridge ingests onto. */
export interface EngineRunEventBus {
  ingest(
    event: RunEvent,
    source: 'engine',
  ): Promise<{
    readonly accepted: boolean;
    readonly rejection?: { readonly reason: string; readonly message: string };
  }>;
}

/** The late-bound default openfang RunEvent sink handed to the engines napi adapter. */
export interface LateBoundEngineRunSink {
  /** The stable sink instance — safe to hand to `createEnginesModule` before `attach`. */
  readonly sink: OpenfangRunEventSink;
  /** Late-bind the agent-os bus (built AFTER engines) as the persistence target. */
  attach(bus: EngineRunEventBus): void;
}

/**
 * Build the LATE-BOUND default RunEvent sink for the engines openfang `launch_run`
 * driver (recoder-a094). Boot order forces the late-bind: engines is Phase 4,
 * agent-os (the state-of-record bus) is Phase 5a — so the sink is created first
 * and `attach(agentOs.runEventBus())` closes the loop right after 5a. Truthful
 * end to end: an event emitted BEFORE attach (boot-order gap only) and a returned
 * bus rejection are each warn-logged — visible, never a silent audit-trail drop —
 * and a bridge fault never propagates into the agent turn (the driver's `emit`
 * already catches thrown sink faults).
 */
export function createEngineRunSink(logger: Logger): LateBoundEngineRunSink {
  let bus: EngineRunEventBus | null = null;
  return {
    sink: {
      async append(event: RunEvent): Promise<void> {
        if (!bus) {
          logger.warn(
            { eventId: event.eventId, type: event.type, runId: event.runId },
            'openfang RunEvent emitted before the agent-os bus attached — dropped (boot-order gap)',
          );
          return;
        }
        const result = await bus.ingest(event, 'engine');
        if (!result.accepted) {
          logger.warn(
            {
              eventId: event.eventId,
              type: event.type,
              runId: event.runId,
              reason: result.rejection?.reason,
              message: result.rejection?.message,
            },
            'openfang RunEvent ingest rejected by the agent-os bus — not persisted',
          );
        }
      },
    },
    attach(b: EngineRunEventBus): void {
      bus = b;
    },
  };
}

/** The narrow `sk_` mint surface the CLI-inference gateway credential is minted through. */
export interface CliGatewayKeyMinter {
  mint(params: {
    readonly userId: string;
    readonly name: string;
    readonly scopes: readonly string[];
  }): Promise<{ readonly rawKey: string }>;
}

/**
 * Build the CLI inference-metering `sk_` mint closure: ONE stable conductor
 * service credential (`userId:'conductor'`, scope `inference`) the launched CLI
 * presents to the loopback gateway edge. Degrade-truthful: key store / DB down /
 * gate refuse ⇒ `null` (the CLI runs unmetered), NEVER a throw across the seam.
 */
export function createCliMintClosure(
  keys: CliGatewayKeyMinter,
): () => Promise<string | null> {
  return async () => {
    try {
      const minted = await keys.mint({
        userId: 'conductor',
        name: 'conductor-cli-inference-gateway',
        scopes: ['inference'],
      });
      return minted.rawKey;
    } catch {
      // No DB / key store down / gate refuse ⇒ truthful null (CLI runs unmetered).
      return null;
    }
  };
}
