// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure board/compare read-model logic for the Recoder hub, extracted from
// recoder-model.ts so the stateful ViewModel stays separate from the pure
// functions the views and tests share. Nothing here touches jotai, fetch, or
// globalStore.

import type { Workspace } from "@recoder/conductor-ui";
import { agentLabel } from "./recoder-agent-labels";

// SHELL FUSION: the workspace shape comes from @recoder/conductor-ui (the typed
// client package the cockpit shares) instead of a hand-rolled local mirror. The
// shell renders a lenient subset — the backend may be older/newer, so state stays
// a plain string here and everything beyond the picked fields remains optional.
type RecoderWorkspace = Pick<Workspace, "workspaceId" | "branch" | "runtimeId" | "worktreePath"> &
    Partial<Pick<Workspace, "createdAt">> & {
        state: string;
        substrate?: string;
        sessionName?: string;
        metadata?: Record<string, unknown>;
    };

// A per-workspace changed-line summary, folded from GET /workspaces/:id/diff/files.
// Binary files (numstat "-") contribute nothing; absent/unavailable diffs yield no
// entry at all so the board never shows a fabricated count.
type RecoderDiffSummary = { additions: number; deletions: number; files: number };

// One agent's row in the side-by-side compare of a parallel-run group. A lenient
// mirror of the backend SiblingCompareEntry — `diffStat`/`changedFiles` are ABSENT
// (never a fabricated 0/0/0) when uncomputable, each carrying a truthful reason.
type SiblingCompareEntry = {
    workspaceId: string;
    // agent === runtimeId — the compare key.
    agent: string;
    runtimeId: string;
    runId?: string;
    branch: string;
    state: string;
    attention?: string;
    attentionReason?: string;
    createdAt: string;
    updatedAt: string;
    diffStat?: RecoderDiffSummary;
    diffStatReason?: string;
    changedFiles?: string[];
    changedFilesReason?: string;
    sessionName?: string;
    worktreePath?: string;
};

// A file 2+ siblings BOTH touched — where parallel agents will collide.
type ContestedFile = { path: string; workspaceIds: string[] };

// A focused A-vs-B pairwise read, assembled CLIENT-SIDE from the two picked
// siblings' already-loaded data. `delta` is the honest diffStat difference
// (A minus B) — ABSENT when either side's diffStat is uncomputable, never a
// fabricated 0. `shared` is the set of files BOTH picked agents touched: the
// intersection of their changedFiles when both lists are present, else a
// fallback projected from the group's contested set (with `sharedReason`
// recording that the per-agent lists were unavailable). A true line-level
// pairwise diff (A's hunks vs B's) needs a backend edge that does not exist
// yet and is filed to the backlog.
type PairwiseDiffDelta = { additions: number; deletions: number; files: number };
type PairwiseCompareView = {
    a: SiblingCompareEntry;
    b: SiblingCompareEntry;
    delta?: PairwiseDiffDelta;
    shared: string[];
    sharedReason?: string;
};

// Pure: derive the A-vs-B pairwise view from two siblings + the group contested
// set. Degrade-safe — an absent diffStat drops `delta` (never a fabricated 0),
// and an absent changedFiles list on either side falls back to the group
// contested set restricted to this pair.
function computePairwise(
    a: SiblingCompareEntry,
    b: SiblingCompareEntry,
    contested: ContestedFile[]
): PairwiseCompareView {
    const view: PairwiseCompareView = { a, b, shared: [] };
    if (a.diffStat != null && b.diffStat != null) {
        view.delta = {
            additions: a.diffStat.additions - b.diffStat.additions,
            deletions: a.diffStat.deletions - b.diffStat.deletions,
            files: a.diffStat.files - b.diffStat.files,
        };
    }
    const aFiles = a.changedFiles;
    const bFiles = b.changedFiles;
    if (aFiles != null && bFiles != null) {
        const bSet = new Set(bFiles);
        view.shared = aFiles.filter((f) => bSet.has(f));
        return view;
    }
    view.shared = (contested ?? [])
        .filter((c) => c.workspaceIds.includes(a.workspaceId) && c.workspaceIds.includes(b.workspaceId))
        .map((c) => c.path);
    view.sharedReason = "from group contested set — per-agent changed-file lists unavailable";
    return view;
}

