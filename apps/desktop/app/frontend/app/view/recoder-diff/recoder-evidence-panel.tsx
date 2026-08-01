// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import {
    cryptoVerifyEd25519,
    deriveSignatureStatus,
    deriveVerifiedSignature,
    evidenceFilename,
    fetchEvidenceExport,
    fetchEvidenceMarkdown,
    previewVerificationStateAtom,
    signaturePublicKeyFingerprint,
    triggerTextDownload,
    type EvidenceControlView,
    type EvidenceExportView,
    type EvidenceStatus,
    type PreviewCheckRow,
    type PreviewVerificationViewModel,
    type SignatureState,
} from "./recoder-evidence-logic";

const QUIET_BTN =
    "border border-border text-secondary rounded px-2 py-0.5 text-xs hover:bg-border/40 transition-colors cursor-pointer disabled:opacity-50";

// Truthful status chrome: only a real `met` earns the accent ✓; `partial` stays
// neutral (◐) and `not-evidenced` reads error (✗) — a pack with partials can never
// render as all-green.
const STATUS_GLYPH: Record<EvidenceStatus, string> = {
    met: "✓",
    partial: "◐",
    "not-evidenced": "✗",
};

const STATUS_TONE: Record<EvidenceStatus, string> = {
    met: "text-accent",
    partial: "text-secondary",
    "not-evidenced": "text-error",
};

function ControlRow({ control }: { control: EvidenceControlView }) {
    const glyph = STATUS_GLYPH[control.status];
    const tone = STATUS_TONE[control.status];
    return (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
            <span className={cn("font-mono", tone)} title={control.status}>
                {glyph}
            </span>
            <span className="text-secondary">{control.framework}</span>
            <span className="font-mono text-primary/80">{control.id}</span>
            {control.title != "" && <span className="text-secondary">{control.title}</span>}
            {control.status != "met" && control.reason != "" && (
                <span className={cn(tone)} title={control.reason}>
                    — {control.reason}
                </span>
            )}
        </div>
    );
}

ControlRow.displayName = "ControlRow";

function CoverageLine({ view }: { view: EvidenceExportView }) {
    const c = view.coverage;
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-accent">{c.met} met</span>
            <span className={c.partial > 0 ? "text-secondary" : "text-secondary/70"}>{c.partial} partial</span>
            <span className={c.notEvidenced > 0 ? "text-error" : "text-secondary/70"}>
                {c.notEvidenced} not-evidenced
            </span>
            <span className="text-secondary/70">· {c.total} total</span>
            <span
                className={view.integrityVerified ? "text-accent" : "text-error"}
                title={view.contentHash ? `contentHash ${view.contentHash}` : undefined}
            >
                integrity: {view.integrityVerified ? "verified" : "unverified"}
            </span>
        </div>
    );
}

CoverageLine.displayName = "CoverageLine";

// Truthful signature chrome: `verified` (a real Ed25519 check passed) is the ONLY
// state that earns the accent ✓; `signed` (present + hash-matched but not verified
// here) stays neutral and tells the auditor to verify with their org key;
// `invalid` reads error; `unsigned` is muted. Never green unless truly verified.
function SignatureLine({
    state,
    fingerprint,
    signedAt,
}: {
    state: SignatureState;
    fingerprint: string;
    signedAt: string;
}) {
    if (state == null) {
        return null;
    }
    if (state.status == "unsigned") {
        return <div className="text-xs text-secondary/70">unsigned</div>;
    }
    if (state.status == "invalid") {
        return (
            <div className="text-xs text-error" title={state.reason || undefined}>
                ✗ signature invalid{state.reason != "" ? ` — ${state.reason}` : ""}
            </div>
        );
    }
    const verified = state.status == "verified";
    return (
        <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs", verified ? "text-accent" : "text-secondary")}>
            <span>{verified ? "✓ verified (Ed25519)" : "signed (Ed25519) — verify with your org key"}</span>
            {fingerprint != "" && (
                <span className="text-secondary/70 font-mono" title="SHA-256 of the signer public key (first 12 hex)">
                    key {fingerprint}
                </span>
            )}
            {signedAt != "" && <span className="text-secondary/70">signed {signedAt}</span>}
        </div>
    );
}

SignatureLine.displayName = "SignatureLine";

