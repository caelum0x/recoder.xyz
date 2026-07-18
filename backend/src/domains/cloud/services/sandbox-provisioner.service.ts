/**
 * `SandboxProvisionerService` — the orchestration that turns a tenant-scoped
 * provision request into a live sandbox, gated by tenancy quota and reconciled
 * against the provider's truth.
 *
 * Flow (doc §3): resolve effective quota → deny-first quota check (sandbox +
 * concurrent) → placement provider selection (first candidate whose adapter is
 * up) → clamp resources to the quota caps → PERSIST the row BEFORE the provider
 * launches (so a restart reconciles instead of leaking) → call the adapter →
 * update status + external id → emit a RunEvent at each transition.
 *
 * Fail-safe law §37: repo down / no available provider / quota exhausted all
 * resolve to a truthful `Err` (never an optimistic launch). A partial failure
 * marks the persisted row `error`, never silently drops it. TTL reaping +
 * reconcile close the loop against orphaned provider state.
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import type { ComponentHealth } from '../../../shared/health-types.js';
import { degraded, healthy, unhealthy } from '../../../shared/health-types.js';
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { SandboxRepository } from '../ports/cloud-repository.port.js';
import type {
  ProviderExecResult,
  SandboxProvider,
} from '../ports/sandbox-provider.port.js';
import { quotaDeniedError, type TenancyService } from './tenancy.service.js';
import {
  PROVIDER_IDS,
  type ProviderId,
  type Sandbox,
  type SandboxResources,
  type SandboxStatus,
  type Tenant,
} from '../types.js';

const SERVICE_NAME = 'cloud.provisioner';

/** Non-reaped states that count against the `maxSandboxes` ceiling. */
const HELD_STATES: readonly SandboxStatus[] = ['pending', 'running', 'stopped', 'error'];
/** States that count against the `maxConcurrent` ceiling. */
const RUNNING_STATES: readonly SandboxStatus[] = ['pending', 'running'];

/**
 * A minimal, LOCAL RunEvent sink (degrade-safe): the provisioner emits a
 * lifecycle event at each transition. Kept local (not the `@recoder/agent-os`
 * `RunEvent` shape) so the cloud domain stays decoupled; bootstrap bridges this
 * to the agent-os run-event emitter. Absent ⇒ events are dropped, never faked.
 */