// One sibling's pre-merge overlap read: how many contested files it shares with
// other agents, and, per file, WHICH other agents also touch it (for the caution).
type SiblingOverlap = { count: number; files: string[]; agentsByFile: Record<string, string[]> };

// Pure + degrade-safe: derive one sibling's overlap with its siblings from the
// group contested set. The whole point is TRUTHFUL degrade: the backend's
// computeContested SKIPS any sibling whose changedFiles is unreadable, so such a
// sibling never appears in `contested`. A naive count would then read 0 and lie
// that this agent collides with no one. So when this sibling's own changedFiles
// is absent we return null — "we cannot know" — and the caller renders an explicit
// 'overlap unknown', never a fabricated 0.
function computeSiblingOverlap(
    sibling: SiblingCompareEntry,
    siblings: SiblingCompareEntry[],
    contested: ContestedFile[]
): SiblingOverlap {
    if (sibling.changedFiles == null) {
        return null;
    }
    const agentById = new Map(siblings.map((s) => [s.workspaceId, s.agent]));
    const mine = (contested ?? []).filter((c) => c.workspaceIds.includes(sibling.workspaceId));
    const files = mine.map((c) => c.path);
    const agentsByFile: Record<string, string[]> = {};
    for (const c of mine) {
        agentsByFile[c.path] = c.workspaceIds
            .filter((id) => id != sibling.workspaceId)
            .map((id) => agentById.get(id) ?? id);
    }
    return { count: files.length, files, agentsByFile };
}

// A truthful, NON-BINDING hint at the sibling the already-loaded data favors. It
// never selects, picks, or merges — the dev still clicks Merge. `reason` is the
// single criterion that decided it (the deciding datum is always REAL, never the
// unknown sentinel). Absent ⇒ no sibling had any scoreable data, or the field is
// a genuine tie, so we show nothing rather than guess.
type SuggestedWinner = { workspaceId: string; reason: string };

// Missing data ranks WORST so a sibling we cannot assess never outranks one we
// measured as clean/passing/small. A criterion only ever "decides" in the
// winner's favor when the winner's own value is real (see computeSuggestedWinner),
// so the surfaced reason is always truthful about the winner.
const CONFLICTS_UNKNOWN = Number.POSITIVE_INFINITY;
const PASSING_UNKNOWN = -1;
const SIZE_UNKNOWN = Number.POSITIVE_INFINITY;

type WinnerMetrics = {
    workspaceId: string;
    conflicts: number;
    passing: number;
    size: number;
    hasData: boolean;
};

function siblingMetrics(sibling: SiblingCompareEntry, readiness: Record<string, RecoderWorkspaceReadiness>): WinnerMetrics {
    const wr = readiness?.[sibling.workspaceId];
    let conflicts = CONFLICTS_UNKNOWN;
    let hasConflicts = false;
    const mergeability = wr?.mergeability;
    if (mergeability != null && mergeability.available) {
        conflicts = mergeability.conflicts?.length ?? 0;
        hasConflicts = true;
    }
    let passing = PASSING_UNKNOWN;
    let hasPassing = false;
    const readinessView = wr?.readiness;
    if (readinessView != null && Array.isArray(readinessView.signals)) {
        passing = readinessView.signals.filter((s) => s.status == "pass").length;
        hasPassing = true;
    }
    let size = SIZE_UNKNOWN;
    let hasSize = false;
    if (sibling.diffStat != null) {
        size = sibling.diffStat.additions + sibling.diffStat.deletions;
        hasSize = true;
    }
    return { workspaceId: sibling.workspaceId, conflicts, passing, size, hasData: hasConflicts || hasPassing || hasSize };
}

// Lexicographic: fewest conflicts, then most readiness checks passing, then
// smallest diff (adds+dels). Returns <0 when `a` is the better sibling.
function compareMetrics(a: WinnerMetrics, b: WinnerMetrics): number {
    if (a.conflicts != b.conflicts) {
        return a.conflicts - b.conflicts;
    }
    if (a.passing != b.passing) {
        return b.passing - a.passing;
    }
    if (a.size != b.size) {
        return a.size - b.size;
    }
    return 0;
}

