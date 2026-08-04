// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SiblingCompareEntry } from "./recoder-board-logic";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { readErrorReason } from "./recoder-errors";

// The user's convergence choice: a contested path → the sibling workspaceId whose
// version wins. A path absent from the map is deliberately unresolved (the server
// reports it back in `unresolved`, and we never fabricate a default winner).
type ConvergeSelection = Record<string, string>;

// A path the plan could not resolve, with the backend's verbatim reason. `reason`
// is "" when the backend named the path but gave no reason — never invented.
type ConvergeUnresolved = { path: string; reason: string };

// One conflict region from the probe: WHERE two agents collided in a file.
// startLine/endLine are 1-indexed marker positions in git's merged-with-markers
// output; ours/theirs are each side's lines; `truncated` marks a server-side cap
// (more lines/regions existed than the bounded payload carries).
type ConvergeConflictRegion = {
    startLine: number;
    endLine: number;
    ours: string[];
    theirs: string[];
    truncated: boolean;
};

// A probed contested path: whether a clean line-level 3-way synthesize is possible
// (the "Synthesize" option) and, when not, the backend's verbatim reason
// ('overlap' | 'delete-modify' | 'unreadable'). An 'overlap' may also carry the
// parsed conflict `regions` (absent on an older backend — never fabricated).
// Present ONLY on a probed plan (`?probe=1`); an unprobed/old backend omits
// `plan.contested` entirely.
type ConvergeContestedProbe = {
    path: string;
    workspaceIds: string[];
    synthesizable: boolean;
    reason?: string;
    regions?: ConvergeConflictRegion[];
};

// The selection value that requests an auto 3-way merge for a path instead of a
// whole-file winner. The selection map stays Record<string,string>.
const SYNTHESIZE_VALUE = "@synthesize";

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
    // Populated only from a probed plan; `undefined` when unprobed so the panel can
    // tell "no probe" apart from "probed, nothing synthesizable" ([]).
    contested?: ConvergeContestedProbe[];
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

// The probe's conflict regions for one path. Only well-formed regions survive
// (positive 1-indexed lines); garbage entries are dropped, and an empty result
// yields `undefined` so the panel's "location unavailable" fallback stays honest.
function normalizeRegions(value: unknown): ConvergeConflictRegion[] {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const out: ConvergeConflictRegion[] = [];
    for (const item of value) {
        const obj = asObject(item);
        if (obj == null) {
            continue;
        }
        const startLine = typeof obj.startLine == "number" ? obj.startLine : 0;
        const endLine = typeof obj.endLine == "number" ? obj.endLine : 0;
        if (startLine <= 0 || endLine <= 0) {
            continue;
        }
        out.push({
            startLine,
            endLine,
            ours: stringArray(obj.ours),
            theirs: stringArray(obj.theirs),
            truncated: obj.truncated === true,
        });
    }
    return out.length > 0 ? out : undefined;
}

// The probed synthesizability list. A non-array (absent) yields `undefined` so the
// panel keeps "unprobed" distinct from "probed, none synthesizable" ([]). Each
// entry degrades to synthesizable=false and drops an empty reason.
function normalizeContested(value: unknown): ConvergeContestedProbe[] {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const out: ConvergeContestedProbe[] = [];
    for (const item of value) {
        const obj = asObject(item);
        if (obj == null) {
            continue;
        }
        const path = typeof obj.path == "string" ? obj.path : "";
        if (path == "") {
            continue;
        }
        const entry: ConvergeContestedProbe = {
            path,
            workspaceIds: stringArray(obj.workspaceIds),
            synthesizable: obj.synthesizable === true,
        };
        if (typeof obj.reason == "string" && obj.reason != "") {
            entry.reason = obj.reason;
        }
        const regions = normalizeRegions(obj.regions);
        if (regions != null) {
            entry.regions = regions;
        }
        out.push(entry);
    }
    return out;
}

// A conflict region ready to render: the "L12–L27" range label plus each side's
// text (rendered font-mono by the panel) and the server-side truncation flag.
type ConflictRegionRow = {
    label: string;
    ours: string[];
    theirs: string[];
    truncated: boolean;
};

// The collision view for one contested path: rows when the probe carried parsed
// regions, else a truthful fallback line for an 'overlap' whose location the
// backend could not provide (older backend / unparsed) — never an invented spot.
type ConflictRegionView = {
    rows: ConflictRegionRow[];
    fallback: string;
};

// Map a contested probe entry's regions to display rows. Pure. Regions only ever
// exist for reason 'overlap'; any other reason (or no probe data) shows nothing.
function presentConflictRegions(probe: {
    reason?: string;
    regions?: ConvergeConflictRegion[];
}): ConflictRegionView {
    const regions = probe.regions ?? [];
    if (regions.length > 0) {
        return {
            rows: regions.map((r) => ({
                label: r.startLine == r.endLine ? `L${r.startLine}` : `L${r.startLine}–L${r.endLine}`,
                ours: r.ours,
                theirs: r.theirs,
                truncated: r.truncated,
            })),
            fallback: "",
        };
    }
    return { rows: [], fallback: probe.reason == "overlap" ? "conflict location unavailable" : "" };
}

