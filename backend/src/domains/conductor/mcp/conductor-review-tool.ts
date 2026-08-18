/**
 * The conductor `recoder_review_findings` MCP tool — the agent/desktop-invokable ON-DEMAND
 * line-level AI review of a workspace (recoder-7z42). It runs the LLM review generator over
 * the workspace diff and returns ONLY the findings that survive the deterministic validator
 * (evidence-grounding + confidence floor + dedup/severity-rank/cap), so an agent gets
 * trustworthy defect opinions, not a hallucinated wall. The heavy lifting lives on the
 * composer ({@link ReviewFindingsSurface.generateReviewFindings}); this tool is the thin,
 * GOVERNED binding, mirroring the conductor status-board / needs-you tools:
 *
 *  - IDENTITY (SECURITY): the acting identity is the HOST-AUTHORIZED caller (2nd handler
 *    param), NEVER a free-form `args.userId`. Absent a caller ⇒ `AUTH_REQUIRED`. The
 *    composer then runs the SAME ownership/governance gate the write ops use against the
 *    named `workspaceId` — a caller not authorized on that workspace is refused (403), so
 *    this is no cross-tenant review oracle.
 *  - TRUTHFULNESS: findings flow straight from the validator — no inference / no diff / a
 *    bad model reply ⇒ zero findings (never fabricated). On-demand, so the LLM cost is
 *    paid only when asked.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import type { ValidatedFindings } from '../services/review-findings.service.js';

/** The narrow composer seam this tool binds to: the owner-gated on-demand review. */
export interface ReviewFindingsSurface {
  generateReviewFindings(workspaceId: string, principal: Principal): Promise<ValidatedFindings>;
}

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Coerce raw MCP args to a record without trusting the shape. */
function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Require an authorized caller identity — absent ⇒ `AUTH_REQUIRED` (never guess a tenant). */
function requireCaller(caller: McpToolCaller | undefined): McpToolCaller {
  if (!caller || !str(caller.userId)) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'conductor: no authorized caller identity');
  }
  return caller;
}

/** Build the gate principal from the host-authorized caller (never a forged scope). */
function principalOf(caller: McpToolCaller): Principal {
  return {
    userId: str(caller.userId)!,
    ...(caller.orgId ? { orgId: caller.orgId } : {}),
    scopes: caller.scopes ?? ['read'],
    kind: 'apikey',
    isAnonymous: false,
    raw: null,
  };
}

/**
 * Build the governed `recoder_review_findings` MCP tool bound to the review surface. Kept
 * SEPARATE from the other tool builders so its single registration is explicit at the composer.
 */
export function buildConductorReviewTools(surface: ReviewFindingsSurface): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_review_findings',
      description:
        "Run an ON-DEMAND line-level AI review of a workspace's changes and return only VALIDATED findings. Args: workspaceId (required). Generates candidate findings via the LLM over the workspace diff, then applies the deterministic validator — a finding is surfaced ONLY when it is line-anchored (real file + line), carries attached EVIDENCE, and clears a confidence floor; duplicates collapse, results are severity-ranked and capped. Returns { kept: [{ file, line, severity: critical|high|medium|low|info, message, evidence, confidence? }], dropped (count filtered), summary }. GOVERNED: the caller is the host-authorized identity (never args.userId); it must be authorized on workspaceId (same ownership gate as the write ops) or the call is refused (403) — no cross-tenant review oracle. Truthful: no inference wired / no diff / a bad model reply ⇒ zero findings (never fabricated). On-demand only.",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const workspaceId = str(asObject(raw).workspaceId);
        if (!workspaceId) {
          throw createError(ErrorCode.MISSING_REQUIRED_FIELD, 'conductor: workspaceId is required');
        }
        return surface.generateReviewFindings(workspaceId, principalOf(authorized));
      },
    },
  ];
}