// The compliance evidence pack for a merged workspace, hung on the Review surface.
// Local ephemeral state (fetched per-workspace) — mirrors the converge panel; it
// never survives a workspace switch, so it stays out of the diff model.
function CompliancePackSection({ workspaceId }: { workspaceId: string }) {
    const [view, setView] = useState<EvidenceExportView>(null);
    const [loading, setLoading] = useState(false);
    const [noEvidence, setNoEvidence] = useState(false);
    const [error, setError] = useState("");
    const [downloadStatus, setDownloadStatus] = useState("");
    const [sigState, setSigState] = useState<SignatureState>(null);
    const [fingerprint, setFingerprint] = useState("");

    useEffect(() => {
        const id = (workspaceId ?? "").trim();
        setView(null);
        setNoEvidence(false);
        setError("");
        setDownloadStatus("");
        if (id == "") {
            return;
        }
        let cancelled = false;
        setLoading(true);
        (async () => {
            const result = await fetchEvidenceExport(id);
            if (cancelled) {
                return;
            }
            setLoading(false);
            if (result.ok) {
                setView(result.view);
                return;
            }
            if (result.noEvidence) {
                setNoEvidence(true);
                return;
            }
            setError(result.error);
        })();
        return () => {
            cancelled = true;
        };
    }, [workspaceId]);

    useEffect(() => {
        if (view == null) {
            setSigState(null);
            setFingerprint("");
            return;
        }
        // Show the pure baseline (unsigned / signed / hash-mismatch-invalid)
        // immediately, then upgrade to `verified` only if a real crypto verify
        // passes; the line never claims verified before the check resolves.
        setSigState(deriveSignatureStatus(view));
        setFingerprint("");
        if (view.signature == null) {
            return;
        }
        let cancelled = false;
        (async () => {
            const [state, fp] = await Promise.all([
                deriveVerifiedSignature(view, cryptoVerifyEd25519),
                signaturePublicKeyFingerprint(view.signature.publicKeyPem),
            ]);
            if (cancelled) {
                return;
            }
            setSigState(state);
            setFingerprint(fp);
        })();
        return () => {
            cancelled = true;
        };
    }, [view]);

    const onDownload = async () => {
        setDownloadStatus("Preparing…");
        const result = await fetchEvidenceMarkdown(workspaceId);
        if (result.ok) {
            triggerTextDownload(evidenceFilename(workspaceId), result.markdown, "text/markdown");
            setDownloadStatus("Saved to your downloads.");
            return;
        }
        setDownloadStatus(result.noEvidence ? "No evidence pack to download yet." : result.error);
    };

    if (loading) {
        return (
            <div className="flex flex-col gap-1 rounded border border-border p-2">
                <div className="text-xs uppercase tracking-wide text-secondary">Evidence</div>
                <div className="text-xs text-secondary">Loading compliance pack…</div>
            </div>
        );
    }

    if (error != "") {
        return (
            <div className="flex flex-col gap-1 rounded border border-border p-2">
                <div className="text-xs uppercase tracking-wide text-secondary">Evidence</div>
                <div className="text-xs text-error">{error}</div>
            </div>
        );
    }

    if (noEvidence || view == null) {
        return (
            <div className="flex flex-col gap-1 rounded border border-border p-2">
                <div className="text-xs uppercase tracking-wide text-secondary">Evidence</div>
                <div className="text-xs text-secondary">No evidence yet — merge a convergence to generate it.</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1.5 rounded border border-border p-2">
            <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-secondary">Evidence</span>
                {view.schema != "" && <span className="text-xs text-secondary/70 font-mono">{view.schema}</span>}
                <div className="flex-1" />
                <button className={QUIET_BTN} onClick={onDownload} title="Download the Markdown compliance pack">
                    Download
                </button>
            </div>
            <CoverageLine view={view} />
            <SignatureLine state={sigState} fingerprint={fingerprint} signedAt={view.signature?.signedAt ?? ""} />
            {view.controls.length == 0 ? (
                <div className="text-xs text-secondary">No mapped controls in this pack.</div>
            ) : (
                <div className="flex flex-col gap-0.5">
                    {view.controls.map((control) => (
                        <ControlRow key={`${control.framework}:${control.id}`} control={control} />
                    ))}
                </div>
            )}
            {downloadStatus != "" && <div className="text-xs text-secondary">{downloadStatus}</div>}
        </div>
    );
}

CompliancePackSection.displayName = "CompliancePackSection";

const PREVIEW_CHECK_GLYPH: Record<string, string> = {
    passed: "✓",
    failed: "✗",
    skipped: "◐",
};

// Truthful check chrome: only a real `passed` earns the accent ✓; `failed` reads
// error; `skipped` and anything unknown stay neutral — never green by default.
function previewCheckTone(status: string): string {
    if (status == "passed") {
        return "text-accent";
    }
    if (status == "failed") {
        return "text-error";
    }
    return "text-secondary";
}

function PreviewCheckLine({ check }: { check: PreviewCheckRow }) {
    const glyph = PREVIEW_CHECK_GLYPH[check.status] ?? "◐";
    return (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
            <span className={cn("font-mono", previewCheckTone(check.status))} title={check.status}>
                {glyph}
            </span>
            <span className="text-secondary">{check.name}</span>
            {check.detail != null && check.detail != "" && <span className="text-secondary/70">— {check.detail}</span>}
        </div>
    );
}

PreviewCheckLine.displayName = "PreviewCheckLine";

// Overall verdict chrome: a degraded run proved NOTHING, so it can never earn the
// accent regardless of its status; only a real non-degraded `passed` is green.
function previewStatusTone(view: PreviewVerificationViewModel): string {
    if (view.degraded) {
        return "text-secondary";
    }
    return previewCheckTone(view.status);
}

// The last persisted preview verification for the selected workspace, read from
// the diff-model-fetched shared atom (the model owns the fetch; the workspace tag
// keeps this section from ever rendering another workspace's verdict). Every
// not-ok state names its missing source explicitly — a truthful 404 split
// ("preview not verified" vs "workspace not found") or an unreachable backend —
// never a fabricated pass.
function PreviewVerificationSection({ workspaceId }: { workspaceId: string }) {
    const state = useAtomValue(previewVerificationStateAtom);
    const matches = state != null && state.workspaceId == workspaceId;
    if (!matches || state.loading || state.result == null) {
        return (
            <div className="flex flex-col gap-1 rounded border border-border p-2">
                <div className="text-xs uppercase tracking-wide text-secondary">Preview verification</div>
                <div className="text-xs text-secondary">
                    {matches && state.loading ? "Loading preview verification…" : "Preview verification not loaded."}
                </div>
            </div>
        );
    }
    const result = state.result;
    if (!result.ok) {
        const unreachable = result.reason == "unreachable";
        const copy =
            result.reason == "workspace-missing"
                ? "Workspace not found — no preview verification to show."
                : unreachable
                  ? "Preview verification unavailable — backend unreachable."
                  : "Preview not verified for this workspace.";
        return (
            <div className="flex flex-col gap-1 rounded border border-border p-2">
                <div className="text-xs uppercase tracking-wide text-secondary">Preview verification</div>
                <div className={cn("text-xs", unreachable ? "text-error" : "text-secondary")}>{copy}</div>
            </div>
        );
    }
    const view = result.view;
    return (
        <div className="flex flex-col gap-1.5 rounded border border-border p-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-xs uppercase tracking-wide text-secondary">Preview verification</span>
                <span className={cn("text-xs", previewStatusTone(view))}>
                    {view.status == "" ? "unknown" : view.status}
                </span>
                {view.degraded && <span className="text-xs text-secondary">degraded — proved nothing</span>}
                {view.checkedAt != "" && <span className="text-xs text-secondary/70">checked {view.checkedAt}</span>}
            </div>
            {view.summary != "" && <div className="text-xs text-secondary">{view.summary}</div>}
            {view.reason != null && view.reason != "" && (
                <div className="text-xs text-secondary">reason: {view.reason}</div>
            )}
            {view.checks.length > 0 && (
                <div className="flex flex-col gap-0.5">
                    {view.checks.map((check, i) => (
                        <PreviewCheckLine key={`${check.name}:${i}`} check={check} />
                    ))}
                </div>
            )}
            <div className="text-xs text-secondary/70">{view.screenshotNote}</div>
        </div>
    );
}

PreviewVerificationSection.displayName = "PreviewVerificationSection";

// Evidence for the selected workspace: the compliance pack (merged convergences)
// plus the last preview verification. Two independent truthful reads — either can
// exist without the other, so both sections always render their own honest state.
function EvidencePanel({ workspaceId }: { workspaceId: string }) {
    return (
        <>
            <CompliancePackSection workspaceId={workspaceId} />
            <PreviewVerificationSection workspaceId={workspaceId} />
        </>
    );
}

EvidencePanel.displayName = "EvidencePanel";

export { EvidencePanel };
