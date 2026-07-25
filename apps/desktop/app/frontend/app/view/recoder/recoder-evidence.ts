// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// The convergence evidence artifact is a MIXED record, and it labels which parts
// are which. The `durableAudit` block is the SEALED server-side governance Merkle
// trail: on a merge the POST …/merge response returns the sealed entry
// (auditId/auditSeq/auditEntryHash — captured onto the merge record), and this
// builder ALSO reads GET /workspaces/:id/audit for the queryable durable entries.
// Everything else (compare siblings, readiness, mergeability, diff) stays
// CLIENT-ASSEMBLED from data the compare panel already fetched truthfully — nothing
// is fabricated. Solo desktop seals no local audit store, so the durable trail can
// come back empty; when it does, the artifact falls back to the client-assembled
// fields and the `provenance` + `durableAudit.source` say so.

import { agentLabel } from "./recoder-agent-labels";
import type {
    MergeabilityView,
    ReadinessView,
    RecoderAuditEntry,
    RecoderDiffSummary,
    RecoderMergeRecord,
    SiblingCompareEntry,
} from "./recoder-model";

const EVIDENCE_KIND = "recoder.convergence.evidence";
const EVIDENCE_VERSION = 2;
const EVIDENCE_PROVENANCE_SEALED =
    "durableAudit.entries are the SERVER-SEALED governance Merkle trail (GET /workspaces/:id/audit), and merge.sealed is " +
    "the sealed entry the merge gate returned. The surrounding fields (compare siblings, readiness, mergeability, diff) " +
    "remain client-assembled from truthfully fetched conductor data.";
const EVIDENCE_PROVENANCE_CLIENT =
    "No durable audit trail was returned (solo desktop seals no local audit store), so — apart from any merge.sealed ids the " +
    "merge response returned — this record is CLIENT-ASSEMBLED from truthfully fetched conductor data (compare siblings, " +
    "readiness, mergeability, merge verdict), not a server-signed audit projection.";

type EvidenceSibling = {
    agent: string;
    branch: string;
    state: string;
};

type EvidenceReadiness = {
    verdict: string;
    signals: { id: string; status: string; detail: string }[];
};

type EvidenceMergeability = {
    verdict: string;
    available: boolean;
    conflicts: string[];
};

type EvidenceMergeVerdict = {
    effect: string;
    tier?: string;
    engine?: string;
    degraded?: boolean;
};

// The sealed governance Merkle entry the merge gate returned on the 200 —
// captured onto the merge record. Present only when the merge actually sealed one
// (auditId non-null); a degraded sealing yields no block, never a fabricated id.
type EvidenceSealedMerge = {
    auditId: string;
    auditSeq?: number;
    auditEntryHash?: string;
};

// One entry of the durable, server-sealed governance Merkle chain (from GET
// …/audit). Structural chain fields only — the opaque payload is never inlined.
type EvidenceAuditEntry = {
    seq?: number;
    entryHash?: string;
    prevHash?: string;
    action?: string;
    effect?: string;
    riskTier?: string;
    degraded?: boolean;
    createdAt?: string;
};

// The durable-audit block. `source` is "sealed" when the server returned a
// non-empty trail (the entries below ARE the sealed record); "none" when the trail
// was empty (solo desktop / no store) and the artifact fell back to the
// client-assembled fields.
type EvidenceDurableAudit = {
    source: "sealed" | "none";
    entries: EvidenceAuditEntry[];
};

// The exportable convergence record: one trusted, evidence-backed change distilled
// from an N-agent parallel run. Every field mirrors real fetched data; optional
// fields are ABSENT (never a fabricated default) when that probe was unavailable.
type ConvergenceEvidence = {
    kind: string;
    version: number;
    generatedAt: string;
    mergedAt: string;
    taskGroup: string;
    winningAgent: string;
    branch: string;
    diffStat?: RecoderDiffSummary;
    readiness?: EvidenceReadiness;
    mergeability?: EvidenceMergeability;
    merge: { status: string; verdict?: EvidenceMergeVerdict; sealed?: EvidenceSealedMerge };
    durableAudit: EvidenceDurableAudit;
    defeatedSiblings: EvidenceSibling[];
    provenance: string;
};

