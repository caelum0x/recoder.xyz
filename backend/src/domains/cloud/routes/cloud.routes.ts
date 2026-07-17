/**
 * Cloud routes — the authenticated control-plane surface for the off-box
 * substrate. Mount under `/api/agent-os/cloud` (the edge route table owns the
 * base mount) behind the identity auth middleware.
 *
 *   GET    /tenant               — the caller's tenant (auto-provisioned) + quota + placement
 *   GET    /sandboxes            — list the caller tenant's sandboxes
 *   POST   /sandboxes            — provision a sandbox (quota-gated, mutating)
 *   GET    /sandboxes/:id        — one sandbox (tenant-scoped)
 *   DELETE /sandboxes/:id        — destroy a sandbox (mutating)
 *   POST   /deployments          — deploy a preview (mutating)
 *   GET    /deployments/:id      — deployment status
 *   GET    /deployments/:id/url  — mint a signed, expiring preview URL
 *   GET    /deployments/:id/health — REAL health probe (persisted)
 *   GET    /mesh                 — read-only mesh snapshot
 *   GET    /fleet                — read-only fleet manifest
 *   POST   /fleet/heartbeat      — INTERNAL: a fleet node reports a fresh heartbeat
 *   POST   /fleet/register       — INTERNAL: a fleet node registers into the manifest
 *   GET    /domains              — list the caller tenant's custom domains
 *   POST   /domains              — attach a custom domain (mutating; mints DNS challenge)
 *   GET    /domains/:id          — one custom domain (tenant-scoped)
 *   POST   /domains/:id/verify   — re-check DNS/TLS ownership (mutating)
 *   DELETE /domains/:id          — detach a custom domain (mutating)
 *
 * The tenant is derived from the authenticated {@link Principal} (org scope wins),
 * NEVER from the body — a caller only acts on their own tenant. Quota exhaustion
 * and every provider fault surface as the truthful `SERVICE_UNAVAILABLE` (503)
 * envelope; nothing is faked live.
 *
 * GOVERNANCE: every WRITE edge (sandbox provision/destroy, deployment create,
 * preview-URL mint, tenant auto-provision) passes the injected
 * {@link CloudGovernanceGatePort} `decide → audit` seam BEFORE mutating —
 * exactly the conductor/identity write pattern. A blocking verdict returns a
 * truthful 403; an ERRORING gate fails CLOSED (503, `AUTHZ_SERVICE_ERROR`);
 * an absent gate (not yet injected by bootstrap) degrades open with a warn log.
 * Successful writes are sealed into the durable audit chain best-effort.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { createError, ErrorCode, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { TenancyService, TenantRef } from '../services/tenancy.service.js';
import type { SandboxProvisionerService } from '../services/sandbox-provisioner.service.js';
import type { PreviewDeployService } from '../services/preview-deploy.service.js';
import type { MeshDiagnosticsService } from '../services/mesh-diagnostics.service.js';
import type { FleetSupervisorService } from '../services/fleet-supervisor.service.js';
import type { DomainsService } from '../services/domains.service.js';
import type { CloudGovernanceGatePort } from '../ports/governance-gate.port.js';
import { guardCloudWrite, recordCloudAudit } from '../services/cloud-write-gate.js';
import { DEPLOY_TARGET_KINDS, type DeployTargetKind } from '../types.js';

export interface CloudRouterDeps {
  readonly tenancy: TenancyService;
  readonly provisioner: SandboxProvisionerService;
  readonly preview: PreviewDeployService;
  readonly mesh: MeshDiagnosticsService;
  readonly fleet: FleetSupervisorService;
  readonly domains: DomainsService;
  readonly mw: AuthMiddleware;
  readonly logger: Logger;
  /**
   * Phase-3 governance gate (capability token, injected by bootstrap). Guards
   * EVERY write edge via `decide → audit`. Absent ⇒ degrade-open (warn-logged
   * auth-only writes) until the serial wiring lands; an erroring gate fails
   * CLOSED — see `services/cloud-write-gate.ts`.
   */
  readonly gate?: CloudGovernanceGatePort;
  /**
   * Active (`building|live`) preview count for a tenant, driving the deny-first
   * preview quota gate. Supplied by the composer over the deployment repo;
   * MUST return `NaN` on an unreadable count so `checkQuota` denies (fail-safe).
   */
  readonly activePreviewCount: (tenantId: string) => Promise<number>;
}