// Project the backend plan body into the truthful view the panel renders. Every
// field degrades to a neutral empty/false rather than a fabricated value.
function parseConvergePlan(data: Record<string, unknown>): ConvergePlan {
    const plan: ConvergePlan = {
        complete: data.complete === true,
        winners: countEntries(data.files),
        unresolved: normalizeUnresolved(data.unresolved),
        sources: normalizeSources(data.sources),
        changedFiles: stringArray(data.changedFiles),
        siblingCount: typeof data.siblingCount == "number" ? data.siblingCount : 0,
    };
    const contested = normalizeContested(data.contested);
    if (contested != null) {
        plan.contested = contested;
    }
    return plan;
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

// One-click convenience: set every cleanly-mergeable contested path to @synthesize,
// leaving the user's explicit picks/synths untouched (only fills UNRESOLVED paths
// whose probe said `synthesizable`). Immutable. Genuinely-conflicting paths are
// never auto-resolved — they still need a manual pick, so this never fabricates a
// resolution. Returns a fresh map.
function autoResolveSynthesizable(
    selection: ConvergeSelection,
    synthMap: Record<string, { synthesizable: boolean }>
): ConvergeSelection {
    const next = { ...selection };
    for (const [path, info] of Object.entries(synthMap)) {
        if (info.synthesizable && next[path] == null) {
            next[path] = SYNTHESIZE_VALUE;
        }
    }
    return next;
}

// How many contested paths a click of "auto-resolve" would newly resolve (the
// synthesizable-and-still-unresolved count) — 0 hides/disables the action.
function autoResolvableCount(
    selection: ConvergeSelection,
    synthMap: Record<string, { synthesizable: boolean }>
): number {
    let n = 0;
    for (const [path, info] of Object.entries(synthMap)) {
        if (info.synthesizable && selection[path] == null) n += 1;
    }
    return n;
}

// One sibling's column in the N-up compare grid. `stat` is ABSENT (never a
// fabricated 0/0/0) when the sibling's diffStat was uncomputable; `filesReason`
// is non-empty only when the changed-file list itself was unavailable — an empty
// `files` with reason "" is a genuine "no changed files".
type CompareColumn = {
    workspaceId: string;
    agent: string;
    state: string;
    stat?: { additions: number; deletions: number; files: number };
    statReason: string;
    files: string[];
    filesReason: string;
};

// Pure: project the compare feed's siblings into column display data, one column
// per sibling in feed order. Degrade-safe per column — a missing diffStat or
// changedFiles carries the sibling's own reason instead of an invented value.
function deriveCompareColumns(siblings: SiblingCompareEntry[]): CompareColumn[] {
    if (!Array.isArray(siblings)) {
        return [];
    }
    return siblings.map((s) => ({
        workspaceId: s.workspaceId,
        agent: s.agent,
        state: s.state,
        ...(s.diffStat != null
            ? { stat: { additions: s.diffStat.additions, deletions: s.diffStat.deletions, files: s.diffStat.files } }
            : {}),
        statReason: s.diffStat != null ? "" : s.diffStatReason || "diff unavailable",
        files: s.changedFiles ?? [],
        filesReason: s.changedFiles != null ? "" : s.changedFilesReason || "changed-file list unavailable",
    }));
}

// Which pairwise slot a column-header click should target: clicking a header
// already holding a slot re-targets that slot (the model's pickPair then clears
// it), otherwise fill A first, then B. Pure — the caller passes the current picks.
function headerPairSlot(pairA: string, pairB: string, workspaceId: string): "A" | "B" {
    if (workspaceId == pairA) {
        return "A";
    }
    if (workspaceId == pairB) {
        return "B";
    }
    if (pairA == "") {
        return "A";
    }
    return "B";
}

// GET the read-only converge plan for the current selection. Degrade-safe: any
// non-2xx surfaces the backend's verbatim reason (or a status-scoped fallback),
// and an unreachable backend surfaces a truthful connectivity line. Never throws.
// `probe` opts into the O(contested paths) real-git synthesizability check that
// populates `plan.contested`; leave it false for the debounced selection poll.
async function fetchConvergePlan(
    taskGroup: string,
    selection: ConvergeSelection,
    probe = false
): Promise<ConvergePlanResult> {
    const tg = taskGroup.trim();
    if (tg == "") {
        return { ok: false, error: "No task group to converge." };
    }
    try {
        const sel = encodeURIComponent(JSON.stringify(selection));
        const probeParam = probe ? "&probe=1" : "";
        const res = await fetch(
            `${getRecoderBackendUrl()}/api/conductor/workspaces/compare/${encodeURIComponent(tg)}/converge-plan?selection=${sel}${probeParam}`
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
    autoResolvableCount,
    autoResolveSynthesizable,
    composeConvergence,
    composeStatusFallback,
    deriveCompareColumns,
    fetchConvergePlan,
    headerPairSlot,
    parseConvergePlan,
    presentConflictRegions,
    SYNTHESIZE_VALUE,
    toggleSelection,
    type CompareColumn,
    type ConflictRegionRow,
    type ConflictRegionView,
    type ConvergeComposeResult,
    type ConvergeConflictRegion,
    type ConvergeContestedProbe,
    type ConvergePlan,
    type ConvergePlanResult,
    type ConvergeSelection,
    type ConvergeUnresolved,
};