function decideReason(winner: WinnerMetrics, runnerUp: WinnerMetrics): string {
    if (winner.conflicts < runnerUp.conflicts) {
        return "fewest conflicts";
    }
    if (winner.passing > runnerUp.passing) {
        return "most checks passing";
    }
    if (winner.size < runnerUp.size) {
        return "smallest diff";
    }
    return "";
}

// Pure + degrade-safe: score every sibling from data ALREADY loaded (mergeability
// conflicts, readiness passes, diffStat size) and name the one the data favors. It
// is a hint only — it selects nothing. Returns null when no sibling has scoreable
// data, or when the top two tie on every criterion (the field genuinely favors no
// one), so the UI shows no badge rather than fabricate a preference.
function computeSuggestedWinner(
    siblings: SiblingCompareEntry[],
    readiness: Record<string, RecoderWorkspaceReadiness>
): SuggestedWinner {
    if (siblings == null || siblings.length == 0) {
        return null;
    }
    const metrics = siblings.map((s) => siblingMetrics(s, readiness ?? {}));
    if (!metrics.some((m) => m.hasData)) {
        return null;
    }
    const sorted = [...metrics].sort(compareMetrics);
    const winner = sorted[0];
    const runnerUp = sorted[1];
    if (winner == null || !winner.hasData || runnerUp == null) {
        return null;
    }
    const reason = decideReason(winner, runnerUp);
    if (reason == "") {
        return null;
    }
    return { workspaceId: winner.workspaceId, reason };
}

// Read-only operator-attach hint for a group; absent for singleton/no-dmux groups.
type GroupAttachHint = { attachCommand?: string; visibleSessions: string[] };

// The aggregate of one parallel-run group for side-by-side review. `taskGroup` is
// null when the subject workspace is ungrouped (a singleton set of 1).
type CompareView = {
    taskGroup: string | null;
    count: number;
    siblings: SiblingCompareEntry[];
    contested: ContestedFile[];
    grid?: GroupAttachHint;
};

// Read-only pre-merge preflight. `available:false` ⇒ no git / no worktree / git
// too old; the verdict is NEVER a fabricated 'clean' when it could not judge.
type MergeabilityView = {
    available: boolean;
    verdict: "clean" | "conflicting" | "unknown";
    conflicts: string[];
    ahead: number;
    behind: number;
    base: string;
    branch: string;
    reason?: string;
};

// One of the five merge-decision signals, in fixed order. `unknown` is a real
// value (we could not judge) — never coerced to a pass. `worktree` reports
// uncommitted open work: it is `pending` (discouraged) when the worktree is dirty.
type ReadinessSignal = {
    id: "lifecycle" | "worktree" | "merge" | "checks" | "preview";
    status: "pass" | "fail" | "pending" | "unknown";
    detail: string;
};

// The folded merge-readiness read-model. `ready` is the hardest gate; `signals`
// is ALWAYS 5, in order: lifecycle, worktree, merge, checks, preview.
type ReadinessView = {
    verdict: "ready" | "blocked" | "not_ready" | "unknown" | "delivered" | "terminal";
    signals: ReadinessSignal[];
    blockers: string[];
};

// The two independently-probed merge-decision views for one workspace. Each side
// is optional so it degrades on its own — an absent side means that probe failed
// or was unreachable, never a fabricated verdict.
type RecoderWorkspaceReadiness = { readiness?: ReadinessView; mergeability?: MergeabilityView };

// The governance verdict the merge endpoint returns alongside the effect — a
// lenient mirror of the backend verdictView ({ effect, tier, degraded, engine }).
// Present ONLY on a 200 (the gate allowed and the op ran); an absent verdict on a
// blocked/failed attempt is truthful, never coerced to a pass.
type RecoderMergeVerdict = { effect: string; tier?: string; degraded?: boolean; engine?: string };

// The merge op's own result (backend MergeResultView). `merged` is false when the
// gate allowed and the merge ran but there was nothing to merge (already up to date).
// `auditId`/`auditSeq`/`auditEntryHash` are the SEALED governance Merkle entry the
// merge produced — captured verbatim from the 200 body so the evidence step can
// cite it and query the durable trail. `null` when sealing degraded (never faked).
type RecoderMergeOutcome = {
    workspaceId: string;
    branch: string;
    merged: boolean;
    auditId?: string | null;
    auditSeq?: number | null;
    auditEntryHash?: string | null;
};