const provisionBodySchema = z.object({
  image: z.string().min(1).max(512).optional(),
  runId: z.string().min(1).max(128).optional(),
  repo: z.string().min(1).max(512).optional(),
  branch: z.string().min(1).max(256).optional(),
  ttlSeconds: z.number().int().positive().max(86_400).optional(),
  resources: z
    .object({ cpuMillis: z.number().int().positive().optional(), memMb: z.number().int().positive().optional() })
    .optional(),
  env: z.record(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const deployBodySchema = z.object({
  target: z.enum(DEPLOY_TARGET_KINDS as unknown as [DeployTargetKind, ...DeployTargetKind[]]).default('preview'),
  runId: z.string().min(1).max(128).optional(),
  sandboxId: z.string().min(1).max(128).optional(),
  commitSha: z.string().min(1).max(128).optional(),
  source: z.string().min(1).max(1024).optional(),
  ttlSeconds: z.number().int().positive().max(604_800).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const domainBodySchema = z.object({
  hostname: z.string().min(1).max(253),
});

const fleetCapacitySchema = z.object({
  slotsTotal: z.number().int().nonnegative(),
  slotsUsed: z.number().int().nonnegative(),
  cpuMillis: z.number().int().nonnegative(),
  memMb: z.number().int().nonnegative(),
});

const FLEET_NODE_KINDS = ['sandbox', 'preview', 'mesh'] as const;
const FLEET_NODE_STATUSES = ['up', 'down', 'draining'] as const;

const fleetHeartbeatSchema = z.object({
  id: z.string().min(1).max(128),
  kind: z.enum(FLEET_NODE_KINDS),
  capacity: fleetCapacitySchema,
  tenantId: z.string().min(1).max(128).nullish(),
});

const fleetRegisterSchema = fleetHeartbeatSchema.extend({
  status: z.enum(FLEET_NODE_STATUSES).default('down'),
  manifest: z.record(z.unknown()).optional(),
});

function principalOf(req: Request): Principal | null {
  return req.principal && !req.principal.isAnonymous ? req.principal : null;
}

/** The tenant ref derived from a principal (org scope wins over the user). */
function tenantRefOf(principal: Principal): TenantRef & { ownerUserId: string } {
  return {
    ownerUserId: principal.userId,
    ...(principal.orgId ? { orgId: principal.orgId } : {}),
  };
}

export function buildCloudRouter(deps: CloudRouterDeps): Router {
  const { tenancy, provisioner, preview, mesh, fleet, domains, mw, logger, gate, activePreviewCount } = deps;
  const router = Router();

  // --- Tenant ---
  router.get(
    '/tenant',
    mw.authenticate,
    asyncHandler(async (req, res) => {
      const principal = req.principal;
      if (!principal || principal.isAnonymous) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      // Tenant auto-provision is a WRITE: gate it only when no tenant exists yet
      // (a plain resolve stays an ungated read).
      const existing = await tenancy.resolve(tenantRefOf(principal));
      if (!existing.ok && existing.error.code !== ErrorCode.NOT_FOUND) {
        sendError(res, existing.error);
        return;
      }
      const guarded = existing.ok
        ? undefined
        : await guardCloudWrite(gate, 'cloud.tenant.provision', principal, {
            target: { environment: 'cloud' },
            metadata: { edge: 'tenant.ensure', orgId: principal.orgId ?? null },
          }, logger);
      if (guarded && !guarded.allowed) {
        sendError(res, guarded.error);
        return;
      }
      const resolved = existing.ok ? existing : await tenancy.ensure(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      if (guarded?.allowed) {
        await recordCloudAudit(gate, 'cloud.tenant.provision', principal, guarded.verdict, {
          tenantId: resolved.value.id,
          tier: resolved.value.tier,
        }, logger);
      }
      const tenant = resolved.value;
      const quota = await tenancy.effectiveQuota(tenant);
      sendSuccess(res, { tenant, effectiveQuota: quota, placement: tenancy.placement(tenant) });
    }),
  );

  // --- Sandboxes ---
  router.get(
    '/sandboxes',
    mw.authenticate,
    asyncHandler(async (req, res) => {
      const principal = req.principal;
      if (!principal || principal.isAnonymous) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const resolved = await tenancy.resolve(tenantRefOf(principal));
      if (!resolved.ok) {
        // No tenant yet ⇒ empty list (not an error) for a fresh subject.
        if (resolved.error.code === ErrorCode.NOT_FOUND) {
          sendSuccess(res, { sandboxes: [] });
          return;
        }
        sendError(res, resolved.error);
        return;
      }
      const sandboxes = await provisioner.list(resolved.value.id);
      sendSuccess(res, { sandboxes });
    }),
  );

  router.post(
    '/sandboxes',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = principalOf(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const parsed = provisionBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'invalid body'));
        return;
      }
      const body = parsed.data;
      // Governance BEFORE any mutation (including the subordinate tenant ensure).
      const guarded = await guardCloudWrite(gate, 'cloud.sandbox.provision', principal, {
        target: { environment: 'cloud' },
        ...(body.runId ? { runId: body.runId } : {}),
        metadata: { edge: 'sandbox.provision', image: body.image ?? null, repo: body.repo ?? null, branch: body.branch ?? null },
      }, logger);
      if (!guarded.allowed) {
        sendError(res, guarded.error);
        return;
      }
      const resolved = await tenancy.ensure(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const result = await provisioner.provision({
        tenant: resolved.value,
        userId: principal.userId,
        runId: body.runId ?? null,
        image: body.image ?? null,
        repo: body.repo ?? null,
        branch: body.branch ?? null,
        ttlSeconds: body.ttlSeconds ?? null,
        ...(body.resources ? { resources: body.resources } : {}),
        ...(body.env ? { env: body.env } : {}),
        ...(body.metadata ? { metadata: body.metadata } : {}),
      });
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      await recordCloudAudit(gate, 'cloud.sandbox.provision', principal, guarded.verdict, {
        sandboxId: result.value.id,
        tenantId: resolved.value.id,
        provider: result.value.provider,
      }, logger);
      sendSuccess(res, result.value, { statusCode: 201 });
    }),
  );

  router.get(
    '/sandboxes/:id',
    mw.authenticate,
    asyncHandler(async (req, res) => {
      const principal = req.principal;
      if (!principal || principal.isAnonymous) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const resolved = await tenancy.resolve(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const result = await provisioner.get(req.params.id, resolved.value.id);
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      sendSuccess(res, result.value);
    }),
  );

  router.delete(
    '/sandboxes/:id',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = principalOf(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const guarded = await guardCloudWrite(gate, 'cloud.sandbox.destroy', principal, {
        target: { environment: 'cloud' },
        metadata: { edge: 'sandbox.destroy', sandboxId: req.params.id },
      }, logger);
      if (!guarded.allowed) {
        sendError(res, guarded.error);
        return;
      }
      const resolved = await tenancy.resolve(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const result = await provisioner.destroy(req.params.id, resolved.value.id);
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      await recordCloudAudit(gate, 'cloud.sandbox.destroy', principal, guarded.verdict, {
        sandboxId: req.params.id,
        tenantId: resolved.value.id,
      }, logger);
      sendSuccess(res, { id: req.params.id, destroyed: true });
    }),
  );

  // --- Preview deployments ---
  router.post(
    '/deployments',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = principalOf(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const parsed = deployBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'invalid body'));
        return;
      }
      // Governance BEFORE any mutation (including the subordinate tenant ensure).
      const guarded = await guardCloudWrite(gate, 'cloud.deployment.create', principal, {
        target: { environment: parsed.data.target },
        ...(parsed.data.runId ? { runId: parsed.data.runId } : {}),
        metadata: {
          edge: 'deployment.create',
          deployTarget: parsed.data.target,
          sandboxId: parsed.data.sandboxId ?? null,
          commitSha: parsed.data.commitSha ?? null,
        },
      }, logger);
      if (!guarded.allowed) {
        sendError(res, guarded.error);
        return;
      }
      const resolved = await tenancy.ensure(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const tenant = resolved.value;
      // Deny-first preview quota before any target work.
      const quota = await tenancy.effectiveQuota(tenant);
      const decision = tenancy.checkQuota(quota, 'preview', await safePreviewCount(tenant.id));
      if (!decision.allowed) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, `Preview quota exhausted (${decision.used}/${decision.limit}).`, {
          details: { kind: decision.kind, reason: decision.reason },
        }));
        return;
      }
      const body = parsed.data;
      const result = await preview.deploy({
        tenantId: tenant.id,
        target: body.target,
        runId: body.runId ?? null,
        sandboxId: body.sandboxId ?? null,
        commitSha: body.commitSha ?? null,
        source: body.source ?? null,
        ttlSeconds: body.ttlSeconds ?? null,
        ...(body.metadata ? { metadata: body.metadata } : {}),
      });
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      await recordCloudAudit(gate, 'cloud.deployment.create', principal, guarded.verdict, {
        deploymentId: result.value.id,
        tenantId: tenant.id,
        deployTarget: body.target,
      }, logger);
      sendSuccess(res, result.value, { statusCode: 201 });
    }),
  );

  /** Active preview count for the quota gate; `NaN` on error ⇒ checkQuota denies. */
  async function safePreviewCount(tenantId: string): Promise<number> {
    try {
      return await activePreviewCount(tenantId);
    } catch (cause) {
      logger.warn({ err: cause, tenantId }, 'preview count failed; denying (fail-safe)');
      return Number.NaN;
    }
  }

  router.get(
    '/deployments/:id',
    mw.authenticate,
    asyncHandler(async (req, res) => {
      const principal = req.principal;
      if (!principal || principal.isAnonymous) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const resolved = await tenancy.resolve(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const result = await preview.status(req.params.id, resolved.value.id);
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      sendSuccess(res, result.value);
    }),
  );

  router.get(
    '/deployments/:id/url',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = principalOf(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      // Minting a signed preview URL is a WRITE (token ledger row + a live
      // capability URL) — governance decides BEFORE the mint.
      const guarded = await guardCloudWrite(gate, 'cloud.preview_url.mint', principal, {
        target: { environment: 'cloud' },
        metadata: { edge: 'preview_url.mint', deploymentId: req.params.id },
      }, logger);
      if (!guarded.allowed) {
        sendError(res, guarded.error);
        return;
      }
      const resolved = await tenancy.resolve(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const result = await preview.getSignedUrl(req.params.id, resolved.value.id);
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      // Seal the MINT (never the signed URL / token value) into the audit chain.
      await recordCloudAudit(gate, 'cloud.preview_url.mint', principal, guarded.verdict, {
        deploymentId: req.params.id,
        tenantId: resolved.value.id,
        exp: result.value.claims.exp,
      }, logger);
      sendSuccess(res, result.value);
    }),
  );

  router.get(
    '/deployments/:id/health',
    mw.authenticate,
    asyncHandler(async (req, res) => {
      const principal = req.principal;
      if (!principal || principal.isAnonymous) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const resolved = await tenancy.resolve(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const result = await preview.health(req.params.id, resolved.value.id);
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      sendSuccess(res, result.value);
    }),
  );

  // --- Mesh (read-only) ---
  router.get(
    '/mesh',
    mw.authenticate,
    asyncHandler(async (_req, res) => {
      const snapshot = await mesh.status();
      sendSuccess(res, snapshot);
    }),
  );

  // --- Fleet (read-only) ---
  router.get(
    '/fleet',
    mw.authenticate,
    asyncHandler(async (_req, res) => {
      const nodes = await fleet.list();
      sendSuccess(res, { nodes });
    }),
  );

  // --- Fleet heartbeat ingest (INTERNAL: fleet nodes report in over the
  // INTERNAL_SERVICE_KEY, never a user session). A node marks itself `up` with a
  // fresh heartbeat; the supervisor demotes it to `down` when the beat goes
  // stale. Truthful degrade: a `null` from the supervisor (store down) surfaces
  // as a `SERVICE_UNAVAILABLE` — the ingest never fakes a persisted node. ---
  router.post(
    '/fleet/heartbeat',
    mw.requireInternal,
    asyncHandler(async (req, res) => {
      const parsed = fleetHeartbeatSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'invalid body'));
        return;
      }
      const b = parsed.data;
      const node = await fleet.heartbeat(b.id, b.kind, b.capacity, b.tenantId ?? null);
      if (!node) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Fleet store unavailable — heartbeat not recorded.'));
        return;
      }
      sendSuccess(res, node);
    }),
  );

  router.post(
    '/fleet/register',
    mw.requireInternal,
    asyncHandler(async (req, res) => {
      const parsed = fleetRegisterSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'invalid body'));
        return;
      }
      const b = parsed.data;
      const node = await fleet.register({
        id: b.id,
        kind: b.kind,
        status: b.status,
        capacity: b.capacity,
        tenantId: b.tenantId ?? null,
        ...(b.manifest ? { manifest: b.manifest } : {}),
      });
      if (!node) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Fleet store unavailable — node not registered.'));
        return;
      }
      sendSuccess(res, node, { statusCode: 201 });
    }),
  );

  // --- Custom domains (CRUD + DNS/TLS verify) ---
  router.get(
    '/domains',
    mw.authenticate,
    asyncHandler(async (req, res) => {
      const principal = req.principal;
      if (!principal || principal.isAnonymous) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const resolved = await tenancy.resolve(tenantRefOf(principal));
      if (!resolved.ok) {
        if (resolved.error.code === ErrorCode.NOT_FOUND) {
          sendSuccess(res, { domains: [] });
          return;
        }
        sendError(res, resolved.error);
        return;
      }
      const records = await domains.list(resolved.value.id);
      sendSuccess(res, { domains: records });
    }),
  );

  router.get(
    '/domains/:id',
    mw.authenticate,
    asyncHandler(async (req, res) => {
      const principal = req.principal;
      if (!principal || principal.isAnonymous) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const resolved = await tenancy.resolve(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const result = await domains.get(req.params.id, resolved.value.id);
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      sendSuccess(res, result.value);
    }),
  );

  router.post(
    '/domains',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = principalOf(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const parsed = domainBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'invalid body'));
        return;
      }
      const guarded = await guardCloudWrite(gate, 'cloud.domain.add', principal, {
        target: { environment: 'cloud' },
        metadata: { edge: 'domain.add', hostname: parsed.data.hostname },
      }, logger);
      if (!guarded.allowed) {
        sendError(res, guarded.error);
        return;
      }
      const resolved = await tenancy.ensure(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const result = await domains.add({ tenantId: resolved.value.id, hostname: parsed.data.hostname });
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      await recordCloudAudit(gate, 'cloud.domain.add', principal, guarded.verdict, {
        domainId: result.value.id,
        tenantId: resolved.value.id,
        hostname: result.value.hostname,
      }, logger);
      sendSuccess(res, result.value, { statusCode: 201 });
    }),
  );

  router.post(
    '/domains/:id/verify',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = principalOf(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const guarded = await guardCloudWrite(gate, 'cloud.domain.verify', principal, {
        target: { environment: 'cloud' },
        metadata: { edge: 'domain.verify', domainId: req.params.id },
      }, logger);
      if (!guarded.allowed) {
        sendError(res, guarded.error);
        return;
      }
      const resolved = await tenancy.resolve(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const result = await domains.verify(req.params.id, resolved.value.id);
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      await recordCloudAudit(gate, 'cloud.domain.verify', principal, guarded.verdict, {
        domainId: result.value.id,
        tenantId: resolved.value.id,
        verificationStatus: result.value.verificationStatus,
        tlsStatus: result.value.tlsStatus,
      }, logger);
      sendSuccess(res, result.value);
    }),
  );

  router.delete(
    '/domains/:id',
    mw.authenticateMutating,
    asyncHandler(async (req, res) => {
      const principal = principalOf(req);
      if (!principal) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const guarded = await guardCloudWrite(gate, 'cloud.domain.remove', principal, {
        target: { environment: 'cloud' },
        metadata: { edge: 'domain.remove', domainId: req.params.id },
      }, logger);
      if (!guarded.allowed) {
        sendError(res, guarded.error);
        return;
      }
      const resolved = await tenancy.resolve(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const result = await domains.remove(req.params.id, resolved.value.id);
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      await recordCloudAudit(gate, 'cloud.domain.remove', principal, guarded.verdict, {
        domainId: req.params.id,
        tenantId: resolved.value.id,
      }, logger);
      sendSuccess(res, result.value);
    }),
  );

  logger.debug('cloud router built');
  return router;
}
