/**
 * Cloud PREVIEW WRITE MCP tools — `cloud_preview_deploy` + `cloud_preview_url`.
 *
 * Proves the preview capability is surfaced as a GOVERNED MCP write, running the
 * SAME `authorize → guardCloudWrite → record` chain the other cloud write tools
 * use (defence in depth — never a bypass):
 *  - a DENY verdict BLOCKS the deploy / URL mint (no delegation, no audit);
 *  - an ALLOW verdict delegates to `PreviewDeployService.deploy` / `getSignedUrl`
 *    and seals a SANITIZED audit; the governed actor is the tenant owner;
 *  - an ABSENT gate degrades open (mutation proceeds, warn-logged);
 *  - a DEGRADED preview service (target/signer unavailable) surfaces a truthful
 *    `ok:false` + code and NEVER audits a mutation that did not happen;
 *  - a missing caller yields AUTH_REQUIRED; a cross-tenant caller is refused;
 *  - the URL audit payload NEVER carries the signed URL / raw token (secret law).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCloudWriteMcpTools } from '../mcp/cloud-write-engine.js';
import type { TenancyService } from '../services/tenancy.service.js';
import type { SandboxProvisionerService } from '../services/sandbox-provisioner.service.js';
import type { DomainsService } from '../services/domains.service.js';
import type { PreviewDeployService } from '../services/preview-deploy.service.js';
import type { CloudGovernanceGatePort, GateVerdict } from '../ports/governance-gate.port.js';
import type { McpToolRegistration, McpToolCaller } from '../../../shared/module-base.js';
import type { Tenant, Deployment, SignedPreviewUrl } from '../types.js';
import { ok, err } from '../../../shared/result.js';
import { createError, ErrorCode } from '../../../shared/errors.js';

/** The host-authorized caller that owns the fixture tenant (`owner_1`). */
const owner: McpToolCaller = { userId: 'owner_1' };

const tenant: Tenant = {
  id: 'ten_1', orgId: null, ownerUserId: 'owner_1', tier: 'cloud', isolationLevel: 'shared', region: 'eu',
  quota: { maxSandboxes: 5, maxConcurrent: 2, maxPreview: 3, cpuMillis: 1000, memMb: 1024 },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const deployment: Deployment = {
  id: 'dep_1', tenantId: 'ten_1', sandboxId: null, runId: 'run_1', target: 'preview', status: 'building',
  commitSha: 'abc123', previewBaseUrl: 'https://dep_1.internal', healthStatus: 'unknown', lastHealthAt: null,
  createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-02T00:00:00.000Z',
};

const EXP = 1893456000; // 2030-01-01T00:00:00Z, unix seconds
const signed: SignedPreviewUrl = {
  url: 'https://dep_1.preview.recoder.dev/?preview_token=payload.SIGNATURE_SECRET',
  token: 'payload.SIGNATURE_SECRET',
  claims: { deploymentId: 'dep_1', tenantId: 'ten_1', exp: EXP },
};

function verdict(effect: GateVerdict['effect']): GateVerdict {
  return { verdictId: 'v', requestId: 'r', effect, tier: 'medium', reason: 'ok', degraded: false, engine: 'napi', createdAt: '2026-01-01T00:00:00.000Z' };
}

const tenancy = {
  resolve: vi.fn(async () => ok(tenant)),
  ensure: vi.fn(async () => ok(tenant)),
} as unknown as TenancyService;

const provisioner = { provision: vi.fn(), destroy: vi.fn() } as unknown as SandboxProvisionerService;
const domains = { add: vi.fn(), verify: vi.fn(), remove: vi.fn() } as unknown as DomainsService;

const preview = {
  deploy: vi.fn(async () => ok(deployment)),
  getSignedUrl: vi.fn(async () => ok(signed)),
} as unknown as PreviewDeployService;

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

function makeGate(over: Partial<CloudGovernanceGatePort> = {}): CloudGovernanceGatePort {
  return { decide: vi.fn(async () => verdict('allow')), recordAudit: vi.fn(async () => ({ id: 'aud_1' })), ...over } as unknown as CloudGovernanceGatePort;
}

function toolMap(tools: readonly McpToolRegistration[]): Map<string, McpToolRegistration> {
  return new Map(tools.map((t) => [t.name, t]));
}

function build(gate?: CloudGovernanceGatePort): Map<string, McpToolRegistration> {
  return toolMap(buildCloudWriteMcpTools(gate ? { tenancy, provisioner, domains, preview, logger, gate } : { tenancy, provisioner, domains, preview, logger }));
}

beforeEach(() => vi.clearAllMocks());

describe('cloud_preview_deploy — governed deploy delegation', () => {
  it('exposes both preview write tools', () => {
    const tools = build(makeGate());
    expect(tools.has('cloud_preview_deploy')).toBe(true);
    expect(tools.has('cloud_preview_url')).toBe(true);
  });

  it('a DENY verdict blocks the deploy and never delegates or audits', async () => {
    const gate = makeGate({ decide: vi.fn(async () => verdict('deny')) });
    const res = (await build(gate).get('cloud_preview_deploy')!.handler({ runId: 'run_1' }, owner)) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.effect).toBe('blocked');
    expect(preview.deploy).not.toHaveBeenCalled();
    expect(gate.recordAudit).not.toHaveBeenCalled();
  });

  it('an ALLOW verdict delegates to preview.deploy + seals audit; actor is the tenant owner', async () => {
    const gate = makeGate();
    const res = (await build(gate).get('cloud_preview_deploy')!.handler(
      { runId: 'run_1', target: 'preview', sandboxId: 'sbx_1', commitSha: 'abc123', source: 'repo@abc', ttlSeconds: 600 },
      owner,
    )) as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(res.deployment).toEqual(expect.objectContaining({ id: 'dep_1', status: 'building', target: 'preview' }));
    // Delegated with the CALLER-bound tenant, never args.
    expect(preview.deploy).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'ten_1', target: 'preview', runId: 'run_1', sandboxId: 'sbx_1', commitSha: 'abc123', source: 'repo@abc', ttlSeconds: 600,
    }));
    expect(gate.decide).toHaveBeenCalledWith('cloud.preview.deploy', expect.objectContaining({ userId: 'owner_1' }), expect.anything());
    expect(gate.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'cloud.preview.deploy', actorId: 'owner_1', payload: expect.objectContaining({ deploymentId: 'dep_1', status: 'building' }),
    }));
  });

  it('defaults an unknown/absent target to `preview`', async () => {
    await build(makeGate()).get('cloud_preview_deploy')!.handler({ target: 'bogus' }, owner);
    expect(preview.deploy).toHaveBeenCalledWith(expect.objectContaining({ target: 'preview' }));
  });

  it('an ABSENT gate degrades open (deploy proceeds, warn-logged)', async () => {
    const res = (await build().get('cloud_preview_deploy')!.handler({ runId: 'run_1' }, owner)) as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(preview.deploy).toHaveBeenCalledTimes(1);
  });

  it('is degrade-safe: an unavailable deploy target surfaces ok:false + code, no audit', async () => {
    (preview.deploy as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'No preview deploy target is available.')),
    );
    const gate = makeGate();
    const res = (await build(gate).get('cloud_preview_deploy')!.handler({ runId: 'run_1' }, owner)) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    // Governance decided (allow), but a failed mutation is NEVER sealed as done.
    expect(gate.recordAudit).not.toHaveBeenCalled();
  });

  it('errors truthfully when no caller is authorized (never guesses identity)', async () => {
    const res = (await build(makeGate()).get('cloud_preview_deploy')!.handler({ runId: 'run_1' })) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.code).toBe(ErrorCode.AUTH_REQUIRED);
    expect(preview.deploy).not.toHaveBeenCalled();
  });

  it('REFUSES cross-tenant: an attacker cannot deploy against a victim tenant', async () => {
    const gate = makeGate();
    const attacker: McpToolCaller = { userId: 'attacker_1' };
    const res = (await build(gate).get('cloud_preview_deploy')!.handler({ tenantId: 'ten_1', runId: 'run_1' }, attacker)) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.code).toBe(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED);
    expect(gate.decide).not.toHaveBeenCalled();
    expect(preview.deploy).not.toHaveBeenCalled();
  });
});