// Everything the builder needs. All but `audit` is already resident in the compare
// panel's atoms; `audit` is the durable trail fetched from GET …/audit just before
// export (empty in solo — the builder then falls back to the client-assembled fields).
type ConvergenceEvidenceInput = {
    winner: SiblingCompareEntry;
    siblings: SiblingCompareEntry[];
    readiness?: ReadinessView;
    mergeability?: MergeabilityView;
    merge: RecoderMergeRecord;
    taskGroup: string;
    audit: RecoderAuditEntry[];
};

function toEvidenceReadiness(readiness?: ReadinessView): EvidenceReadiness {
    if (readiness == null) {
        return undefined;
    }
    const signals = Array.isArray(readiness.signals)
        ? readiness.signals.map((s) => ({ id: s.id, status: s.status, detail: s.detail ?? "" }))
        : [];
    return { verdict: readiness.verdict, signals };
}

function toEvidenceMergeability(mergeability?: MergeabilityView): EvidenceMergeability {
    if (mergeability == null) {
        return undefined;
    }
    return {
        verdict: mergeability.verdict,
        available: mergeability.available,
        conflicts: Array.isArray(mergeability.conflicts) ? mergeability.conflicts : [],
    };
}

function toEvidenceMergeVerdict(record: RecoderMergeRecord): EvidenceMergeVerdict {
    const verdict = record.verdict;
    if (verdict == null) {
        return undefined;
    }
    const out: EvidenceMergeVerdict = { effect: verdict.effect };
    if (verdict.tier != null) out.tier = verdict.tier;
    if (verdict.engine != null) out.engine = verdict.engine;
    if (verdict.degraded != null) out.degraded = verdict.degraded;
    return out;
}

// The sealed merge entry captured onto the merge record's outcome. Only a real,
// non-null auditId qualifies — a degraded sealing (null id) yields no block.
function toEvidenceSealedMerge(record: RecoderMergeRecord): EvidenceSealedMerge {
    const merge = record.merge;
    if (merge == null || merge.auditId == null) {
        return undefined;
    }
    const out: EvidenceSealedMerge = { auditId: merge.auditId };
    if (merge.auditSeq != null) out.auditSeq = merge.auditSeq;
    if (merge.auditEntryHash != null) out.auditEntryHash = merge.auditEntryHash;
    return out;
}

// Project the fetched durable trail into structural chain entries. An empty trail
// (solo desktop / no store) yields source "none" so the artifact is truthful that
// it fell back to the client-assembled fields.
function toEvidenceDurableAudit(audit: RecoderAuditEntry[]): EvidenceDurableAudit {
    const rows = Array.isArray(audit) ? audit : [];
    if (rows.length == 0) {
        return { source: "none", entries: [] };
    }
    const entries = rows.map((r): EvidenceAuditEntry => {
        const e: EvidenceAuditEntry = {};
        if (r.seq != null) e.seq = r.seq;
        if (r.entryHash != null) e.entryHash = r.entryHash;
        if (r.prevHash != null) e.prevHash = r.prevHash;
        if (r.action != null) e.action = r.action;
        if (r.effect != null) e.effect = r.effect;
        if (r.riskTier != null) e.riskTier = r.riskTier;
        if (r.degraded != null) e.degraded = r.degraded;
        if (r.createdAt != null) e.createdAt = r.createdAt;
        return e;
    });
    return { source: "sealed", entries };
}

