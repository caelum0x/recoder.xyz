// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// GAP (backend): there is no server audit-by-workspace endpoint. The governance
// Merkle chain the merge gate seals is NOT queryable per workspaceId
// (conductor-module.ts:1580 — "the audit Merkle chain is not queryable by
// `workspaceId`"), so a merged run has no durable server-side evidence edge to
// fetch. This artifact is therefore CLIENT-ASSEMBLED from data the compare panel
// already fetched truthfully (the real sibling entries, readiness, mergeability,
// and the captured merge verdict) — nothing here is fabricated, and the
// `provenance` field records that it was assembled client-side. A durable server
// evidence edge (GET …/audit or …/evidence by workspaceId, projecting the sealed
// chain) is filed to the backlog; when it lands, this builder should prefer it and
// fall back to client assembly only when the edge is unavailable.

import { agentLabel } from "./recoder-agent-labels";
import type {
    MergeabilityView,
    ReadinessView,
    RecoderDiffSummary,
    RecoderMergeRecord,
    SiblingCompareEntry,
} from "./recoder-model";

const EVIDENCE_KIND = "recoder.convergence.evidence";
const EVIDENCE_VERSION = 1;
const EVIDENCE_PROVENANCE =
    "Client-assembled from truthfully fetched conductor data (compare siblings, readiness, mergeability, merge verdict). " +
    "No server audit-by-workspace endpoint exists yet — the governance Merkle chain is not queryable per workspaceId — " +
    "so this record is not a server-signed audit projection.";

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
    merge: { status: string; verdict?: EvidenceMergeVerdict };
    defeatedSiblings: EvidenceSibling[];
    provenance: string;
};

// Everything the builder needs, all already resident in the compare panel's atoms.
type ConvergenceEvidenceInput = {
    winner: SiblingCompareEntry;
    siblings: SiblingCompareEntry[];
    readiness?: ReadinessView;
    mergeability?: MergeabilityView;
    merge: RecoderMergeRecord;
    taskGroup: string;
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

// Assemble the record from data already fetched. Agent ids are routed through
// agentLabel so no raw runtime / OSS name reaches the artifact. Defeated siblings
// are every OTHER member of the group (the winner excluded by workspaceId).
function buildConvergenceEvidence(input: ConvergenceEvidenceInput): ConvergenceEvidence {
    const winner = input.winner;
    const defeatedSiblings = input.siblings
        .filter((s) => s.workspaceId != winner.workspaceId)
        .map((s) => ({ agent: agentLabel(s.agent), branch: s.branch, state: s.state }));
    const evidence: ConvergenceEvidence = {
        kind: EVIDENCE_KIND,
        version: EVIDENCE_VERSION,
        generatedAt: new Date().toISOString(),
        mergedAt: input.merge.at,
        taskGroup: input.taskGroup,
        winningAgent: agentLabel(winner.agent),
        branch: winner.branch,
        merge: { status: input.merge.status },
        defeatedSiblings,
        provenance: EVIDENCE_PROVENANCE,
    };
    if (winner.diffStat != null) evidence.diffStat = winner.diffStat;
    const readiness = toEvidenceReadiness(input.readiness);
    if (readiness != null) evidence.readiness = readiness;
    const mergeability = toEvidenceMergeability(input.mergeability);
    if (mergeability != null) evidence.mergeability = mergeability;
    const verdict = toEvidenceMergeVerdict(input.merge);
    if (verdict != null) evidence.merge.verdict = verdict;
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