export interface CloudRunEvent {
  readonly type: 'sandbox.provisioning' | 'sandbox.running' | 'sandbox.error' | 'sandbox.destroyed' | 'sandbox.reaped';
  readonly sandboxId: string;
  readonly tenantId: string;
  readonly runId: string | null;
  readonly provider: ProviderId;
  readonly status: SandboxStatus;
  readonly at: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface CloudRunEventSink {
  emit(event: CloudRunEvent): Promise<void> | void;
}

/** The caller's provision request (tenant already resolved by the edge/caller). */
export interface ProvisionRequest {
  readonly tenant: Tenant;
  readonly userId: string;
  readonly runId?: string | null;
  readonly image?: string | null;
  readonly resources?: Partial<SandboxResources>;
  readonly repo?: string | null;
  readonly branch?: string | null;
  readonly env?: Readonly<Record<string, string>>;
  readonly ttlSeconds?: number | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SandboxProvisionerDeps {
  readonly repo: SandboxRepository;
  readonly tenancy: TenancyService;
  /** The concrete adapters, keyed by id (daytona/e2b/local). */
  readonly providers: Readonly<Partial<Record<ProviderId, SandboxProvider>>>;
  readonly logger: Logger;
  readonly runEvents?: CloudRunEventSink;
  readonly now?: () => Date;
  /** TTL reaper sweep interval (ms). `0` disables the loop (default 60_000). */
  readonly reaperIntervalMs?: number;
}

/** A tenant-scoped in-sandbox command execution request. */
export interface SandboxExecRequest {
  readonly command: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
}

export interface SandboxProvisionerService {
  provision(req: ProvisionRequest): Promise<Result<Sandbox, AppError>>;
  get(sandboxId: string, tenantId: string): Promise<Result<Sandbox, AppError>>;
  list(tenantId: string): Promise<readonly Sandbox[]>;
  destroy(sandboxId: string, tenantId: string): Promise<Result<void, AppError>>;
  /**
   * Run a command inside a live, tenant-owned sandbox (the conductor remote
   * substrate exec seam). Fail-safe: an unknown/foreign/not-running sandbox, an
   * unwired provider, or a provider without exec all resolve to a truthful `Err`
   * — never a fabricated result.
   */
  execInSandbox(
    sandboxId: string,
    tenantId: string,
    input: SandboxExecRequest,
  ): Promise<Result<ProviderExecResult, AppError>>;
  /** Reap every expired sandbox; returns how many were reaped. Never throws. */
  reapExpired(): Promise<number>;
  /** Reconcile persisted rows against provider truth; returns rows corrected. */
  reconcile(tenantId: string): Promise<number>;
  startReaper(): void;
  stop(): void;
  health(): Promise<ComponentHealth>;
}

export function createSandboxProvisionerService(deps: SandboxProvisionerDeps): SandboxProvisionerService {
  const { repo, tenancy, providers, logger, runEvents } = deps;
  const now = deps.now ?? (() => new Date());
  const reaperIntervalMs = deps.reaperIntervalMs ?? 60_000;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function emit(event: CloudRunEvent): Promise<void> {
    if (!runEvents) return;
    try {
      await runEvents.emit(event);
    } catch (cause) {
      // Event emission is best-effort; a sink fault never blocks provisioning.
      logger.warn({ err: cause, type: event.type }, 'cloud run-event emit failed');
    }
  }

  function clampResources(tenant: Tenant, requested?: Partial<SandboxResources>): SandboxResources {
    const capCpu = tenant.quota.cpuMillis;
    const capMem = tenant.quota.memMb;
    const cpu = requested?.cpuMillis ?? capCpu;
    const mem = requested?.memMb ?? capMem;
    return {
      cpuMillis: Math.max(1, Math.min(cpu, capCpu)),
      memMb: Math.max(1, Math.min(mem, capMem)),
    };
  }

  /** Pick the first placement candidate whose adapter reports availability up. */
  async function selectProvider(tenant: Tenant): Promise<Result<SandboxProvider, AppError>> {
    const placement = tenancy.placement(tenant);
    for (const id of placement.providerCandidates) {
      const provider = providers[id];
      if (!provider) continue;
      const a = await provider.availability();
      if (a.status === 'up') return ok(provider);
    }
    return err(
      createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'No sandbox provider is currently available for this tenant tier.',
        { details: { candidates: placement.providerCandidates } },
      ),
    );
  }

  async function provision(req: ProvisionRequest): Promise<Result<Sandbox, AppError>> {
    if (!repo.isAvailable()) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Sandbox store is unavailable.'));
    }
    const { tenant } = req;
    const quota = await tenancy.effectiveQuota(tenant);

    // Deny-first quota: both the total-held and concurrent-running ceilings.
    let heldUsed: number;
    let runningUsed: number;
    try {
      [heldUsed, runningUsed] = await Promise.all([
        repo.countByTenant(tenant.id, HELD_STATES),
        repo.countByTenant(tenant.id, RUNNING_STATES),
      ]);
    } catch (cause) {
      logger.error({ err: cause }, 'provisioner quota count failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Quota usage is temporarily unreadable.', { cause }));
    }
    const sandboxDecision = tenancy.checkQuota(quota, 'sandbox', heldUsed);
    if (!sandboxDecision.allowed) return err(quotaDeniedError(sandboxDecision));
    const concurrentDecision = tenancy.checkQuota(quota, 'concurrent', runningUsed);
    if (!concurrentDecision.allowed) return err(quotaDeniedError(concurrentDecision));

    // Provider selection (placement + availability).
    const selected = await selectProvider(tenant);
    if (!selected.ok) return selected;
    const provider = selected.value;

    const resources = clampResources(tenant, req.resources);
    const expiresAt =
      req.ttlSeconds && req.ttlSeconds > 0
        ? new Date(now().getTime() + req.ttlSeconds * 1000).toISOString()
        : null;
    const id = randomUUID();

