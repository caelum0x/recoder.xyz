/**
 * Preview URL + browser verification behind the `ConductorComposer` facade:
 * the governed preview-url write (with fire-and-forget auto-verify), the
 * awaited verify path, the persisted-verification read, and the signed
 * evidence-pack composition. Every method body moved VERBATIM from the composer.
 */
import type { Workspace } from '@recoder/agent-os';
import type { Principal } from '../../identity/types.js';
import type {
  PreviewVerificationRecord,
  PreviewVerificationView,
} from '../ports/preview-verify.port.js';
import { normalizeLocalPreviewUrl } from '../review/preview-url-guard.js';
import {
  verifyWorkspacePreview,
  type PreviewVerifyDeps,
  type PreviewVerifyOptions,
  type PreviewVerifyResult,
} from '../services/preview-verify.service.js';
import {
  createBrowserPreviewVerifier,
  DEFAULT_PREVIEW_VERIFY_TIMEOUT_MS,
} from '../adapters/browser-preview-verify.adapter.js';
import {
  renderPreviewEvidence,
  signPreviewEvidence,
  type PreviewEvidencePack,
} from '../evidence/preview-evidence.js';
import {
  conductorAuditEntry,
  conductorTarget,
  guardConductorWrite,
  recordConductorAudit,
} from '../audit/conductor-audit.js';
import type { ConductorContext, ConductorWriteResult } from './shared.js';

export class ConductorPreview {
  constructor(private readonly ctx: ConductorContext) {}

  /**
   * The narrow gate + verifier + read seams the preview-verify service runs over.
   * Uses the wired verifier when present; else a truthful null-skip verifier, so
   * the explicit `verifyPreview` path still runs its gate + seals a skipped record
   * (never a faked pass). The fire-and-forget auto-verify guards on presence, so
   * it never spends a gate/audit on a composition with no browsing facet.
   */
  private previewVerifyDeps(): PreviewVerifyDeps {
    return {
      gate: this.ctx.gate,
      verifier: this.ctx.previewVerify ?? createBrowserPreviewVerifier(null),
      getWorkspace: id => this.ctx.engine.getWorkspace(id),
      // Write-back seam: persist the COMPACT verification summary onto the
      // workspace record via the SAME same-state metadata-merge idiom
      // `setPreviewUrl` uses (`advanceWorkspace` MERGES the `{ previewVerification }`
      // patch, never replaces), so the `GET …/preview-verification` read edge can
      // project it — the audit Merkle chain is not queryable by `workspaceId`.
      // Degrade-truthful: a vanished workspace ⇒ a no-op (nothing to write onto).
      persistVerification: async (id, record) => {
        const workspace = await this.ctx.engine.getWorkspace(id);
        if (!workspace) return;
        await this.ctx.engine.advanceWorkspace(id, workspace.state, undefined, {
          previewVerification: record,
        });
      },
    };
  }

