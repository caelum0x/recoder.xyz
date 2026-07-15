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
 *
 * The tenant is derived from the authenticated {@link Principal} (org scope wins),
 * NEVER from the body — a caller only acts on their own tenant. Quota exhaustion
 * and every provider fault surface as the truthful `SERVICE_UNAVAILABLE` (503)
 * envelope; nothing is faked live.
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
import { DEPLOY_TARGET_KINDS, type DeployTargetKind } from '../types.js';

export interface CloudRouterDeps {
  readonly tenancy: TenancyService;
  readonly provisioner: SandboxProvisionerService;
  readonly preview: PreviewDeployService;
  readonly mesh: MeshDiagnosticsService;
  readonly fleet: FleetSupervisorService;
  readonly mw: AuthMiddleware;
  readonly logger: Logger;
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
  const { tenancy, provisioner, preview, mesh, fleet, mw, logger, activePreviewCount } = deps;
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
      const resolved = await tenancy.ensure(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
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
      const resolved = await tenancy.ensure(tenantRefOf(principal));
      if (!resolved.ok) {
        sendError(res, resolved.error);
        return;
      }
      const body = parsed.data;
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

  logger.debug('cloud router built');
  return router;
}