    // Persist BEFORE launch (survivability): a restart reconciles this row.
    let row: Sandbox;
    try {
      row = await repo.insert({
        id,
        tenantId: tenant.id,
        userId: req.userId,
        runId: req.runId ?? null,
        provider: provider.id,
        status: 'pending',
        region: tenant.region,
        image: req.image ?? null,
        resources,
        expiresAt,
        metadata: req.metadata ?? {},
      });
    } catch (cause) {
      logger.error({ err: cause }, 'provisioner persist failed');
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Could not persist the sandbox record.', { cause }));
    }

    await emit({
      type: 'sandbox.provisioning',
      sandboxId: id,
      tenantId: tenant.id,
      runId: row.runId,
      provider: provider.id,
      status: 'pending',
      at: now().toISOString(),
    });

    // Launch. A failure marks the row `error` (never silently dropped).
    const result = await provider.provision({
      tenantId: tenant.id,
      userId: req.userId,
      runId: req.runId ?? null,
      region: tenant.region,
      image: req.image ?? null,
      resources,
      repo: req.repo ?? null,
      branch: req.branch ?? null,
      ...(req.env ? { env: req.env } : {}),
      ttlSeconds: req.ttlSeconds ?? null,
      metadata: req.metadata ?? {},
    });

    if (!result.ok) {
      await safeUpdate(id, 'error');
      await emit({
        type: 'sandbox.error',
        sandboxId: id,
        tenantId: tenant.id,
        runId: row.runId,
        provider: provider.id,
        status: 'error',
        at: now().toISOString(),
        detail: { reason: result.error.message },
      });
      return err(result.error);
    }

    const nowIso = now().toISOString();
    await safeUpdate(id, 'running', { externalId: result.value.externalId, lastHeartbeat: nowIso });
    await emit({
      type: 'sandbox.running',
      sandboxId: id,
      tenantId: tenant.id,
      runId: row.runId,
      provider: provider.id,
      status: 'running',
      at: nowIso,
      detail: { externalId: result.value.externalId },
    });

