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
    Partial<Pick<Workspace, "createdAt" | "updatedAt">> & {
        state: string;
        substrate?: string;
        sessionName?: string;
        metadata?: Record<string, unknown>;
        // The repo this workspace belongs to (derived from repoPath at launch, see
        // deriveProjectIdentity). Absent on legacy rows launched before project
        // identity existed — those group under the DEFAULT_PROJECT_ID bucket.
        projectId?: string;
        // Live attention classification merged from GET /api/conductor/views (the
        // backend WorkspaceView.attention: awaiting_approval / agent_idle_prompt /
        // error / review_ready / working / unknown). Absent when the views probe
        // degraded or the backend is older — the board then shows NO badge (never a
        // fabricated attention). Kept as a plain string so an unknown backend value
        // degrades to "no badge" rather than a type break.
        attention?: string;
    };

// A per-workspace changed-line summary, folded from GET /workspaces/:id/diff/files.
// Binary files (numstat "-") contribute nothing; absent/unavailable diffs yield no
// entry at all so the board never shows a fabricated count.
type RecoderDiffSummary = { additions: number; deletions: number; files: number };

// Change-detection key gating a workspace's diff-summary refetch. Every summary
// fetch shells host git on the backend, so the 6s board poll must not fan one out
// per workspace unconditionally: a row is re-asked only when this key advances.
function diffSummaryFetchKey(ws: RecoderWorkspace): string {
    return `${ws.state}|${ws.updatedAt ?? ""}`;
}

// "running" rows always refetch — a live agent mutates the worktree without the
// control-plane row (state/updatedAt) moving, so the key alone can't see it. An
// absent prevKey (first sight of this id) never matches, so new rows fetch once.
function shouldRefetchDiffSummary(ws: RecoderWorkspace, prevKey: string): boolean {
    return ws.state == "running" || prevKey != diffSummaryFetchKey(ws);
}

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
type ReadinessPr = { number: number; state: "open" | "closed" | "merged"; draft: boolean; url: string };

