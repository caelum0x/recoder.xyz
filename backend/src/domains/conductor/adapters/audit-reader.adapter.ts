/**
 * `createConductorAuditReader` — adapts the governance audit chain's read seam
 * (`range({ workspaceId, limit })`) to the conductor {@link AuditReaderPort}. Kept
 * structural (a narrow `AuditRangeSource` shape, not a governance import) so the
 * conductor domain stays free of `@recoder/governance`; the composition root
 * passes `governance.audit()`, whose `range` structurally satisfies the source.
 *
 * Read-only: it forwards the workspace filter to the durable chain and returns
 * the sealed records unchanged (same {@link AuditRecord} shape both domains share).
 */
import type { AuditReaderPort } from '../ports/audit-reader.port.js';
import type { AuditRecord } from '../ports/governance-gate.port.js';

/** The one governance-audit read method this adapter needs (structural, no import). */
export interface AuditRangeSource {
  range(query: { workspaceId?: string; limit?: number }): Promise<readonly AuditRecord[]>;
}

export function createConductorAuditReader(source: AuditRangeSource): AuditReaderPort {
  return {
    byWorkspace: (workspaceId, limit) =>
      source.range({ workspaceId, ...(limit == null ? {} : { limit }) }),
  };
}
