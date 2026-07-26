// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useEffect, useState } from "react";
import {
    cryptoVerifyEd25519,
    deriveSignatureStatus,
    deriveVerifiedSignature,
    evidenceFilename,
    fetchEvidenceExport,
    fetchEvidenceMarkdown,
    signaturePublicKeyFingerprint,
    triggerTextDownload,
    type EvidenceControlView,
    type EvidenceExportView,
    type EvidenceStatus,
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
function EvidencePanel({ workspaceId }: { workspaceId: string }) {
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

EvidencePanel.displayName = "EvidencePanel";

export { EvidencePanel };
