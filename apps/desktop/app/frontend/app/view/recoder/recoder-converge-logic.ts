// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getRecoderBackendUrl } from "./recoder-endpoints";
import { readErrorReason } from "./recoder-errors";

// The user's convergence choice: a contested path → the sibling workspaceId whose
// version wins. A path absent from the map is deliberately unresolved (the server
// reports it back in `unresolved`, and we never fabricate a default winner).
type ConvergeSelection = Record<string, string>;

// A path the plan could not resolve, with the backend's verbatim reason. `reason`
// is "" when the backend named the path but gave no reason — never invented.
type ConvergeUnresolved = { path: string; reason: string };

// The read-only converge preview. Every field is a truthful projection of the
// backend plan: `winners` is the count of resolved winner files, `sources` the
// per-sibling winner counts, `changedFiles` the files the composed workspace
// would carry. `complete` gates Compose and is only ever the backend's own bool.
type ConvergePlan = {
    complete: boolean;
    winners: number;
    unresolved: ConvergeUnresolved[];
    sources: { workspaceId: string; count: number }[];
    changedFiles: string[];
    siblingCount: number;
};

// Loose result shapes (not a discriminated union): this frontend runs with
// strictNullChecks off, where a boolean-literal discriminant does not narrow, so
// the repo convention (see RecoderLaunchResult) is `ok` + optional payload/error.
type ConvergePlanResult = { ok: boolean; plan?: ConvergePlan; error?: string };

type ConvergeComposeResult = { ok: boolean; workspaceId?: string; branch?: string; error?: string };

function asObject(value: unknown): Record<string, unknown> | null {
    return value != null && typeof value == "object" ? (value as Record<string, unknown>) : null;
}

// `files`/winners may arrive as a list of winner entries or a path→winner map;
// either way the honest signal is "how many files have a winner", so count both
// shapes and fall to 0 for anything else (never a fabricated count).
function countEntries(value: unknown): number {
    if (Array.isArray(value)) {
        return value.length;
    }
    const obj = asObject(value);
    return obj != null ? Object.keys(obj).length : 0;
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((x): x is string => typeof x == "string") : [];
}

function normalizeUnresolved(value: unknown): ConvergeUnresolved[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: ConvergeUnresolved[] = [];
    for (const item of value) {
        if (typeof item == "string") {
            if (item != "") out.push({ path: item, reason: "" });
            continue;
        }
        const obj = asObject(item);
        if (obj == null) {
            continue;
        }
        const path = typeof obj.path == "string" ? obj.path : "";
        if (path == "") {
            continue;
        }
        const reason =
            typeof obj.reason == "string"
                ? obj.reason
                : Array.isArray(obj.reasons)
                  ? obj.reasons.filter((r): r is string => typeof r == "string").join("; ")
                  : "";
        out.push({ path, reason });
    }
    return out;
}

// `sources` is per-winner counts. Tolerate both a workspaceId→count map and a
// list of { workspaceId, count } so a leaner/older backend still renders.
function normalizeSources(value: unknown): { workspaceId: string; count: number }[] {
    if (Array.isArray(value)) {
        const out: { workspaceId: string; count: number }[] = [];
        for (const item of value) {
            const obj = asObject(item);
            if (obj == null) continue;
            const workspaceId = typeof obj.workspaceId == "string" ? obj.workspaceId : "";
            if (workspaceId == "") continue;
            out.push({ workspaceId, count: typeof obj.count == "number" ? obj.count : 0 });
        }
        return out;
    }
    const obj = asObject(value);
    if (obj == null) {
        return [];
    }
    const out: { workspaceId: string; count: number }[] = [];
    for (const [workspaceId, count] of Object.entries(obj)) {
        if (typeof count == "number") out.push({ workspaceId, count });
    }
    return out;
}

// Project the backend plan body into the truthful view the panel renders. Every
// field degrades to a neutral empty/false rather than a fabricated value.
function parseConvergePlan(data: Record<string, unknown>): ConvergePlan {
    return {
        complete: data.complete === true,
        winners: countEntries(data.files),
        unresolved: normalizeUnresolved(data.unresolved),
        sources: normalizeSources(data.sources),
        changedFiles: stringArray(data.changedFiles),
        siblingCount: typeof data.siblingCount == "number" ? data.siblingCount : 0,
    };
}