// Assemble the record from data already fetched. Agent ids are routed through
// agentLabel so no raw runtime / OSS name reaches the artifact. Defeated siblings
// are every OTHER member of the group (the winner excluded by workspaceId).
function buildConvergenceEvidence(input: ConvergenceEvidenceInput): ConvergenceEvidence {
    const winner = input.winner;
    const defeatedSiblings = input.siblings
        .filter((s) => s.workspaceId != winner.workspaceId)
        .map((s) => ({ agent: agentLabel(s.agent), branch: s.branch, state: s.state }));
    const durableAudit = toEvidenceDurableAudit(input.audit);
    const evidence: ConvergenceEvidence = {
        kind: EVIDENCE_KIND,
        version: EVIDENCE_VERSION,
        generatedAt: new Date().toISOString(),
        mergedAt: input.merge.at,
        taskGroup: input.taskGroup,
        winningAgent: agentLabel(winner.agent),
        branch: winner.branch,
        merge: { status: input.merge.status },
        durableAudit,
        defeatedSiblings,
        provenance: durableAudit.source == "sealed" ? EVIDENCE_PROVENANCE_SEALED : EVIDENCE_PROVENANCE_CLIENT,
    };
    if (winner.diffStat != null) evidence.diffStat = winner.diffStat;
    const readiness = toEvidenceReadiness(input.readiness);
    if (readiness != null) evidence.readiness = readiness;
    const mergeability = toEvidenceMergeability(input.mergeability);
    if (mergeability != null) evidence.mergeability = mergeability;
    const verdict = toEvidenceMergeVerdict(input.merge);
    if (verdict != null) evidence.merge.verdict = verdict;
    const sealed = toEvidenceSealedMerge(input.merge);
    if (sealed != null) evidence.merge.sealed = sealed;
    return evidence;
}

function evidenceToJson(evidence: ConvergenceEvidence): string {
    return JSON.stringify(evidence, null, 2);
}

function formatDiffStat(stat?: RecoderDiffSummary): string {
    if (stat == null) {
        return "diff unavailable";
    }
    return `+${stat.additions} −${stat.deletions} · ${stat.files} file${stat.files == 1 ? "" : "s"}`;
}

function mergeHead(status: string): string {
    if (status == "merged") return "merged";
    if (status == "no_change") return "nothing to merge";
    if (status == "blocked") return "blocked";
    return "could not complete";
}

