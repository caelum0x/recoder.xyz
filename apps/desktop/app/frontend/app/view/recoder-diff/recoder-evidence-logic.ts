// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";

// The framework-mapped compliance status of one control. Kept to the backend's
// exact vocabulary; anything unrecognized degrades to "not-evidenced" so an
// unknown value can never read as a pass (never a fabricated green).
type EvidenceStatus = "met" | "partial" | "not-evidenced";

// One control row projected for the panel: the framework + id + truthful status,
// with the backend's verbatim reason (only when not fully met) and any refs.
type EvidenceControlView = {
    id: string;
    framework: string;
    title: string;
    status: EvidenceStatus;
    reason: string;
    evidenceRefs: string[];
};

type EvidenceCoverage = { met: number; partial: number; notEvidenced: number; total: number };

// The exportable compliance pack, projected to what the panel renders. Every field
// is a truthful read of `data.export`; missing pieces degrade to neutral empties.
type EvidenceExportView = {
    schema: string;
    generatedAt: string;
    taskGroup: string;
    chosenWorkspaceId: string;
    mergedAt: string;
    integrityVerified: boolean;
    coverage: EvidenceCoverage;
    controls: EvidenceControlView[];
    contentHash: string;
};

// Loose result shapes (repo convention: strictNullChecks off, so no discriminated
// narrowing). `noEvidence` is the truthful 404 signal — NOT an error.
type EvidenceExportResult = { ok: boolean; view?: EvidenceExportView; noEvidence?: boolean; error?: string };

type EvidenceMarkdownResult = { ok: boolean; markdown?: string; noEvidence?: boolean; error?: string };

function asObject(value: unknown): Record<string, unknown> | null {
    return value != null && typeof value == "object" ? (value as Record<string, unknown>) : null;
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value == "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
    return typeof value == "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((x): x is string => typeof x == "string") : [];
}

// Never coerce an unknown status into a pass: only the three known values survive,
// everything else falls to the most conservative "not-evidenced".
function normalizeStatus(value: unknown): EvidenceStatus {
    if (value == "met") {
        return "met";
    }
    if (value == "partial") {
        return "partial";
    }
    return "not-evidenced";
}

function normalizeControls(value: unknown): EvidenceControlView[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: EvidenceControlView[] = [];
    for (const item of value) {
        const obj = asObject(item);
        if (obj == null) {
            continue;
        }
        const id = stringOr(obj.id, "");
        if (id == "") {
            continue;
        }
        out.push({
            id,
            framework: stringOr(obj.framework, ""),
            title: stringOr(obj.title, ""),
            status: normalizeStatus(obj.status),
            reason: stringOr(obj.reason, ""),
            evidenceRefs: stringArray(obj.evidenceRefs),
        });
    }
    return out;
}

function normalizeCoverage(value: unknown): EvidenceCoverage {
    const obj = asObject(value);
    if (obj == null) {
        return { met: 0, partial: 0, notEvidenced: 0, total: 0 };
    }
    return {
        met: numberOr(obj.met, 0),
        partial: numberOr(obj.partial, 0),
        notEvidenced: numberOr(obj.notEvidenced, 0),
        total: numberOr(obj.total, 0),
    };
}

// Project `data.export` into the panel view. `subject` carries the merge facts;
// `evidenceIntegrity.verified` is read strictly (only a real `true` is verified).
function parseEvidenceExport(data: Record<string, unknown>): EvidenceExportView {
    const subject = asObject(data.subject) ?? {};
    const integrity = asObject(data.evidenceIntegrity) ?? {};
    return {
        schema: stringOr(data.schema, ""),
        generatedAt: stringOr(data.generatedAt, ""),
        taskGroup: stringOr(subject.taskGroup, ""),
        chosenWorkspaceId: stringOr(subject.chosenWorkspaceId, ""),
        mergedAt: stringOr(subject.mergedAt, ""),
        integrityVerified: integrity.verified === true,
        coverage: normalizeCoverage(data.coverage),
        controls: normalizeControls(data.controls),
        contentHash: stringOr(data.contentHash, ""),
    };
}

// GET the JSON compliance export for a merged workspace. Degrade-safe: a 404 is the
// truthful "no evidence yet" signal (not an error); any other non-2xx surfaces the
// backend's verbatim reason; an unreachable backend surfaces a connectivity line.
async function fetchEvidenceExport(workspaceId: string): Promise<EvidenceExportResult> {
    const id = (workspaceId ?? "").trim();
    if (id == "") {
        return { ok: false, error: "No workspace selected." };
    }
    try {
        const res = await fetch(
            `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(id)}/evidence/export?format=json`
        );
        if (res.status == 404) {
            return { ok: false, noEvidence: true };
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            return { ok: false, error: readErrorReason(body) || `Evidence unavailable (HTTP ${res.status}).` };
        }
        // Backend envelope: `{ data: { export: EvidenceExport } }` — unwrap `.export`
        // (fall back to the envelope itself for tolerance).
        const envelope = asObject(asObject(body)?.data) ?? asObject(body) ?? {};
        const exportObj = asObject(envelope.export) ?? envelope;
        return { ok: true, view: parseEvidenceExport(exportObj) };
    } catch {
        return { ok: false, error: "Evidence unavailable — Recoder isn’t reachable." };
    }
}

// GET the Markdown compliance pack (text/markdown) for saving/opening as a file.
// Same 404 = no-evidence discipline; a non-2xx/unreachable surfaces truthfully.
async function fetchEvidenceMarkdown(workspaceId: string): Promise<EvidenceMarkdownResult> {
    const id = (workspaceId ?? "").trim();
    if (id == "") {
        return { ok: false, error: "No workspace selected." };
    }
    try {
        const res = await fetch(
            `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(id)}/evidence/export?format=md`
        );
        if (res.status == 404) {
            return { ok: false, noEvidence: true };
        }
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            return { ok: false, error: readErrorReason(body) || `Evidence pack unavailable (HTTP ${res.status}).` };
        }
        const markdown = await res.text();
        return { ok: true, markdown };
    } catch {
        return { ok: false, error: "Evidence pack unavailable — Recoder isn’t reachable." };
    }
}

function sanitizeForFilename(value: string): string {
    const clean = (value ?? "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return clean == "" ? "workspace" : clean;
}

function evidenceFilename(workspaceId: string): string {
    return `recoder-evidence-${sanitizeForFilename(workspaceId)}.md`;
}

// Trigger a browser download of one text file — the Wave fork's proven save path
// (same mechanism as saveConvergenceEvidence). Degrade-safe: a missing DOM
// (preview harness) is swallowed so a Download click never throws.
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

export {
    evidenceFilename,
    fetchEvidenceExport,
    fetchEvidenceMarkdown,
    normalizeStatus,
    parseEvidenceExport,
    triggerTextDownload,
    type EvidenceControlView,
    type EvidenceCoverage,
    type EvidenceExportResult,
    type EvidenceExportView,
    type EvidenceMarkdownResult,
    type EvidenceStatus,
};