// Status-scoped truthful fallbacks for a compose failure whose body carried no
// reason. The backend's own message is always preferred over these.
function composeStatusFallback(status: number): string {
    if (status == 400) {
        return "Selection is incomplete or invalid — resolve the flagged paths first.";
    }
    if (status == 403) {
        return "Converge blocked by governance.";
    }
    if (status == 503) {
        return "Converge could not complete — Recoder is degraded.";
    }
    return `Converge failed (HTTP ${status}).`;
}

// Immutable pick toggle: choosing a path's current winner again clears it (back to
// unresolved); choosing a different sibling moves the win. Never mutates in place.
function toggleSelection(selection: ConvergeSelection, path: string, workspaceId: string): ConvergeSelection {
    if (selection[path] == workspaceId) {
        const next = { ...selection };
        delete next[path];
        return next;
    }
    return { ...selection, [path]: workspaceId };
}

// GET the read-only converge plan for the current selection. Degrade-safe: any
// non-2xx surfaces the backend's verbatim reason (or a status-scoped fallback),
// and an unreachable backend surfaces a truthful connectivity line. Never throws.
async function fetchConvergePlan(taskGroup: string, selection: ConvergeSelection): Promise<ConvergePlanResult> {
    const tg = taskGroup.trim();
    if (tg == "") {
        return { ok: false, error: "No task group to converge." };
    }
    try {
        const sel = encodeURIComponent(JSON.stringify(selection));
        const res = await fetch(
            `${getRecoderBackendUrl()}/api/conductor/workspaces/compare/${encodeURIComponent(tg)}/converge-plan?selection=${sel}`
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            return { ok: false, error: readErrorReason(body) || `Converge plan unavailable (HTTP ${res.status}).` };
        }
        // Backend envelope: `{ data: { plan: <ConvergencePlan> } }` — unwrap the
        // `.plan` sub-key (fall back to the envelope itself for tolerance).
        const envelope = asObject(asObject(body)?.data) ?? asObject(body) ?? {};
        const planObj = asObject(envelope.plan) ?? envelope;
        return { ok: true, plan: parseConvergePlan(planObj) };
    } catch {
        return { ok: false, error: "Converge plan unavailable — Recoder isn’t reachable." };
    }
}

// POST the selection to compose the winners into a NEW reviewable convergence
// workspace, returning its id so the caller can route straight into review/merge.
// Truthful: a 400/403/503 surfaces the backend's verbatim reason; a 2xx without a
// usable workspaceId is treated as a failure (never routes to a fabricated id).
async function composeConvergence(
    taskGroup: string,
    selection: ConvergeSelection,
    branch?: string
): Promise<ConvergeComposeResult> {
    const tg = taskGroup.trim();
    if (tg == "") {
        return { ok: false, error: "No task group to converge." };
    }
    try {
        const trimmedBranch = (branch ?? "").trim();
        const res = await fetch(
            `${getRecoderBackendUrl()}/api/conductor/workspaces/compare/${encodeURIComponent(tg)}/converge`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ selection, ...(trimmedBranch != "" ? { branch: trimmedBranch } : {}) }),
            }
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            return { ok: false, error: readErrorReason(body) || composeStatusFallback(res.status) };
        }
        // Backend envelope: `{ data: { convergence: { workspaceId, branch, workspace, … } } }`
        // — the composed workspace id is `convergence.workspaceId` (nested
        // `.workspace` object also carries it). Unwrap `.convergence`, tolerant of
        // both the top-level id and the nested workspace record.
        const envelope = asObject(asObject(body)?.data);
        const conv = asObject(envelope?.convergence) ?? envelope ?? {};
        const workspace = asObject(conv.workspace) ?? conv;
        const workspaceId =
            typeof conv.workspaceId == "string"
                ? conv.workspaceId
                : typeof workspace?.workspaceId == "string"
                  ? workspace.workspaceId
                  : "";
        if (workspaceId == "") {
            return { ok: false, error: "Converge returned no workspace to review." };
        }
        const branchOut =
            typeof conv.branch == "string"
                ? conv.branch
                : typeof workspace?.branch == "string"
                  ? workspace.branch
                  : "";
        return { ok: true, workspaceId, branch: branchOut };
    } catch {
        return { ok: false, error: "Converge unavailable — Recoder isn’t reachable." };
    }
}

export {
    composeConvergence,
    composeStatusFallback,
    fetchConvergePlan,
    parseConvergePlan,
    toggleSelection,
    type ConvergeComposeResult,
    type ConvergePlan,
    type ConvergePlanResult,
    type ConvergeSelection,
    type ConvergeUnresolved,
};