function evidenceToMarkdown(evidence: ConvergenceEvidence): string {
    const lines: string[] = [];
    lines.push("# Recoder Convergence Evidence");
    lines.push("");
    lines.push(`- Generated: ${evidence.generatedAt}`);
    lines.push(`- Merged: ${evidence.mergedAt}`);
    lines.push(`- Task group: ${evidence.taskGroup || "(ungrouped)"}`);
    lines.push("");
    lines.push("## Converged change");
    lines.push(`- Winning agent: ${evidence.winningAgent}`);
    lines.push(`- Branch: ${evidence.branch}`);
    lines.push(`- Diff: ${formatDiffStat(evidence.diffStat)}`);
    lines.push("");
    lines.push("## Merge verdict");
    lines.push(`- Status: ${mergeHead(evidence.merge.status)}`);
    if (evidence.merge.verdict != null) {
        const v = evidence.merge.verdict;
        lines.push(`- Gate effect: ${v.effect}`);
        if (v.tier != null) lines.push(`- Tier: ${v.tier}`);
        if (v.engine != null) lines.push(`- Engine: ${v.engine}`);
        if (v.degraded === true) lines.push(`- Degraded: yes`);
    } else {
        lines.push("- Gate verdict: unavailable");
    }
    if (evidence.merge.sealed != null) {
        const s = evidence.merge.sealed;
        lines.push(`- Sealed audit id: ${s.auditId}`);
        if (s.auditSeq != null) lines.push(`- Sealed audit seq: ${s.auditSeq}`);
        if (s.auditEntryHash != null) lines.push(`- Sealed entry hash: ${s.auditEntryHash}`);
    } else {
        lines.push("- Sealed audit: not sealed (governance sealing degraded)");
    }
    lines.push("");
    lines.push("## Sealed durable audit");
    if (evidence.durableAudit.source == "sealed") {
        lines.push(`- Source: server-sealed governance Merkle trail (${evidence.durableAudit.entries.length} entr${evidence.durableAudit.entries.length == 1 ? "y" : "ies"})`);
        for (const e of evidence.durableAudit.entries) {
            const head = `seq ${e.seq ?? "?"} · ${e.action ?? "?"} · ${e.effect ?? "?"}`;
            const tier = e.riskTier ? ` · ${e.riskTier}` : "";
            const degraded = e.degraded === true ? " · degraded" : "";
            const at = e.createdAt ? ` · ${e.createdAt}` : "";
            lines.push(`- ${head}${tier}${degraded}${at}`);
            if (e.entryHash != null) lines.push(`  - entry hash: ${e.entryHash}`);
        }
    } else {
        lines.push("- Source: none — no durable trail returned (solo desktop seals no local audit store); the fields above are client-assembled.");
    }
    lines.push("");
    lines.push("## Readiness");
    if (evidence.readiness != null) {
        lines.push(`- Verdict: ${evidence.readiness.verdict}`);
        for (const s of evidence.readiness.signals) {
            lines.push(`- ${s.id}: ${s.status}${s.detail ? ` — ${s.detail}` : ""}`);
        }
    } else {
        lines.push("- Readiness: unavailable");
    }
    lines.push("");
    lines.push("## Mergeability");
    if (evidence.mergeability != null) {
        const m = evidence.mergeability;
        lines.push(`- Verdict: ${m.verdict}${m.available ? "" : " (unavailable)"}`);
        lines.push(`- Conflicts: ${m.conflicts.length == 0 ? "none" : m.conflicts.join(", ")}`);
    } else {
        lines.push("- Mergeability: unavailable");
    }
    lines.push("");
    lines.push(`## Defeated siblings (${evidence.defeatedSiblings.length})`);
    if (evidence.defeatedSiblings.length == 0) {
        lines.push("- (solo run — no siblings)");
    } else {
        for (const s of evidence.defeatedSiblings) {
            lines.push(`- ${s.agent} — ${s.branch} (${s.state})`);
        }
    }
    lines.push("");
    lines.push("---");
    lines.push(evidence.provenance);
    lines.push("");
    return lines.join("\n");
}

function sanitizeForFilename(value: string): string {
    const clean = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return clean == "" ? "run" : clean;
}

function evidenceFilenameBase(evidence: ConvergenceEvidence): string {
    const group = sanitizeForFilename(evidence.taskGroup || "solo");
    const agent = sanitizeForFilename(evidence.winningAgent);
    return `recoder-convergence-${group}-${agent}`;
}

// Trigger a browser download of one text file. Degrade-safe: a missing DOM (preview
// harness) is swallowed so a Save click never throws in a non-browser context.
function triggerTextDownload(filename: string, content: string, mime: string): void {
    try {
        if (typeof document == "undefined" || document.body == null) {
            return;
        }
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    } catch {
        // degrade-safe: no browser download context — the caller's status copy stays truthful
    }
}

// Save the evidence as BOTH a machine-readable JSON and a human-readable Markdown
// report. Save-only: publishing an artifact is approval-gated and is NOT done here.
function saveConvergenceEvidence(evidence: ConvergenceEvidence): void {
    const base = evidenceFilenameBase(evidence);
    triggerTextDownload(`${base}.json`, evidenceToJson(evidence), "application/json");
    triggerTextDownload(`${base}.md`, evidenceToMarkdown(evidence), "text/markdown");
}

export {
    buildConvergenceEvidence,
    evidenceToJson,
    evidenceToMarkdown,
    evidenceFilenameBase,
    saveConvergenceEvidence,
    type ConvergenceEvidence,
    type ConvergenceEvidenceInput,
};