// One entry of the durable governance Merkle chain returned by GET
// /workspaces/:id/audit — a lenient mirror of the backend AuditRecord. We surface
// only the structural chain fields (never the opaque payload, which may carry
// engine internals). Every field optional so an older/leaner backend degrades and
// nothing is fabricated. Solo desktop seals no local store ⇒ the trail is [].
type RecoderAuditEntry = {
    id?: string;
    seq?: number;
    prevHash?: string;
    entryHash?: string;
    action?: string;
    effect?: string;
    riskTier?: string;
    degraded?: boolean;
    createdAt?: string;
};

// The retained truthful record of the last merge attempt for one workspace, read
// by the compare panel + the evidence step. `merge`/`verdict` are present only on
// a 200; a blocked (403) or could-not-complete (503) attempt retains only its
// truthful status + the backend's verbatim reason. Never fabricates a merge.
type RecoderMergeRecord = {
    status: "merged" | "no_change" | "blocked" | "failed";
    reason?: string;
    merge?: RecoderMergeOutcome;
    verdict?: RecoderMergeVerdict;
    at: string;
};

// A parallel-run group derived from workspaces sharing a metadata.taskGroup. A
// solo (ungrouped) workspace is its own group of 1 with taskGroup null.
type RecoderWorkspaceGroup = { taskGroup: string | null; workspaces: RecoderWorkspace[] };

// The confirmed metadata key the launch path stamps to bind sibling workspaces.
const TASK_GROUP_METADATA_KEY = "taskGroup";

function readTaskGroup(ws: RecoderWorkspace): string | null {
    const raw = ws.metadata?.[TASK_GROUP_METADATA_KEY];
    return typeof raw == "string" && raw != "" ? raw : null;
}

// Group workspaces by their shared taskGroup, preserving first-seen order. A
// workspace with no taskGroup becomes its own singleton group (never invented
// siblings). Pure + degrade-safe: missing/blank metadata simply falls to solo.
function groupByTaskGroup(workspaces: RecoderWorkspace[]): RecoderWorkspaceGroup[] {
    const groups: RecoderWorkspaceGroup[] = [];
    const byGroup = new Map<string, RecoderWorkspaceGroup>();
    for (const ws of workspaces) {
        const tg = readTaskGroup(ws);
        if (tg == null) {
            groups.push({ taskGroup: null, workspaces: [ws] });
            continue;
        }
        const existing = byGroup.get(tg);
        if (existing) {
            existing.workspaces.push(ws);
            continue;
        }
        const group: RecoderWorkspaceGroup = { taskGroup: tg, workspaces: [ws] };
        byGroup.set(tg, group);
        groups.push(group);
    }
    return groups;
}

// Terminal-dead states: history, not live work. The default Active board view
// hides them; the Archived view shows exactly them.
function isTerminalWorkspaceState(state: string): boolean {
    return state == "archived" || state == "failed";
}

// The one existing board action a row should PROMOTE as the workspace moves
// toward a merge. Maps 1:1 onto a button already rendered by WorkspaceRow, so a
// suggestion never invents a new capability — it only highlights the next step.
type RecoderRowActionId = "review" | "merge" | "session" | "archive";
type RecoderRowSuggestion = {
    action: RecoderRowActionId;
    label: string;
};

// Pure: the single most useful next step for a workspace, derived ONLY from data
// the board already holds — the workspace state, its changed-line summary, and
// whether it has a live session. Never triggers a gh/PR probe (that cost stays in
// the Review surface). null ⇒ nothing to suggest; the row shows its neutral
// buttons unpromoted. Unknown backend states fall through to null (degrade-safe).
function suggestNextAction(
    state: string,
    summary: RecoderDiffSummary | undefined,
    hasSession: boolean
): RecoderRowSuggestion | null {
    if (state == "merged") {
        return { action: "archive", label: "Merged — archive to clear the board" };
    }
    if (state == "awaiting_review") {
        const hasChanges = summary != null && summary.files > 0;
        if (!hasChanges) {
            return { action: "archive", label: "Nothing to merge — archive" };
        }
        return { action: "review", label: "Ready — review the changes" };
    }
    if (state == "failed") {
        // A failed run is terminal, so its Session button is hidden — never point
        // at a control the row won't render. Review its partial work if any, else
        // archive.
        const hasChanges = summary != null && summary.files > 0;
        return hasChanges
            ? { action: "review", label: "Failed with changes — review what it did" }
            : { action: "archive", label: "Failed — archive" };
    }
    if (state == "running" && hasSession) {
        return { action: "session", label: "Working — open the session to watch" };
    }
    return null;
}

