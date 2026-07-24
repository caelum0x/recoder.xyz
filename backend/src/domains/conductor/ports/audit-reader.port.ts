/**
 * `AuditReaderPort` — the READ seam over the durable governance Merkle chain,
 * scoped to a single workspace. The write side (`GovernanceGatePort.recordAudit`)
 * seals every conductor mutation (merge/pr/advance/stop) into the chain with the
 * `workspaceId` in its payload; this port is the missing READ half — it lets the
 * `GET …/audit` edge return a workspace's sealed control-plane trail so the
 * cockpit's exportable evidence artifact can cite durable audit ids, not just a
 * client-side reconstruction.
 *
 * Read-only by contract: it never appends, never mutates, and never re-walks the
 * whole chain (that is `verifyAudit`). Absent ⇒ the edge degrades to a truthful
 * empty trail (`[]`), never a fabricated record. The conductor never imports
 * `@recoder/governance`; the composer injects a concrete reader over the
 * governance audit service's `range` seam.
 */
import type { AuditRecord } from './governance-gate.port.js';

export interface AuditReaderPort {
  /**
   * The sealed audit records for one workspace, ascending by chain `seq`. Bounded
   * by `limit` (impl default when omitted). An unknown workspace ⇒ `[]`.
   */
  byWorkspace(workspaceId: string, limit?: number): Promise<readonly AuditRecord[]>;
}