describe('cloud_preview_url — governed signed-URL mint', () => {
  it('requires a deploymentId', async () => {
    const res = (await build(makeGate()).get('cloud_preview_url')!.handler({}, owner)) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain('deploymentId');
    expect(preview.getSignedUrl).not.toHaveBeenCalled();
  });

  it('a DENY verdict blocks the mint and never delegates or audits', async () => {
    const gate = makeGate({ decide: vi.fn(async () => verdict('deny')) });
    const res = (await build(gate).get('cloud_preview_url')!.handler({ deploymentId: 'dep_1' }, owner)) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.effect).toBe('blocked');
    expect(preview.getSignedUrl).not.toHaveBeenCalled();
    expect(gate.recordAudit).not.toHaveBeenCalled();
  });

  it('an ALLOW verdict mints the URL, returns it, and seals a SANITIZED audit (no secret)', async () => {
    const gate = makeGate();
    const res = (await build(gate).get('cloud_preview_url')!.handler({ deploymentId: 'dep_1' }, owner)) as Record<string, unknown>;
    expect(res.ok).toBe(true);
    const url = (res.preview as Record<string, unknown>).url;
    // The delivered capability carries the signed URL to the authorized caller...
    expect(url).toBe(signed.url);
    expect((res.preview as Record<string, unknown>).expiresAt).toBe(new Date(EXP * 1000).toISOString());
    expect(preview.getSignedUrl).toHaveBeenCalledWith('dep_1', 'ten_1');
    // ...but the audit chain NEVER persists the URL or the raw token (secret law).
    const auditPayload = (gate.recordAudit as ReturnType<typeof vi.fn>).mock.calls[0][0].payload as Record<string, unknown>;
    expect(JSON.stringify(auditPayload)).not.toContain('SIGNATURE_SECRET');
    expect(auditPayload).not.toHaveProperty('url');
    expect(auditPayload).not.toHaveProperty('token');
    expect(auditPayload).toEqual(expect.objectContaining({ deploymentId: 'dep_1', tenantId: 'ten_1', exp: EXP }));
  });

  it('is degrade-safe: unconfigured signing surfaces ok:false + code, no audit', async () => {
    (preview.getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'Preview URL signing is not configured.')),
    );
    const gate = makeGate();
    const res = (await build(gate).get('cloud_preview_url')!.handler({ deploymentId: 'dep_1' }, owner)) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(gate.recordAudit).not.toHaveBeenCalled();
  });

  it('REFUSES cross-tenant: an attacker cannot mint a victim deployment URL', async () => {
    const gate = makeGate();
    const attacker: McpToolCaller = { userId: 'attacker_1' };
    const res = (await build(gate).get('cloud_preview_url')!.handler({ tenantId: 'ten_1', deploymentId: 'dep_1' }, attacker)) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.code).toBe(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED);
    expect(preview.getSignedUrl).not.toHaveBeenCalled();
  });
});
