/**
 * Cloud WRITE MCP tools — the governed mutation surface an agent uses to act on
 * the off-box substrate: provision/destroy a sandbox and attach/verify/detach a
 * custom domain. Registered as part of the `cloud` server into the interop-gated
 * MCP host alongside the read-only introspection tools.
 *
 * DEFENCE IN DEPTH: every call already passed the host boundary's
 * `authorize→risk→policy→audit` interop chain, but each write tool ADDITIONALLY
 * runs the injected {@link CloudGovernanceGatePort} `decide → audit` seam — the
 * SAME gate the `/api/agent-os/cloud` edges use — so an MCP-initiated mutation is
 * governed identically to an HTTP one. A blocking verdict returns a truthful
 * `{ ok: false, effect, reason }` (never throws a policy outcome); an ERRORING
 * gate fails CLOSED; an ABSENT gate degrades open with a warn log.
 *
 * SECURITY — TENANT SUBJECT BINDING: the subject is derived from the
 * HOST-AUTHORIZED {@link McpToolCaller} (`caller.userId`/`orgId`), NEVER from
 * free-form `args`. A non-privileged caller is bound to its OWN tenant; an
 * args-supplied subject (`userId`/`orgId`/`tenantId`) is honoured ONLY for a
 * caller carrying an `admin`/`internal` scope. Before the governance `decide`,
 * the caller is verified to own / belong to the resolved tenant — so a caller
 * can never provision/destroy/attach against a tenant that is not theirs
 * (cross-tenant resource + billing abuse). A missing caller, a cross-tenant
 * subject, or an unresolvable tenant yields a truthful error, never a guessed
 * identity or a faked mutation.
 */
import type { McpToolRegistration, McpToolCaller } from '../../../shared/module-base.js';
import type { Logger } from '../../../shared/logger.js';
import { createError, ErrorCode, type AppError } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';
import type { DeployTargetKind, Tenant } from '../types.js';
import { DEPLOY_TARGET_KINDS } from '../types.js';
import type { TenancyService, TenantRef } from '../services/tenancy.service.js';
import type { SandboxProvisionerService } from '../services/sandbox-provisioner.service.js';
import type { DomainsService } from '../services/domains.service.js';
import type { PreviewDeployService } from '../services/preview-deploy.service.js';
import type { CloudGovernanceGatePort, GovernanceAction, GateDecisionContext } from '../ports/governance-gate.port.js';
import { guardCloudWrite, recordCloudAudit } from '../services/cloud-write-gate.js';