  /**
   * PURE projection of a workspace's persisted preview-verification summary
   * (`metadata.previewVerification`) into the read model the
   * `GET …/preview-verification` edge returns — or `null` when the workspace does
   * not exist OR was never verified (no record). Read-only: no gate, no audit, no
   * mutation. `screenshotRef` is ALWAYS `null` in this cut (the screenshot PNG is
   * not retained — only an opaque artifact id was sealed), so the cockpit shows
   * "screenshot not retained", never a broken image. A never-verified workspace is
   * a truthful `null` (⇒ a 404 at the edge), NEVER a fabricated pass.
   */
  async getPreviewVerification(
    workspaceId: string
  ): Promise<PreviewVerificationView | null> {
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace) return null;
    const raw = (workspace.metadata as Record<string, unknown> | undefined)
      ?.previewVerification;
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as PreviewVerificationRecord;
    return {
      workspaceId: workspace.workspaceId,
      status: record.status,
      checkedAt: record.checkedAt,
      summary: record.summary,
      degraded: record.degraded,
      ...(record.reason !== undefined ? { reason: record.reason } : {}),
      checks: Array.isArray(record.checks) ? record.checks : [],
      // The screenshot PNG is not retained (only an opaque artifact id was sealed).
      screenshotRef: null,
    };
  }

  async setPreviewUrl(
    workspaceId: string,
    url: unknown,
    principal: Principal
  ): Promise<ConductorWriteResult<Workspace>> {
    const action = 'workspace.preview_url';
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', workspaceId),
        metadata: { workspaceId },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    const normalized = normalizeLocalPreviewUrl(url);
    if (!normalized) {
      return {
        ok: false,
        verdict,
        reason: 'a http(s) localhost/loopback url is required',
      };
    }
    try {
      const workspace = await this.ctx.engine.getWorkspace(workspaceId);
      if (!workspace)
        return {
          ok: false,
          verdict,
          reason: `workspace not found: ${workspaceId}`,
        };
      // Same-state advance (no illegal transition) — safe to call repeatedly as
      // the run restarts on a new port.
      const updated = await this.ctx.engine.advanceWorkspace(
        workspaceId,
        workspace.state,
        undefined,
        {
          previewUrl: normalized,
        }
      );
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, { workspaceId })
      );
      // Fire-and-forget preview verification (browsing facet). The persist above is
      // AWAITED and truthful; this side effect is `void … .catch(…)` and NEVER
      // rethrows into or blocks the caller — the completion-hook precedent. The URL
      // is freshest here (newest, most likely still pointing at a live port), so
      // firing now maximizes a real passed/failed. It crosses a SECOND, independent
      // gate (`workspace.preview_verify`): a deny / needs_approval there is a
      // truthful no-op — logged, never a block on the already-succeeded write. The
      // bounded `timeoutMs` guarantees a slow/hung preview can never stall the
      // caller (nor the completion hook downstream). Degrade-truthful end to end:
      // no driver ⇒ skipped(degraded); page break ⇒ failed; never a fabricated pass.
      if (this.ctx.previewVerify) {
        void verifyWorkspacePreview(
          this.previewVerifyDeps(),
          workspaceId,
          principal,
          {
            timeoutMs: DEFAULT_PREVIEW_VERIFY_TIMEOUT_MS,
          }
        )
          .then(r => {
            if (!r.ok) {
              this.ctx.log.info(
                { workspaceId, verdict: r.verdict.effect, reason: r.reason },
                'conductor preview auto-verify not run'
              );
            }
          })
          .catch(err =>
            this.ctx.log.warn(
              { err, workspaceId },
              'conductor preview auto-verify faulted'
            )
          );
      }
      return { ok: true, verdict, value: updated };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason:
          err instanceof Error ? err.message : 'preview-url update failed',
      };
    }
  }

  /**
   * VERIFY the workspace's stored preview URL — GATED (`workspace.preview_verify`),
   * the awaited twin of the fire-and-forget auto-verify. Delegates to the governed
   * {@link verifyWorkspacePreview} service, which runs the browser navigate →
   * assert → screenshot and SEALS the summary + screenshot artifact ids into the
   * durable audit chain. A bounded default deadline is applied unless the caller
   * overrides it. Degrade-truthful: no verifier / no driver / no stored preview
   * URL ⇒ a truthful `ok:false` or `skipped(degraded)` outcome with the real
   * reason — never a fabricated pass, never a throw, never a block on a run/merge.
   */
  async verifyPreview(
    workspaceId: string,
    principal: Principal,
    options?: PreviewVerifyOptions
  ): Promise<PreviewVerifyResult> {
    return verifyWorkspacePreview(
      this.previewVerifyDeps(),
      workspaceId,
      principal,
      {
        timeoutMs: DEFAULT_PREVIEW_VERIFY_TIMEOUT_MS,
        ...(options ?? {}),
      }
    );
  }

  /**
   * VERIFY the workspace's preview URL AND attach the outcome as a SIGNED,
   * content-hashed evidence pack (BE-6.2) — the "preview browser-verify +
   * evidence-attach" governed composition. Runs the already-gated
   * {@link verifyPreview} (browser navigate → assert → screenshot, sealed into the
   * durable audit chain), then lifts the SAME verification outcome into a portable
   * {@link PreviewEvidencePack} and SIGNS it with the configured Ed25519 evidence
   * key (reusing the convergence-export signing primitive). Degrade-truthful: a
   * blocked verdict / missing workspace / no stored preview URL returns the
   * verification's own `ok:false` + reason (no pack); a `skipped(degraded)` browser
   * run yields a truthful skipped-but-signed pack, never a fabricated pass; an
   * absent signing key ⇒ an UNSIGNED pack (`signature:null`), never a forged one.
   */
  async attachPreviewEvidence(
    workspaceId: string,
    principal: Principal,
    options?: PreviewVerifyOptions
  ): Promise<ConductorWriteResult<PreviewEvidencePack>> {
    const result = await this.verifyPreview(workspaceId, principal, options);
    if (!result.ok || !result.value) {
      return {
        ok: false,
        verdict: result.verdict,
        ...(result.reason ? { reason: result.reason } : {}),
      };
    }
    // Read-only provenance enrichment (the workspace exists — verify returned ok).
    // A missing record or absent url degrades the subject fields, never the pack.
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    const url = (workspace?.metadata as Record<string, unknown> | undefined)
      ?.previewUrl;
    const pack = renderPreviewEvidence({
      workspaceId,
      url: typeof url === 'string' ? url : '',
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      verification: result.value,
    });
    const sealed = signPreviewEvidence(pack, {
      privateKey: this.ctx.resolveEvidenceSigningKey(),
      logger: this.ctx.log,
    });
    return { ok: true, verdict: result.verdict, value: sealed };
  }
}