    const updated = await repo.getById(id, tenant.id);
    return ok(updated ?? { ...row, status: 'running', externalId: result.value.externalId, lastHeartbeat: nowIso });
  }

  async function safeUpdate(
    id: string,
    status: SandboxStatus,
    patch?: { externalId?: string | null; lastHeartbeat?: string | null },
  ): Promise<void> {
    try {
      await repo.updateStatus(id, status, patch);
    } catch (cause) {
      logger.error({ err: cause, id, status }, 'provisioner status update failed');
    }
  }

  async function get(sandboxId: string, tenantId: string): Promise<Result<Sandbox, AppError>> {
    if (!repo.isAvailable()) return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Sandbox store is unavailable.'));
    try {
      const row = await repo.getById(sandboxId, tenantId);
      if (!row) return err(createError(ErrorCode.NOT_FOUND, 'Sandbox not found.'));
      return ok(row);
    } catch (cause) {
      return err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Sandbox lookup failed.', { cause }));
    }
  }

  async function list(tenantId: string): Promise<readonly Sandbox[]> {
    if (!repo.isAvailable()) return [];
    try {
      return await repo.listByTenant(tenantId);
    } catch (cause) {
      logger.warn({ err: cause }, 'provisioner list failed');
      return [];
    }
  }

  async function destroy(sandboxId: string, tenantId: string): Promise<Result<void, AppError>> {
    const loaded = await get(sandboxId, tenantId);
    if (!loaded.ok) return err(loaded.error);
    const sandbox = loaded.value;
    const provider = providers[sandbox.provider];
    if (provider && sandbox.externalId) {
      const destroyed = await provider.destroy(sandbox.externalId);
      if (!destroyed.ok) {
        // Truthful: could not confirm teardown with the provider.
        return err(destroyed.error);
      }
    }
    await safeUpdate(sandboxId, 'reaped');
    await emit({
      type: 'sandbox.destroyed',
      sandboxId,
      tenantId,
      runId: sandbox.runId,
      provider: sandbox.provider,
      status: 'reaped',
      at: now().toISOString(),
    });
    return ok(undefined);
  }

  async function execInSandbox(
    sandboxId: string,
    tenantId: string,
    input: SandboxExecRequest,
  ): Promise<Result<ProviderExecResult, AppError>> {
    // Tenant ownership is enforced by `get` (WHERE tenant_id = :tenantId).
    const loaded = await get(sandboxId, tenantId);
    if (!loaded.ok) return err(loaded.error);
    const sandbox = loaded.value;
    if (sandbox.status !== 'running' || !sandbox.externalId) {
      return err(
        createError(ErrorCode.SERVICE_UNAVAILABLE, 'Sandbox is not running — cannot exec.', {
          details: { status: sandbox.status },
        }),
      );
    }
    const provider = providers[sandbox.provider];
    if (!provider || !provider.exec) {
      return err(
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          `Provider '${sandbox.provider}' cannot execute commands in a sandbox.`,
        ),
      );
    }
    return provider.exec({
      externalId: sandbox.externalId,
      command: input.command,
      ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.env ? { env: input.env } : {}),
    });
  }

  async function reapExpired(): Promise<number> {
    if (!repo.isAvailable()) return 0;
    let expired: readonly Sandbox[];
    try {
      expired = await repo.listExpired(now().toISOString());
    } catch (cause) {
      logger.warn({ err: cause }, 'reaper listExpired failed');
      return 0;
    }
    let reaped = 0;
    for (const sandbox of expired) {
      const provider = providers[sandbox.provider];
      if (provider && sandbox.externalId) {
        const r = await provider.destroy(sandbox.externalId);
        if (!r.ok) {
          logger.warn({ id: sandbox.id, err: r.error.message }, 'reaper provider destroy failed; marking reaped anyway');
        }
      }
      await safeUpdate(sandbox.id, 'reaped');
      await emit({
        type: 'sandbox.reaped',
        sandboxId: sandbox.id,
        tenantId: sandbox.tenantId,
        runId: sandbox.runId,
        provider: sandbox.provider,
        status: 'reaped',
        at: now().toISOString(),
      });
      reaped += 1;
    }
    if (reaped > 0) logger.info({ reaped }, 'reaper swept expired sandboxes');
    return reaped;
  }

  async function reconcile(tenantId: string): Promise<number> {
    if (!repo.isAvailable()) return 0;
    let rows: readonly Sandbox[];
    try {
      rows = await repo.listByTenant(tenantId);
    } catch {
      return 0;
    }
    let corrected = 0;
    for (const sandbox of rows) {
      if (!RUNNING_STATES.includes(sandbox.status) || !sandbox.externalId) continue;
      const provider = providers[sandbox.provider];
      if (!provider) continue;
      const r = await provider.get(sandbox.externalId);
      if (!r.ok) {
        if (r.error.code === ErrorCode.NOT_FOUND) {
          await safeUpdate(sandbox.id, 'reaped');
          corrected += 1;
        }
        continue;
      }
      if (r.value.status !== sandbox.status) {
        await safeUpdate(sandbox.id, r.value.status, { lastHeartbeat: now().toISOString() });
        corrected += 1;
      }
    }
    return corrected;
  }

  function startReaper(): void {
    if (timer || reaperIntervalMs <= 0) return;
    timer = setInterval(() => {
      void reapExpired();
    }, reaperIntervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function health(): Promise<ComponentHealth> {
    if (!repo.isAvailable()) {
      return unhealthy(SERVICE_NAME, 'Sandbox store (Postgres) unavailable — provisioning denies (fail safe).');
    }
    const statuses = await Promise.all(
      PROVIDER_IDS.map(async (id) => {
        const provider = providers[id];
        if (!provider) return { id, status: 'down' as const, reason: 'adapter not wired' };
        const a = await provider.availability();
        return { id, status: a.status, ...(a.reason ? { reason: a.reason } : {}) };
      }),
    );
    const anyUp = statuses.some((s) => s.status === 'up');
    if (!anyUp) {
      return degraded(SERVICE_NAME, 'No sandbox provider is currently up.', statuses.map((s) => ({
        name: `provider:${s.id}`,
        status: s.status,
        ...(s.reason ? { reason: s.reason } : {}),
      })));
    }
    return healthy(SERVICE_NAME, {
      providers: statuses.reduce<Record<string, string>>((acc, s) => ((acc[s.id] = s.status), acc), {}),
    });
  }

  return { provision, get, list, destroy, execInSandbox, reapExpired, reconcile, startReaper, stop, health };
}
