/**
 * SECURITY: the billing READ tools (`billing_plan_read`, `billing_usage_read`)
 * must derive their subject from the host-authorized {@link McpToolCaller}, NOT
 * from free-form `args`. A non-privileged caller supplying `args.orgId` for an org
 * it does not belong to must be REJECTED (cross-tenant plan/quota disclosure), not
 * served the victim org's billing view. These tests pin that binding.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildBillingMcpTools } from '../mcp/billing-engine.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { BillingModule } from '../index.js';
import type { BillingSubject, EntitlementView, QuotaDecision } from '../types.js';

/** A fake gate that records which subject it was asked about. */
function fakeModule(): { module: BillingModule; seen: BillingSubject[] } {
  const seen: BillingSubject[] = [];
  const view: EntitlementView = { plan: 'pro', features: [], quotas: [] };
  const quota: QuotaDecision = {
    allowed: true,
    plan: 'pro',
    kind: 'agent_run',
    limit: 100,
    remaining: 42,
    resetAt: new Date(0).toISOString(),
    byokBypass: false,
  };
  const gate = {
    async view(subject: BillingSubject): Promise<EntitlementView> {
      seen.push(subject);
      return view;
    },
    async checkQuota(subject: BillingSubject): Promise<QuotaDecision> {
      seen.push(subject);
      return quota;
    },
  };
  const module = { gate: () => gate } as unknown as BillingModule;
  return { module, seen };
}

function tool(tools: readonly McpToolRegistration[], name: string): McpToolRegistration {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

const caller = (over: Partial<McpToolCaller>): McpToolCaller => ({ userId: 'u1', ...over });

describe('billing MCP tools — caller-bound subject resolution', () => {
  it('binds the subject to the caller; a foreign args.orgId does NOT leak the victim org', async () => {
    const { module, seen } = fakeModule();
    const plan = tool(buildBillingMcpTools(module), 'billing_plan_read');

    // ATTACK: caller u1 (org acme) asks for victim-org's plan via args.orgId.
    await expect(
      plan.handler({ orgId: 'victim-org' }, caller({ userId: 'u1', orgId: 'acme' })),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    // The gate was NEVER queried for the victim org.
    expect(seen).toHaveLength(0);
  });

  it('rejects a foreign args.userId for a non-privileged caller', async () => {
    const { module, seen } = fakeModule();
    const usage = tool(buildBillingMcpTools(module), 'billing_usage_read');
    await expect(
      usage.handler({ userId: 'victim-user', kind: 'agent_run' }, caller({ userId: 'u1' })),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    expect(seen).toHaveLength(0);
  });

  it("defaults to the caller's own subject (org wins) when no subject is named", async () => {
    const { module, seen } = fakeModule();
    const plan = tool(buildBillingMcpTools(module), 'billing_plan_read');
    const out = (await plan.handler({}, caller({ userId: 'u1', orgId: 'acme' }))) as {
      subjectId: string;
      kind: string;
    };
    expect(out).toMatchObject({ subjectId: 'acme', kind: 'org' });
    expect(seen).toEqual([{ subjectId: 'acme', kind: 'org' }]);
  });

  it("falls back to the caller's user subject when the caller has no org", async () => {
    const { module, seen } = fakeModule();
    const plan = tool(buildBillingMcpTools(module), 'billing_plan_read');
    await plan.handler({}, caller({ userId: 'u1' }));
    expect(seen).toEqual([{ subjectId: 'u1', kind: 'user' }]);
  });

  it('allows a caller to read its OWN named org subject', async () => {
    const { module, seen } = fakeModule();
    const plan = tool(buildBillingMcpTools(module), 'billing_plan_read');
    await plan.handler({ orgId: 'acme' }, caller({ userId: 'u1', orgId: 'acme' }));
    expect(seen).toEqual([{ subjectId: 'acme', kind: 'org' }]);
  });

  it('lets a privileged (admin) caller name an arbitrary subject on behalf of a tenant', async () => {
    const { module, seen } = fakeModule();
    const plan = tool(buildBillingMcpTools(module), 'billing_plan_read');
    await plan.handler(
      { orgId: 'victim-org' },
      caller({ userId: 'svc', scopes: ['admin'] }),
    );
    expect(seen).toEqual([{ subjectId: 'victim-org', kind: 'org' }]);
  });

  it('refuses when there is no authorized caller (never guesses an identity)', async () => {
    const { module, seen } = fakeModule();
    const plan = tool(buildBillingMcpTools(module), 'billing_plan_read');
    await expect(plan.handler({ orgId: 'acme' }, undefined)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(seen).toHaveLength(0);
  });
});
