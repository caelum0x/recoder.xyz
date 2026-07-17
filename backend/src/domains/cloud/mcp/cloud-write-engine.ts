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
 * The subject is resolved from explicit args (`orgId`/`tenantId` win over
 * `userId`); the governed actor is the resolved tenant owner. A missing subject
 * or an unresolvable tenant yields a truthful error, never a guessed identity or
 * a faked mutation.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { Logger } from '../../../shared/logger.js';
import type { AppError } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';
import type { Tenant } from '../types.js';
import type { TenancyService, TenantRef } from '../services/tenancy.service.js';
import type { SandboxProvisionerService } from '../services/sandbox-provisioner.service.js';
import type { DomainsService } from '../services/domains.service.js';
import type { CloudGovernanceGatePort, GovernanceAction, GateDecisionContext } from '../ports/governance-gate.port.js';
import { guardCloudWrite, recordCloudAudit } from '../services/cloud-write-gate.js';

export interface CloudWriteMcpDeps {
  readonly tenancy: TenancyService;
  readonly provisioner: SandboxProvisionerService;
  readonly domains: DomainsService;
  readonly logger: Logger;
  /** The injected governance gate; absent ⇒ degrade-open (warn-logged, auth-elsewhere). */
  readonly gate?: CloudGovernanceGatePort;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Resolve a tenant ref from tool args (org/tenant scope wins). Throws when absent. */
function tenantRefFromArgs(raw: unknown): TenantRef & { ownerUserId: string } {
  const args = (raw ?? {}) as Record<string, unknown>;
  const tenantId = str(args.tenantId);
  const orgId = str(args.orgId);
  const userId = str(args.userId);
  if (!userId && !orgId && !tenantId) {
    throw new Error('no cloud subject: pass args.userId, args.orgId, or args.tenantId');
  }
  return {
    ownerUserId: userId ?? '',
    ...(orgId ? { orgId } : {}),
    ...(tenantId ? { tenantId } : {}),
  };
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

export function buildCloudWriteMcpTools(deps: CloudWriteMcpDeps): readonly McpToolRegistration[] {
  const { tenancy, provisioner, domains, logger, gate } = deps;

  /**
   * Resolve (optionally auto-provisioning) the tenant + a governance decision for
   * an MCP write. Returns either the tenant+principal to proceed with, or the
   * truthful error envelope to return from the tool.
   */
  async function authorize(
    raw: unknown,
    action: GovernanceAction,
    metadata: Readonly<Record<string, unknown>>,
    opts: { ensure?: boolean } = {},
  ): Promise<
    | { ok: true; tenant: Tenant; principal: Principal; verdict: Awaited<ReturnType<CloudGovernanceGatePort['decide']>> | undefined }
    | { ok: false; envelope: Record<string, unknown> }
  > {
    let ref: TenantRef & { ownerUserId: string };
    try {
      ref = tenantRefFromArgs(raw);
    } catch (cause) {
      return { ok: false, envelope: { ok: false, error: cause instanceof Error ? cause.message : 'invalid subject' } };
    }
    const resolved = opts.ensure ? await tenancy.ensure(ref) : await tenancy.resolve(ref);
    if (!resolved.ok) return { ok: false, envelope: errorEnvelope(resolved.error) };
    const tenant = resolved.value;
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
      description: 'Provision a governed off-box sandbox for a subject (quota-gated, mutating).',
      handler: async (raw: unknown) => {
        const args = (raw ?? {}) as Record<string, unknown>;
        const auth = await authorize(raw, 'cloud.sandbox.provision', {
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
      description: "Destroy one of a subject's sandboxes (mutating, governed).",
      handler: async (raw: unknown) => {
        const sandboxId = str((raw as { sandboxId?: unknown })?.sandboxId);
        if (!sandboxId) return { ok: false, error: 'sandboxId is required' };
        const auth = await authorize(raw, 'cloud.sandbox.destroy', { via: 'mcp', sandboxId });
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
      name: 'cloud_domain_add',
      description: 'Attach a custom domain to a subject (mints DNS challenge records; mutating, governed).',
      handler: async (raw: unknown) => {
        const hostname = str((raw as { hostname?: unknown })?.hostname);
        if (!hostname) return { ok: false, error: 'hostname is required' };
        const auth = await authorize(raw, 'cloud.domain.add', { via: 'mcp', hostname }, { ensure: true });
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
      handler: async (raw: unknown) => {
        const domainId = str((raw as { domainId?: unknown })?.domainId);
        if (!domainId) return { ok: false, error: 'domainId is required' };
        const auth = await authorize(raw, 'cloud.domain.verify', { via: 'mcp', domainId });
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
      description: "Detach a subject's custom domain (mutating, governed).",
      handler: async (raw: unknown) => {
        const domainId = str((raw as { domainId?: unknown })?.domainId);
        if (!domainId) return { ok: false, error: 'domainId is required' };
        const auth = await authorize(raw, 'cloud.domain.remove', { via: 'mcp', domainId });
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
