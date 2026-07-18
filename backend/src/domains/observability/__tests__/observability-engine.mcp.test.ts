/**
 * SECURITY: the `obs_audit_search` MCP tool filters the governance Merkle audit
 * chain by `actorId`. That filter must be derived from the host-authorized
 * {@link McpToolCaller}, NOT from free-form `args`. A non-privileged caller that
 * supplies `args.actorId=<victim>` must be REJECTED (cross-actor audit-trail
 * disclosure) and the victim id must NEVER reach the `verifyAndProject` seam.
 * These tests pin that binding.
 */
import { describe, it, expect } from 'vitest';
import { buildObservabilityMcpTools } from '../mcp/observability-engine.js';
import type { ObservabilityMcpDeps } from '../mcp/observability-engine.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { AuditXdrProjection } from '../adapters/audit-xdr.adapter.js';
import type { XdrQuery, XdrResult } from '../types.js';

/** A fake audit projection that records every query it was asked to run. */
function fakeDeps(): { deps: ObservabilityMcpDeps; seen: XdrQuery[] } {
  const seen: XdrQuery[] = [];
  const result: XdrResult = { verified: true, records: [], entries: 0, verifiedAt: new Date(0).toISOString() };
  const auditXdr = {
    async verifyAndProject(query: XdrQuery): Promise<XdrResult> {
      seen.push(query);
      return result;
    },
  } as unknown as AuditXdrProjection;
  const deps = {
    auditXdr,
    // The other deps are unused by obs_audit_search; stub them opaquely.
    aggregator: {} as ObservabilityMcpDeps['aggregator'],
    workSignals: {} as ObservabilityMcpDeps['workSignals'],
    metrics: {} as ObservabilityMcpDeps['metrics'],
    engines: () => [],
  } satisfies ObservabilityMcpDeps;
  return { deps, seen };
}

function tool(tools: readonly McpToolRegistration[], name: string): McpToolRegistration {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

const caller = (over: Partial<McpToolCaller>): McpToolCaller => ({ userId: 'u1', ...over });

describe('obs_audit_search MCP tool — caller-bound actor resolution', () => {
  it('rejects a foreign args.actorId for a non-privileged caller; victim id never reaches the seam', async () => {
    const { deps, seen } = fakeDeps();
    const search = tool(buildObservabilityMcpTools(deps), 'obs_audit_search');

    // ATTACK: caller u1 asks for victim's governance audit rows via args.actorId.
    await expect(
      search.handler({ actorId: 'victim' }, caller({ userId: 'u1' })),
    ).rejects.toMatchObject({ code: 'AUTHZ_PROJECT_ACCESS_DENIED' });
    // The projection was NEVER queried for the victim actor.
    expect(seen).toHaveLength(0);
  });

  it("forces the actorId filter to the caller's own userId when none is named", async () => {
    const { deps, seen } = fakeDeps();
    const search = tool(buildObservabilityMcpTools(deps), 'obs_audit_search');
    await search.handler({ action: 'pr.create' }, caller({ userId: 'u1' }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ actorId: 'u1', action: 'pr.create' });
  });

  it('allows a non-privileged caller to name its OWN actorId', async () => {
    const { deps, seen } = fakeDeps();
    const search = tool(buildObservabilityMcpTools(deps), 'obs_audit_search');
    await search.handler({ actorId: 'u1' }, caller({ userId: 'u1' }));
    expect(seen[0]).toMatchObject({ actorId: 'u1' });
  });

  it('lets a privileged (admin) caller name an arbitrary actorId (ops view)', async () => {
    const { deps, seen } = fakeDeps();
    const search = tool(buildObservabilityMcpTools(deps), 'obs_audit_search');
    await search.handler({ actorId: 'victim' }, caller({ userId: 'svc', scopes: ['admin'] }));
    expect(seen[0]).toMatchObject({ actorId: 'victim' });
  });

  it('lets a privileged (internal) caller omit actorId for the global chain view', async () => {
    const { deps, seen } = fakeDeps();
    const search = tool(buildObservabilityMcpTools(deps), 'obs_audit_search');
    await search.handler({}, caller({ userId: 'svc', scopes: ['internal'] }));
    expect(seen[0]?.actorId).toBeUndefined();
  });

  it('refuses when there is no authorized caller (never guesses an identity)', async () => {
    const { deps, seen } = fakeDeps();
    const search = tool(buildObservabilityMcpTools(deps), 'obs_audit_search');
    await expect(search.handler({ actorId: 'u1' }, undefined)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(seen).toHaveLength(0);
  });
});