type ReadinessView = {
    verdict: "ready" | "blocked" | "not_ready" | "unknown" | "delivered" | "terminal";
    signals: ReadinessSignal[];
    blockers: string[];
    // The open PR's identity (number/state/draft/url) when one exists; null otherwise.
    pr?: ReadinessPr | null;
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

// The sibling states past the agent's OWN work — the fan-out has FINISHED for this
// sibling (it is reviewable, being delivered, delivered, or dead). Everything else
// (created / setting_up / ready / running / awaiting_approval / changes_requested —
// and any unknown future state) is treated as still in flight, so cluster readiness
// is never claimed prematurely: an unknown state keeps converge quiet, never fakes
// "done".
const SETTLED_SIBLING_STATES: ReadonlySet<string> = new Set([
    "awaiting_review",
    "merging",
    "merged",
    "failed",
    "cancelled",
    "archived",
]);

function isSettledSiblingState(state: string): boolean {
    return SETTLED_SIBLING_STATES.has(state);
}

// The convergence phase of a parallel-run cluster — the board's ENTRY POINT into
// compare/converge, and the read that decides whether the board SHOUTS "converge
// now" (quietly) or stays calm:
//   - "running": the fan-out is still going (>=1 sibling has not settled). Converge
//     is premature — it stays quiet with a truthful reason and a live "M of N done".
//   - "ready": every sibling has settled AND real divergence exists (2+ agents
//     contest a file) — converge is the cluster's ONE primary next step.
//   - "agree": every sibling settled but NOTHING is contested — there is nothing to
//     converge, so we say so and point at review (never a fabricated converge CTA).
// When the compare aggregate is not loaded yet the contested set is UNKNOWN; an
// all-settled cluster is then "ready" (offer Compare & Converge — comparing is the
// discovery step) with file counts omitted rather than invented.
type ClusterConvergePhase = "running" | "ready" | "agree";

type ClusterState = {
    phase: ClusterConvergePhase;
    // N — the sibling count of the cluster.
    agentCount: number;
    // How many siblings have settled (past running); drives the "M of N done" read.
    settledCount: number;
    // Whether the contested set has been computed (the compare aggregate loaded).
    // false ⇒ divergedAgents/divergedFiles are 0 as "unknown", never as "none".
    divergenceKnown: boolean;
    // M — distinct agents that contest at least one file (0 when unknown).
    divergedAgents: number;
    // K — contested file count (0 when unknown).
    divergedFiles: number;
    // The board's ONE accent for this cluster: converge is the primary next action.
    convergePrimary: boolean;
    // Truthful reason converge is NOT primary ("" when it is). Surfaced on the quiet
    // affordance so the board never hides WHY it isn't offering converge.
    reason: string;
    // Compact spec line: "N agents · M diverged on K files" (ready, known),
    // "N agents · ready to compare" (ready, unknown), "N agents · M of N done"
    // (running), "N agents · agree — no divergence" (agree).
    summary: string;
    // The state detail without the leading "N agents · " (the header renders the
    // agent count separately). Never "" — always a truthful phrase.
    detail: string;
    // "M of N done" while running; "" otherwise.
    progress: string;
    // Early collision heads-up derived from the SAME contested set converge uses,
    // surfaced BEFORE converge as a calm, informational read (never an error):
    //   - "M agents overlap on K files" when siblings touch shared files,
    //   - "no overlap — agents on separate files" when the contested set loaded clean,
    //   - "" when the contested set is not loaded yet (never a fabricated count).
    // divergedAgents/divergedFiles ARE the overlap signal — this only phrases them,
    // so the board can warn about a coming collision earlier than the converge CTA.
    overlap: string;
};

function pluralizeFiles(n: number): string {
    return n == 1 ? "1 file" : `${n} files`;
}

// Pure: phrase the early-overlap heads-up from the already-derived divergence read.
// "" when the contested set is not loaded (divergenceKnown false) so the header
// shows nothing rather than fabricate a count. When known, a contested file always
// carries 2+ agents, so divergedAgents is >= 2 whenever divergedFiles > 0 — "agents"
// is always plural here.
function deriveOverlapSignal(divergenceKnown: boolean, divergedAgents: number, divergedFiles: number): string {
    if (!divergenceKnown) {
        return "";
    }
    if (divergedFiles == 0) {
        return "no overlap — agents on separate files";
    }
    return `${divergedAgents} agents overlap on ${pluralizeFiles(divergedFiles)}`;
}

// Pure + degrade-safe: derive one parallel-run cluster's convergence phase from its
// siblings' real states + (when loaded) the group contested set. Returns null for a
// solo/ungrouped workspace (fewer than 2 siblings) — there is nothing to converge,
// so the board renders it as a plain row with NO converge affordance. Never
// fabricates a count or a readiness it cannot prove (see ClusterState).
function deriveClusterState(workspaces: RecoderWorkspace[], compareView?: CompareView): ClusterState | null {
    const agentCount = workspaces.length;
    if (agentCount < 2) {
        return null;
    }
    const settledCount = workspaces.filter((ws) => isSettledSiblingState(ws.state)).length;
    const allSettled = settledCount == agentCount;

    const contested = compareView?.contested;
    const divergenceKnown = contested != null;
    const divergedFiles = divergenceKnown ? contested.length : 0;
    const divergedAgents = divergenceKnown ? new Set(contested.flatMap((c) => c.workspaceIds)).size : 0;
    const overlap = deriveOverlapSignal(divergenceKnown, divergedAgents, divergedFiles);

    if (!allSettled) {
        const detail = `${settledCount} of ${agentCount} done`;
        return {
            phase: "running",
            agentCount,
            settledCount,
            divergenceKnown,
            divergedAgents,
            divergedFiles,
            convergePrimary: false,
            reason: "agents still running",
            summary: `${agentCount} agents · ${detail}`,
            detail,
            progress: detail,
            overlap,
        };
    }

    if (divergenceKnown && divergedFiles == 0) {
        const detail = "agree — no divergence";
        return {
            phase: "agree",
            agentCount,
            settledCount,
            divergenceKnown,
            divergedAgents,
            divergedFiles,
            convergePrimary: false,
            reason: "agents agree — no convergence needed",
            summary: `${agentCount} agents · ${detail}`,
            detail,
            progress: "",
            overlap,
        };
    }

    const detail = divergenceKnown
        ? `${divergedAgents} diverged on ${pluralizeFiles(divergedFiles)}`
        : "ready to compare";
    return {
        phase: "ready",
        agentCount,
        settledCount,
        divergenceKnown,
        divergedAgents,
        divergedFiles,
        convergePrimary: true,
        reason: "",
        summary: `${agentCount} agents · ${detail}`,
        detail,
        progress: "",
        overlap,
    };
}

// Terminal-dead states: history, not live work. The default Active board view
// hides them; the Archived view shows exactly them.
function isTerminalWorkspaceState(state: string): boolean {
    return state == "archived" || state == "failed";
}

// The bucket for workspaces with no derivable project (empty repoPath, or legacy
// rows launched before project identity). One shared literal so the launch POST,
// the grouping, and the filter all agree.
const DEFAULT_PROJECT_ID = "default";

// A repo's identity for grouping/filtering the board. `projectId` is a stable,
// path-safe slug shared by every workspace of the repo; `projectName` is the
// display name. When the path follows the ghq/Recoder-managed layout
// (root/host/owner/repo), `host`/`owner`/`repo` are populated too, so cards can
// group under the {host,owner,repo} key and same-named repos across owners stay
// distinct. Absent for a plain (non-ghq) path.
type ProjectIdentity = {
    projectId: string;
    projectName: string;
    host?: string;
    owner?: string;
    repo?: string;
};

// A path segment that looks like a git HOST — a bare domain (label(.label)+ with
// a letters-only TLD). Used to detect the ghq `host/owner/repo` triple on disk.
function isHostSegment(segment: string): boolean {
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(segment);
}

// Pure: detect the ghq layout convention (x-motemen/ghq) in a path — the FIRST
// host-like segment followed by an owner and a repo segment. Returns the triple,
// or null when the path isn't ghq-shaped (the caller then falls back to basename).
// Deeper segments after repo (a worktree subdir) are ignored; standard ghq is the
// 3-level host/owner/repo.
function parseGhqLayout(segments: readonly string[]): { host: string; owner: string; repo: string } | null {
    for (let i = 0; i + 2 < segments.length; i += 1) {
        if (isHostSegment(segments[i]) && segments[i + 1] != "" && segments[i + 2] != "") {
            return { host: segments[i], owner: segments[i + 1], repo: segments[i + 2] };
        }
    }
    return null;
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

// Pure: derive a repo's identity from its filesystem path. A ghq-layout path
// (root/host/owner/repo) yields projectName `owner/repo` and a
// `owner-repo`-slugged id (so two repos with the same name under different owners
// never collide); any other path uses the basename. Trailing slashes are ignored;
// an empty or slug-less path degrades to DEFAULT_PROJECT_ID (never throws/blank).
function deriveProjectIdentity(repoPath: string): ProjectIdentity {
    const trimmed = (repoPath ?? "").trim().replace(/[/\\]+$/, "");
    if (trimmed == "") {
        return { projectId: DEFAULT_PROJECT_ID, projectName: DEFAULT_PROJECT_ID };
    }
    const segments = trimmed.split(/[/\\]+/).filter((s) => s != "");
    const ghq = parseGhqLayout(segments);
    if (ghq != null) {
        const slug = slugify(`${ghq.owner}-${ghq.repo}`);
        return {
            projectId: slug != "" ? slug : DEFAULT_PROJECT_ID,
            projectName: `${ghq.owner}/${ghq.repo}`,
            host: ghq.host,
            owner: ghq.owner,
            repo: ghq.repo,
        };
    }
    const base = segments[segments.length - 1] ?? "";
    const projectName = base != "" ? base : DEFAULT_PROJECT_ID;
    const slug = slugify(projectName);
    return { projectId: slug != "" ? slug : DEFAULT_PROJECT_ID, projectName };
}

// The projectId a workspace groups under — its own, or DEFAULT_PROJECT_ID when a
// legacy row carries none. Kept in one place so grouping and filtering agree.
function workspaceProjectId(ws: RecoderWorkspace): string {
    const id = (ws.projectId ?? "").trim();
    return id != "" ? id : DEFAULT_PROJECT_ID;
}

// Pure: the searchable text for a workspace, folded for the command palette so
// ⌘K finds a workspace by its branch, project, agent, state, or task title/prompt
// — not just by a command's visible label. Non-string metadata degrades to ''.
function workspaceSearchKeywords(ws: RecoderWorkspace): string {
    const meta = ws.metadata ?? {};
    const title = typeof meta.title == "string" ? meta.title : "";
    const prompt = typeof meta.prompt == "string" ? meta.prompt : "";
    return [ws.branch ?? "", workspaceProjectId(ws), agentLabel(ws.runtimeId ?? ""), ws.state ?? "", title, prompt]
        .filter((s) => s != "")
        .join(" ");
}

// One project's roll-up for the projects filter: its id and how many workspaces
// (of the passed set) belong to it.
type ProjectSummary = {
    projectId: string;
    count: number;
};

// Pure: the distinct projects across a workspace set, each with its count, sorted
// by id so the filter dropdown is stable. Empty in → empty out.
function deriveProjects(workspaces: readonly RecoderWorkspace[]): ProjectSummary[] {
    const counts = new Map<string, number>();
    for (const ws of workspaces) {
        const id = workspaceProjectId(ws);
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([projectId, count]) => ({ projectId, count }))
        .sort((a, b) => a.projectId.localeCompare(b.projectId));
}

// Pure: keep only the workspaces of one project. An empty `projectId` means "all
// projects" (no filtering) so the board's default shows everything.
function filterByProject(workspaces: readonly RecoderWorkspace[], projectId: string): RecoderWorkspace[] {
    const target = projectId.trim();
    if (target == "") {
        return [...workspaces];
    }
    return workspaces.filter((ws) => workspaceProjectId(ws) == target);
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
// review, a workspace died, or (attention axis) the agent stopped mid-run and is
// waiting on the user — for input (`needs_input`) or an approval/permission
// (`awaiting_approval`). `key` is the de-dupe unit — notify at most once per
// workspace+signal per session even if it bounces.
type RecoderAttentionKind = "review" | "failed" | "needs_input" | "awaiting_approval";
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

// The backend AttentionState values that mean "an agent stopped mid-run and is
// waiting on the human" — the walk-away-get-pinged moment distinct from the
// state-driven review_ready/failed transitions. `review_ready` is intentionally
// NOT here: it is already surfaced by the state-based awaiting_review path.
const NEEDS_INPUT_ATTENTIONS: ReadonlySet<string> = new Set(["agent_idle_prompt", "awaiting_approval"]);

// True only for a backend attention that means the human must act. Absent/unknown/
// working/review_ready/error all return false — the board badges nothing for them.
function isNeedsInputAttention(attention: string | undefined): boolean {
    return attention != null && NEEDS_INPUT_ATTENTIONS.has(attention);
}

// The board badge text for a needs-input attention; "" for anything else so a row
// only ever shows a badge for a signal the backend actually reported.
function attentionBadgeLabel(attention: string | undefined): string {
    if (attention == "agent_idle_prompt") {
        return "Needs input";
    }
    if (attention == "awaiting_approval") {
        return "Needs approval";
    }
    return "";
}

// The notification kind for a needs-input attention, or null when the attention
// is not a needs-input signal. Keeps the mapping in one truthful place.
function needsInputKind(attention: string): RecoderAttentionKind | null {
    if (attention == "agent_idle_prompt") {
        return "needs_input";
    }
    if (attention == "awaiting_approval") {
        return "awaiting_approval";
    }
    return null;
}

// Snapshot every workspace's attention (absent → "") so the next poll can detect a
// transition INTO a needs-input signal. Mirrors workspaceStateMap: EVERY workspace
// is recorded so a first-seen row seeds silently rather than firing a stale ping.
function workspaceAttentionMap(workspaces: RecoderWorkspace[]): Map<string, string> {
    return new Map(workspaces.map((ws) => [ws.workspaceId, ws.attention ?? ""]));
}

// Pure: fold the current poll's attention against the previous poll's attention
// map and return only OBSERVED transitions INTO a needs-input signal
// (agent_idle_prompt / awaiting_approval) — the "walk away, get pinged" moment. A
// workspace absent from `prevAttention` (first poll of the session, or launched
// between polls) is seeded silently; a workspace already needing input last poll
// does not re-fire (no ping when it merely switches between two needs-input
// signals). `alreadyNotified` keys (`workspaceId:attn:<attention>`) suppress
// repeats when a signal bounces. Only the caller's SUCCESSFUL views read feeds
// this, so a degraded probe never manufactures a transition.
function detectNeedsInputTransitions(
    prevAttention: ReadonlyMap<string, string>,
    workspaces: RecoderWorkspace[],
    alreadyNotified: ReadonlySet<string>
): RecoderAttentionEvent[] {
    const events: RecoderAttentionEvent[] = [];
    for (const ws of workspaces) {
        const attention = ws.attention ?? "";
        const kind = needsInputKind(attention);
        if (kind == null) {
            continue;
        }
        const prev = prevAttention.get(ws.workspaceId);
        // First-seen row: seed silently (never notify a signal we didn't watch
        // begin). A row already needing input last poll is not a fresh transition.
        if (prev == null || isNeedsInputAttention(prev)) {
            continue;
        }
        const key = `${ws.workspaceId}:attn:${attention}`;
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

// Pure: fold the on-demand archived history (GET /workspaces/archived) under the
// live poll list (GET /workspaces?archived=false). On an id collision the LIVE
// copy wins: the poll refreshes every 6s so it is the fresher read — a row the
// history still claims while the poll says it's live resolves within one poll
// tick, never a duplicated row.
function mergeArchivedHistory(live: RecoderWorkspace[], archived: RecoderWorkspace[]): RecoderWorkspace[] {
    if (archived == null || archived.length == 0) {
        return live;
    }
    const liveIds = new Set(live.map((ws) => ws.workspaceId));
    return [...live, ...archived.filter((ws) => !liveIds.has(ws.workspaceId))];
}

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
    detectNeedsInputTransitions,
    isNeedsInputAttention,
    attentionBadgeLabel,
    workspaceAttentionMap,
    NEEDS_INPUT_ATTENTIONS,
    groupByTaskGroup,
    isSettledSiblingState,
    deriveClusterState,
    SETTLED_SIBLING_STATES,
    filterWorkspaces,
    mergeArchivedHistory,
    diffSummaryFetchKey,
    shouldRefetchDiffSummary,
    bucketWorkspaceGroups,
    formatRelativeAge,
    isTerminalWorkspaceState,
    suggestNextAction,
    workspaceStateMap,
    deriveProjectIdentity,
    deriveProjects,
    filterByProject,
    parseGhqLayout,
    workspaceProjectId,
    workspaceSearchKeywords,
    DEFAULT_PROJECT_ID,
    TASK_GROUP_METADATA_KEY,
    type ProjectIdentity,
    type ProjectSummary,
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
    type ClusterConvergePhase,
    type ClusterState,
};