// A needs-human moment observed between two polls: an agent finished and wants
// review, or a workspace died. `key` (workspaceId:state) is the de-dupe unit —
// notify at most once per workspace+state per session even if the state bounces.
type RecoderAttentionKind = "review" | "failed";
type RecoderAttentionEvent = {
    workspaceId: string;
    branch: string;
    runtimeId: string;
    kind: RecoderAttentionKind;
    key: string;
};

function workspaceStateMap(workspaces: RecoderWorkspace[]): Map<string, string> {
    return new Map(workspaces.map((ws) => [ws.workspaceId, ws.state]));
}

// Pure: fold the current poll against the previous poll's state map and return
// only OBSERVED needs-human transitions — running → awaiting_review ("ready for
// review") and any live state → failed. A workspace absent from `prevStates`
// (first poll of the session, or launched between polls) is seeded silently:
// we never notify about a state we didn't watch happen, so reopening the hub
// against 10 already-waiting workspaces stays quiet. `alreadyNotified` keys
// (workspaceId:state) suppress repeats when a state bounces back and forth.
function detectAttentionTransitions(
    prevStates: ReadonlyMap<string, string>,
    workspaces: RecoderWorkspace[],
    alreadyNotified: ReadonlySet<string>
): RecoderAttentionEvent[] {
    const events: RecoderAttentionEvent[] = [];
    for (const ws of workspaces) {
        const prev = prevStates.get(ws.workspaceId);
        if (prev == null || prev == ws.state) {
            continue;
        }
        const kind: RecoderAttentionKind =
            prev == "running" && ws.state == "awaiting_review" ? "review" : ws.state == "failed" ? "failed" : null;
        if (kind == null) {
            continue;
        }
        const key = `${ws.workspaceId}:${ws.state}`;
        if (alreadyNotified.has(key)) {
            continue;
        }
        events.push({
            workspaceId: ws.workspaceId,
            branch: ws.branch ?? "",
            runtimeId: ws.runtimeId ?? "",
            kind,
            key,
        });
    }
    return events;
}

type RecoderBoardShow = "active" | "all" | "archived";

function workspaceMatchesQuery(ws: RecoderWorkspace, q: string): boolean {
    if ((ws.branch ?? "").toLowerCase().includes(q)) {
        return true;
    }
    if ((ws.runtimeId ?? "").toLowerCase().includes(q)) {
        return true;
    }
    if (agentLabel(ws.runtimeId ?? "").toLowerCase().includes(q)) {
        return true;
    }
    const meta = ws.metadata;
    const title = typeof meta?.title == "string" ? meta.title : typeof meta?.prompt == "string" ? meta.prompt : "";
    return title.toLowerCase().includes(q);
}

// Pure board filter: the Show dropdown picks the state slice, the text query
// matches task title / branch / agent label. Operates on the UNFILTERED list so
// switching views never refetches.
function filterWorkspaces(workspaces: RecoderWorkspace[], show: RecoderBoardShow, query: string): RecoderWorkspace[] {
    const q = query.trim().toLowerCase();
    return workspaces.filter((ws) => {
        if (show == "active" && isTerminalWorkspaceState(ws.state)) {
            return false;
        }
        if (show == "archived" && !isTerminalWorkspaceState(ws.state)) {
            return false;
        }
        if (q == "") {
            return true;
        }
        return workspaceMatchesQuery(ws, q);
    });
}

const DAY_MS = 86400000;