export interface CloudWriteMcpDeps {
  readonly tenancy: TenancyService;
  readonly provisioner: SandboxProvisionerService;
  readonly domains: DomainsService;
  /** The preview surface: governed deploy + signed-URL (token) mint. */
  readonly preview: PreviewDeployService;
  readonly logger: Logger;
  /** The injected governance gate; absent ⇒ degrade-open (warn-logged, auth-elsewhere). */
  readonly gate?: CloudGovernanceGatePort;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Scopes that let a caller act on a subject OTHER than themselves (ops / service). */
const PRIVILEGED_SCOPES: readonly string[] = ['admin', 'internal'];

/** True when the authorized caller may target an args-named (cross-tenant) subject. */
function isPrivileged(caller: McpToolCaller): boolean {
  return (caller.scopes ?? []).some((scope) => PRIVILEGED_SCOPES.includes(scope));
}

/** The tenant ref for the caller's OWN tenant (resolve/ensure by their identity). */
function callerRef(caller: McpToolCaller): TenantRef & { ownerUserId: string } {
  return {
    ownerUserId: caller.userId,
    ...(caller.orgId ? { orgId: caller.orgId } : {}),
  };
}

/**
 * A tenant ref an admin/internal caller named in args (`orgId`/`tenantId` win over
 * `userId`), or `null` when no subject was supplied. Only ever consulted for a
 * privileged caller — a non-privileged caller is always bound to {@link callerRef}.
 */
function subjectRefFromArgs(raw: unknown): (TenantRef & { ownerUserId: string }) | null {
  const args = (raw ?? {}) as Record<string, unknown>;
  const tenantId = str(args.tenantId);
  const orgId = str(args.orgId);
  const userId = str(args.userId);
  if (!userId && !orgId && !tenantId) return null;
  return {
    ownerUserId: userId ?? '',
    ...(orgId ? { orgId } : {}),
    ...(tenantId ? { tenantId } : {}),
  };
}

/** Does the authorized caller own / belong to the resolved tenant? */
function callerOwnsTenant(caller: McpToolCaller, tenant: Tenant): boolean {
  if (tenant.ownerUserId && tenant.ownerUserId === caller.userId) return true;
  return Boolean(tenant.orgId && caller.orgId && tenant.orgId === caller.orgId);
}

/** The governed actor for an MCP write: the resolved tenant's owner. */
function principalOfTenant(tenant: Tenant): Principal {
  return {
    userId: tenant.ownerUserId,
    ...(tenant.orgId ? { orgId: tenant.orgId } : {}),
    scopes: ['write'],
    kind: 'apikey',
    isAnonymous: false,
    raw: null,
  };
}

/** A serialized error envelope for an MCP tool (never throws a policy outcome). */
function errorEnvelope(error: AppError): { ok: false; error: string; code: string } {
  return { ok: false, error: error.message, code: error.code };
}

/** Coerce an args-named deploy target to a known kind (defaults to `preview`). */
function deployTargetKind(raw: unknown): DeployTargetKind {
  const value = str((raw as { target?: unknown })?.target);
  return value && (DEPLOY_TARGET_KINDS as readonly string[]).includes(value)
    ? (value as DeployTargetKind)
    : 'preview';
}

export function buildCloudWriteMcpTools(deps: CloudWriteMcpDeps): readonly McpToolRegistration[] {
  const { tenancy, provisioner, domains, preview, logger, gate } = deps;

  /**
   * Resolve (optionally auto-provisioning) the tenant + a governance decision for
   * an MCP write. The tenant SUBJECT is bound to the host-authorized `caller`
   * (never to free-form args): a non-privileged caller acts on its OWN tenant; an
   * args-named subject is honoured only for an `admin`/`internal` caller, and the
   * caller is verified to own the resolved tenant before `decide`. Returns either
   * the tenant+principal to proceed with, or the truthful error envelope.
   */
  async function authorize(
    raw: unknown,
    caller: McpToolCaller | undefined,
    action: GovernanceAction,
    metadata: Readonly<Record<string, unknown>>,
    opts: { ensure?: boolean } = {},
  ): Promise<
    | { ok: true; tenant: Tenant; principal: Principal; verdict: Awaited<ReturnType<CloudGovernanceGatePort['decide']>> | undefined }
    | { ok: false; envelope: Record<string, unknown> }
  > {
    // 1. Require an authenticated caller — never guess an identity from args.
    if (!caller || !str(caller.userId)) {
      return {
        ok: false,
        envelope: errorEnvelope(
          createError(ErrorCode.AUTH_REQUIRED, 'Cloud write requires an authenticated caller.'),
        ),
      };
    }
    // 2. Derive the subject from the caller. Only a privileged (admin/internal)
    //    caller may target an args-named subject; everyone else is bound to self.
    const privileged = isPrivileged(caller);
    const ref: TenantRef & { ownerUserId: string } = privileged
      ? subjectRefFromArgs(raw) ?? callerRef(caller)
      : callerRef(caller);

    const resolved = opts.ensure ? await tenancy.ensure(ref) : await tenancy.resolve(ref);
    if (!resolved.ok) return { ok: false, envelope: errorEnvelope(resolved.error) };
    const tenant = resolved.value;

    // 3. Cross-tenant guard (defence in depth): a non-privileged caller may only
    //    act on a tenant they own / belong to — never someone else's.
    if (!privileged && !callerOwnsTenant(caller, tenant)) {
      return {
        ok: false,
        envelope: {
          ...errorEnvelope(
            createError(
              ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
              'Cross-tenant cloud write refused: caller is not a member of the target tenant.',
            ),
          ),
          effect: 'blocked',
        },
      };
    }

    const principal = principalOfTenant(tenant);
    const ctx: GateDecisionContext = { target: { environment: 'cloud' }, metadata };
    const guarded = await guardCloudWrite(gate, action, principal, ctx, logger);
    if (!guarded.allowed) {
      return { ok: false, envelope: { ...errorEnvelope(guarded.error), effect: 'blocked' } };
    }
    return { ok: true, tenant, principal, verdict: guarded.verdict };
  }

  return [
    {
      name: 'cloud_sandbox_provision',
      description: 'Provision a governed off-box sandbox for the authorized caller (quota-gated, mutating).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const args = (raw ?? {}) as Record<string, unknown>;
        const auth = await authorize(raw, caller, 'cloud.sandbox.provision', {
          via: 'mcp',
          image: str(args.image) ?? null,
          repo: str(args.repo) ?? null,
        }, { ensure: true });
        if (!auth.ok) return auth.envelope;
        const result = await provisioner.provision({
          tenant: auth.tenant,
          userId: auth.principal.userId,
          runId: str(args.runId) ?? null,
          image: str(args.image) ?? null,
          repo: str(args.repo) ?? null,
          branch: str(args.branch) ?? null,
          ttlSeconds: typeof args.ttlSeconds === 'number' ? args.ttlSeconds : null,
        });
        if (!result.ok) return errorEnvelope(result.error);
        await recordCloudAudit(gate, 'cloud.sandbox.provision', auth.principal, auth.verdict, {
          via: 'mcp',
          sandboxId: result.value.id,
          tenantId: auth.tenant.id,
          provider: result.value.provider,
        }, logger);
        return { ok: true, sandbox: { id: result.value.id, provider: result.value.provider, status: result.value.status } };
      },
    },
    {
      name: 'cloud_sandbox_destroy',
      description: "Destroy one of the caller's sandboxes (mutating, governed).",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const sandboxId = str((raw as { sandboxId?: unknown })?.sandboxId);
        if (!sandboxId) return { ok: false, error: 'sandboxId is required' };
        const auth = await authorize(raw, caller, 'cloud.sandbox.destroy', { via: 'mcp', sandboxId });
        if (!auth.ok) return auth.envelope;
        const result = await provisioner.destroy(sandboxId, auth.tenant.id);
        if (!result.ok) return errorEnvelope(result.error);
        await recordCloudAudit(gate, 'cloud.sandbox.destroy', auth.principal, auth.verdict, {
          via: 'mcp',
          sandboxId,
          tenantId: auth.tenant.id,
        }, logger);
        return { ok: true, sandboxId, destroyed: true };
      },
    },
    {
      name: 'cloud_preview_deploy',
      description: 'Deploy a run artifact to a governed preview target for the authorized caller (persists a deployment; mutating, governed).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const args = (raw ?? {}) as Record<string, unknown>;
        const target = deployTargetKind(raw);
        const auth = await authorize(raw, caller, 'cloud.preview.deploy', {
          via: 'mcp',
          target,
          runId: str(args.runId) ?? null,
        }, { ensure: true });
        if (!auth.ok) return auth.envelope;
        const result = await preview.deploy({
          tenantId: auth.tenant.id,
          target,
          runId: str(args.runId) ?? null,
          sandboxId: str(args.sandboxId) ?? null,
          commitSha: str(args.commitSha) ?? null,
          source: str(args.source) ?? null,
          ttlSeconds: typeof args.ttlSeconds === 'number' ? args.ttlSeconds : null,
        });
        if (!result.ok) return errorEnvelope(result.error);
        await recordCloudAudit(gate, 'cloud.preview.deploy', auth.principal, auth.verdict, {
          via: 'mcp',
          deploymentId: result.value.id,
          tenantId: auth.tenant.id,
          target: result.value.target,
          status: result.value.status,
        }, logger);
        return {
          ok: true,
          deployment: {
            id: result.value.id,
            status: result.value.status,
            target: result.value.target,
            previewBaseUrl: result.value.previewBaseUrl,
            healthStatus: result.value.healthStatus,
            expiresAt: result.value.expiresAt,
          },
        };
      },
    },
    {
      name: 'cloud_preview_url',
      description: "Mint a signed, expiring preview URL for one of the caller's deployments (ledgers the token; mutating, governed).",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const deploymentId = str((raw as { deploymentId?: unknown })?.deploymentId);
        if (!deploymentId) return { ok: false, error: 'deploymentId is required' };
        const auth = await authorize(raw, caller, 'cloud.preview.url', { via: 'mcp', deploymentId });
        if (!auth.ok) return auth.envelope;
        const result = await preview.getSignedUrl(deploymentId, auth.tenant.id);
        if (!result.ok) return errorEnvelope(result.error);
        // Audit sanitized metadata only — NEVER the signed URL / raw token.
        await recordCloudAudit(gate, 'cloud.preview.url', auth.principal, auth.verdict, {
          via: 'mcp',
          deploymentId,
          tenantId: auth.tenant.id,
          exp: result.value.claims.exp,
        }, logger);
        return {
          ok: true,
          preview: {
            url: result.value.url,
            expiresAt: new Date(result.value.claims.exp * 1000).toISOString(),
          },
        };
      },
    },
    {
      name: 'cloud_domain_add',
      description: 'Attach a custom domain to the caller (mints DNS challenge records; mutating, governed).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const hostname = str((raw as { hostname?: unknown })?.hostname);
        if (!hostname) return { ok: false, error: 'hostname is required' };
        const auth = await authorize(raw, caller, 'cloud.domain.add', { via: 'mcp', hostname }, { ensure: true });
        if (!auth.ok) return auth.envelope;
        const result = await domains.add({ tenantId: auth.tenant.id, hostname });
        if (!result.ok) return errorEnvelope(result.error);
        await recordCloudAudit(gate, 'cloud.domain.add', auth.principal, auth.verdict, {
          via: 'mcp',
          domainId: result.value.id,
          tenantId: auth.tenant.id,
          hostname: result.value.hostname,
        }, logger);
        return {
          ok: true,
          domain: {
            id: result.value.id,
            hostname: result.value.hostname,
            verificationStatus: result.value.verificationStatus,
            tlsStatus: result.value.tlsStatus,
            dnsRecords: result.value.dnsRecords,
          },
        };
      },
    },
    {
      name: 'cloud_domain_verify',
      description: 'Re-check DNS/TLS ownership for a custom domain (mutating, governed; truthful when unconfigured).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const domainId = str((raw as { domainId?: unknown })?.domainId);
        if (!domainId) return { ok: false, error: 'domainId is required' };
        const auth = await authorize(raw, caller, 'cloud.domain.verify', { via: 'mcp', domainId });
        if (!auth.ok) return auth.envelope;
        const result = await domains.verify(domainId, auth.tenant.id);
        if (!result.ok) return errorEnvelope(result.error);
        await recordCloudAudit(gate, 'cloud.domain.verify', auth.principal, auth.verdict, {
          via: 'mcp',
          domainId: result.value.id,
          tenantId: auth.tenant.id,
          verificationStatus: result.value.verificationStatus,
          tlsStatus: result.value.tlsStatus,
        }, logger);
        return {
          ok: true,
          domain: {
            id: result.value.id,
            hostname: result.value.hostname,
            verificationStatus: result.value.verificationStatus,
            tlsStatus: result.value.tlsStatus,
          },
        };
      },
    },
    {
      name: 'cloud_domain_remove',
      description: "Detach the caller's custom domain (mutating, governed).",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const domainId = str((raw as { domainId?: unknown })?.domainId);
        if (!domainId) return { ok: false, error: 'domainId is required' };
        const auth = await authorize(raw, caller, 'cloud.domain.remove', { via: 'mcp', domainId });
        if (!auth.ok) return auth.envelope;
        const result = await domains.remove(domainId, auth.tenant.id);
        if (!result.ok) return errorEnvelope(result.error);
        await recordCloudAudit(gate, 'cloud.domain.remove', auth.principal, auth.verdict, {
          via: 'mcp',
          domainId,
          tenantId: auth.tenant.id,
        }, logger);
        return { ok: true, domainId, removed: true };
      },
    },
  ];
}
