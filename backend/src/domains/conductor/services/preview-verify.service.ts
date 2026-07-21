/**
 * `verifyWorkspacePreview` — the governed conductor write that turns a stored
 * preview URL into a VERIFIED one. `setPreviewUrl` only PERSISTS the loopback URL
 * to `metadata.previewUrl`; this service actually OPENS it: it runs the browser
 * verification (navigate → assert expected text → evidence screenshot →
 * verification-summary) through the injected {@link PreviewVerifyPort} and SEALS
 * the summary + evidence artifact ids into the SAME durable governance audit
 * chain every conductor mutation flows through.
 *
 * It follows the domain's write law exactly (see `conductor-audit`): the
 * governance gate `decide`s BEFORE the run (a deny blocks it, never faked) and
 * `recordAudit`s the outcome AFTER — so a verification and its evidence are an
 * auditable control-plane event, not a side channel.
 *
 * TRUTHFUL DEGRADE LAW: the run NEVER fabricates a verdict. No engine wired /
 * engine down ⇒ a `skipped` outcome with `degraded:true` and the real reason,
 * still sealed to the audit chain (the health surface, not a lost record, carries
 * the truth). A real page/assert break ⇒ `failed`. Verification is
 * evidence-gathering: a missing browser never blocks the flow.
 */
import type { Workspace } from '@recoder/agent-os';
import type { Principal } from '../../identity/types.js';
import type { GateVerdict, GovernanceGatePort } from '../ports/index.js';
import {
  conductorAuditEntry,
  guardConductorWrite,
  recordConductorAudit,
} from '../audit/conductor-audit.js';
import type {
  PreviewVerification,
  PreviewVerifyAssertion,
  PreviewVerifyPort,
} from '../ports/preview-verify.port.js';

/** The governance action name for a preview verification write (audit `action`). */
export const PREVIEW_VERIFY_ACTION = 'workspace.preview_verify';

/** The result envelope — structurally the module's `ConductorWriteResult<T>`. */
export interface PreviewVerifyResult {
  readonly ok: boolean;
  readonly verdict: GateVerdict;
  readonly value?: PreviewVerification;
  readonly reason?: string;
}

/** Caller-supplied verification options (assertions to check, screenshot toggle). */
export interface PreviewVerifyOptions {
  readonly assertions?: readonly PreviewVerifyAssertion[];
  readonly screenshot?: boolean;
  /**
   * Per-run browser deadline (ms). Threaded into the verifier request so a
   * slow/hung preview can never stall the caller (absent ⇒ the adapter's bounded
   * default). The auto-fire from `setPreviewUrl` always passes one.
   */
  readonly timeoutMs?: number;
}

/** The narrow read/verify seams the service depends on (injected by the module). */
export interface PreviewVerifyDeps {
  readonly gate: GovernanceGatePort;
  readonly verifier: PreviewVerifyPort;
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
}

/** Read the persisted preview URL off the workspace metadata (the `setPreviewUrl` sink). */
function readPreviewUrl(workspace: Workspace): string | undefined {
  const url = (workspace.metadata as Record<string, unknown> | undefined)?.previewUrl;
  return typeof url === 'string' && url.trim() ? url : undefined;
}

/**
 * Verify the workspace's stored preview URL and seal the evidence to the audit
 * chain. Returns `ok:false` (never throws) for a gate deny, a missing workspace,
 * or a workspace with no stored preview URL — each with a truthful reason.
 */
export async function verifyWorkspacePreview(
  deps: PreviewVerifyDeps,
  workspaceId: string,
  principal: Principal,
  options: PreviewVerifyOptions = {},
): Promise<PreviewVerifyResult> {
  const { allowed, verdict } = await guardConductorWrite(
    deps.gate,
    PREVIEW_VERIFY_ACTION,
    principal,
    { target: { environment: 'conductor' }, metadata: { workspaceId } },
  );
  if (!allowed) return { ok: false, verdict, reason: verdict.reason };

  const workspace = await deps.getWorkspace(workspaceId);
  if (!workspace) return { ok: false, verdict, reason: `workspace not found: ${workspaceId}` };

  const url = readPreviewUrl(workspace);
  if (!url) {
    return {
      ok: false,
      verdict,
      reason: 'no preview url stored on workspace — set the preview url before verifying',
    };
  }

  const outcome = await deps.verifier.verify({
    workspaceId,
    url,
    ...(workspace.taskId ? { taskId: workspace.taskId } : {}),
    ...(options.assertions && options.assertions.length > 0
      ? { assertions: options.assertions }
      : {}),
    ...(options.screenshot !== undefined ? { screenshot: options.screenshot } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });

  // Seal the verification + its evidence (summary text + artifact ids) into the
  // durable audit chain — the evidence attach the fusion promises.
  await recordConductorAudit(
    deps.gate,
    conductorAuditEntry(PREVIEW_VERIFY_ACTION, principal, verdict, {
      workspaceId,
      url,
      status: outcome.status,
      degraded: outcome.degraded,
      summary: outcome.summary,
      artifactIds: outcome.artifacts.map((artifact) => artifact.artifactId),
      checkCount: outcome.checks.length,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    }),
  );

  return { ok: true, verdict, value: outcome };
}