// null ⇒ no trustworthy timestamp; callers must degrade (bucket "older", no
// label) rather than fabricate an age.
function workspaceTimestamp(ws: RecoderWorkspace): number {
    const raw = ws.createdAt;
    if (typeof raw != "string" || raw == "") {
        return null;
    }
    const t = Date.parse(raw);
    return Number.isNaN(t) ? null : t;
}

function groupTimestamp(group: RecoderWorkspaceGroup): number {
    let latest: number = null;
    for (const ws of group.workspaces) {
        const t = workspaceTimestamp(ws);
        if (t != null && (latest == null || t > latest)) {
            latest = t;
        }
    }
    return latest;
}

type RecoderBoardBucketId = "today" | "yesterday" | "week" | "older";
type RecoderBoardBucket = { id: RecoderBoardBucketId; label: string; groups: RecoderWorkspaceGroup[] };

const BOARD_BUCKET_DEFS: { id: RecoderBoardBucketId; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "week", label: "This week" },
    { id: "older", label: "Older" },
];

function bucketForTimestamp(t: number, now: Date): RecoderBoardBucketId {
    if (t == null) {
        return "older";
    }
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (t >= startOfToday) {
        return "today";
    }
    if (t >= startOfToday - DAY_MS) {
        return "yesterday";
    }
    if (t >= startOfToday - 6 * DAY_MS) {
        return "week";
    }
    return "older";
}

// Fold task groups into fixed recency buckets (newest bucket first, newest group
// first within a bucket). A group's age is its newest sibling's createdAt; a
// group with no parseable createdAt lands in "older" — never a fabricated age.
function bucketWorkspaceGroups(groups: RecoderWorkspaceGroup[], now: Date): RecoderBoardBucket[] {
    const byBucket = new Map<RecoderBoardBucketId, { group: RecoderWorkspaceGroup; ts: number }[]>();
    for (const group of groups) {
        const ts = groupTimestamp(group);
        const id = bucketForTimestamp(ts, now);
        const list = byBucket.get(id) ?? [];
        list.push({ group, ts });
        byBucket.set(id, list);
    }
    const result: RecoderBoardBucket[] = [];
    for (const def of BOARD_BUCKET_DEFS) {
        const entries = byBucket.get(def.id);
        if (entries == null || entries.length == 0) {
            continue;
        }
        entries.sort((a, b) => (b.ts ?? Number.NEGATIVE_INFINITY) - (a.ts ?? Number.NEGATIVE_INFINITY));
        result.push({ id: def.id, label: def.label, groups: entries.map((e) => e.group) });
    }
    return result;
}

// "" ⇒ no trustworthy createdAt; the row simply shows no age.
function formatRelativeAge(createdAt: string, now: Date = new Date()): string {
    if (typeof createdAt != "string" || createdAt == "") {
        return "";
    }
    const t = Date.parse(createdAt);
    if (Number.isNaN(t)) {
        return "";
    }
    const diff = now.getTime() - t;
    if (diff < 60000) {
        return "just now";
    }
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    if (days < 7) {
        return `${days}d ago`;
    }
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
}

export {
    computePairwise,
    computeSiblingOverlap,
    computeSuggestedWinner,
    detectAttentionTransitions,
    groupByTaskGroup,
    filterWorkspaces,
    bucketWorkspaceGroups,
    formatRelativeAge,
    isTerminalWorkspaceState,
    suggestNextAction,
    workspaceStateMap,
    TASK_GROUP_METADATA_KEY,
    type RecoderRowActionId,
    type RecoderRowSuggestion,
    type RecoderAttentionEvent,
    type RecoderAttentionKind,
    type RecoderWorkspace,
    type RecoderDiffSummary,
    type SiblingCompareEntry,
    type ContestedFile,
    type PairwiseDiffDelta,
    type PairwiseCompareView,
    type SiblingOverlap,
    type SuggestedWinner,
    type GroupAttachHint,
    type CompareView,
    type MergeabilityView,
    type ReadinessSignal,
    type ReadinessView,
    type RecoderWorkspaceReadiness,
    type RecoderMergeVerdict,
    type RecoderMergeOutcome,
    type RecoderMergeRecord,
    type RecoderAuditEntry,
    type RecoderWorkspaceGroup,
    type RecoderBoardShow,
    type RecoderBoardBucket,
};
