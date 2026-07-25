// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import type { Workspace } from "@recoder/conductor-ui";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { readErrorReason } from "./recoder-errors";
import { RecoderConductorView } from "./recoder";

// SHELL FUSION: the workspace shape comes from @recoder/conductor-ui (the typed
// client package the cockpit shares) instead of a hand-rolled local mirror. The
// shell renders a lenient subset — the backend may be older/newer, so state stays
// a plain string here and everything beyond the picked fields remains optional.
type RecoderWorkspace = Pick<Workspace, "workspaceId" | "branch" | "runtimeId" | "worktreePath"> & {
    state: string;
    substrate?: string;
    sessionName?: string;
    metadata?: Record<string, unknown>;
};

// First-run readiness surfaced by the conductor /health + /runtimes endpoints —
// which coding agents are installed + whether git is present. Drives the launch
// picker and the getting-started panel shown when there are no workspaces yet.
type RecoderSetup = {
    agents: { runtimeId: string; available: boolean }[];
    git: boolean;
    loaded: boolean;
    // True once refreshSetup has completed at least one attempt (success OR
    // failure). Distinguishes "still probing on cold launch" from a genuinely
    // failed probe so the getting-started panel never falsely claims the backend
    // is down while the first /health request is still in flight.
    probed: boolean;
    // The conductor-pinned tmux binary (CONDUCTOR_TMUX_BIN / engines tmux) from
    // substrate health; "" when unknown. Used so "Open terminal" attaches with
    // the SAME tmux server the conductor's sessions live on.
    tmuxBin: string;
};

// A per-workspace changed-line summary, folded from GET /workspaces/:id/diff/files.
// Binary files (numstat "-") contribute nothing; absent/unavailable diffs yield no
// entry at all so the board never shows a fabricated count.
type RecoderDiffSummary = { additions: number; deletions: number; files: number };

// Outcome of an inline launch. `ok` distinguishes a truthful success from a
// truthful failure whose reason is the backend's verbatim message — never faked.
// On success it optionally carries the FIRST started workspace so the hub can
// offer a real next step (open session / terminal / review) and, for a single
// interactive launch, auto-jump into the session. `sessionName`/`worktreePath`
// are read leniently (absent on an older backend) and never fabricated.
type RecoderLaunchResult = {
    ok: boolean;
    message?: string;
    error?: string;
    workspaceId?: string;
    sessionName?: string;
    worktreePath?: string;
    runtimeId?: string;
    interactive?: boolean;
    parallelCount?: number;
};

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

// One of the four merge-decision signals, in fixed order. `unknown` is a real
// value (we could not judge) — never coerced to a pass.
type ReadinessSignal = {
    id: "lifecycle" | "merge" | "checks" | "preview";
    status: "pass" | "fail" | "pending" | "unknown";
    detail: string;
};

// The folded merge-readiness read-model. `ready` is the hardest gate; `signals`
// is ALWAYS 4, in order: lifecycle, merge, checks, preview.
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

// Workspace states that represent a genuinely-launched worktree. Anything else
// (notably "failed", or an absent state) means the create call returned 2xx but
// the worktree never came up, so the launch must not be reported as a success.
const LAUNCH_HEALTHY_STATES = new Set(["created", "running", "setting_up", "ready", "awaiting_review"]);

// A launched workspace can 2xx with success:true yet carry state "failed" and a
// metadata.error (e.g. worktree creation on a non-git folder). Pull that reason
// out, collapsed to a single truthful line, so the user sees the real cause.
function launchStateReason(workspace: unknown): string {
    if (workspace == null || typeof workspace != "object") {
        return "";
    }
    const meta = (workspace as { metadata?: unknown }).metadata;
    const raw = readErrorReason(meta);
    if (raw == "") {
        return "";
    }
    return raw.replace(/\s+/g, " ").trim().slice(0, 160);
}

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

function genTaskId(): string {
    return `task_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function genTaskGroupId(): string {
    return `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const RECENT_REPOS_KEY = "recoder:recent-repos";
const RECENT_REPOS_CAP = 8;
const LAST_AGENT_KEY = "recoder:last-agent";
const LAST_INTERACTIVE_KEY = "recoder:last-interactive";

// Degrade-safe: a corrupt/absent store must never break launch, so every read
// tolerates bad JSON and non-string entries and falls back to an empty list.
function loadRecentRepos(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_REPOS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x == "string") : [];
    } catch {
        return [];
    }
}

// Seed the launch form from the dev's last choice so we stop re-forcing the first
// ready agent every open. Degrade-safe: a corrupt/absent store falls back to the
// zero-config defaults (empty agent ⇒ preselect first ready; interactive on).
function loadLastAgent(): string {
    try {
        return localStorage.getItem(LAST_AGENT_KEY) ?? "";
    } catch {
        return "";
    }
}

function loadLastInteractive(): boolean {
    try {
        return localStorage.getItem(LAST_INTERACTIVE_KEY) != "false";
    } catch {
        return true;
    }
}

class RecoderViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    workspacesAtom: PrimitiveAtom<RecoderWorkspace[]>;
    loadingAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;
    setupAtom: PrimitiveAtom<RecoderSetup>;
    diffSummariesAtom: PrimitiveAtom<Record<string, RecoderDiffSummary>>;
    launchOpenAtom: PrimitiveAtom<boolean>;
    launchRepoPathAtom: PrimitiveAtom<string>;
    recentReposAtom: PrimitiveAtom<string[]>;
    launchPromptAtom: PrimitiveAtom<string>;
    launchRuntimeIdAtom: PrimitiveAtom<string>;
    launchAlsoRunAtom: PrimitiveAtom<string[]>;
    launchBranchAtom: PrimitiveAtom<string>;
    launchInteractiveAtom: PrimitiveAtom<boolean>;
    postingAtom: PrimitiveAtom<boolean>;
    launchResultAtom: PrimitiveAtom<RecoderLaunchResult>;
    // Human result of the last per-row action (merge / archive), keyed by id.
    rowStatusAtom: PrimitiveAtom<Record<string, string>>;
    // The workspace id whose row action is currently in-flight ("" when idle).
    busyRowAtom: PrimitiveAtom<string>;
    // Parallel-run groups derived from the current workspaces (metadata.taskGroup).
    groupsAtom!: Atom<RecoderWorkspaceGroup[]>;
    // Side-by-side compare view keyed by taskGroup; absent ⇒ never loaded / degraded.
    compareAtom: PrimitiveAtom<Record<string, CompareView>>;
    // The taskGroup whose full compare panel is expanded; "" ⇒ none open.
    compareOpenAtom: PrimitiveAtom<string>;
    // The two workspaceIds picked for the focused A-vs-B pairwise compare inside
    // the open panel; "" ⇒ that slot is unpicked. Reset whenever the panel toggles.
    pairAAtom: PrimitiveAtom<string>;
    pairBAtom: PrimitiveAtom<string>;
    // Merge-decision views (readiness + mergeability) keyed by workspaceId; each
    // side absent ⇒ that probe degraded, never a fabricated verdict.
    readinessAtom: PrimitiveAtom<Record<string, RecoderWorkspaceReadiness>>;
    // The last merge attempt's truthful record keyed by workspaceId — the captured
    // governance verdict (effect/tier/engine) + merge outcome, read by the compare
    // panel and the evidence step. Absent ⇒ no merge attempted yet.
    lastMergeAtom: PrimitiveAtom<Record<string, RecoderMergeRecord>>;
    // The workspaceId of the keyboard-focused board row; "" means none selected.
    // Drives j/k navigation and Enter-to-open; the view syncs it with the list.
    selectedWorkspaceIdAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder";
        this.viewIcon = atom("layer-group");
        this.viewName = atom("Recoder");
        this.workspacesAtom = atom([]) as PrimitiveAtom<RecoderWorkspace[]>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.setupAtom = atom({ agents: [], git: false, loaded: false, probed: false, tmuxBin: "" }) as PrimitiveAtom<RecoderSetup>;
        this.diffSummariesAtom = atom({}) as PrimitiveAtom<Record<string, RecoderDiffSummary>>;
        this.launchOpenAtom = atom(false) as PrimitiveAtom<boolean>;
        this.launchRepoPathAtom = atom(loadRecentRepos()[0] ?? "") as PrimitiveAtom<string>;
        this.recentReposAtom = atom(loadRecentRepos()) as PrimitiveAtom<string[]>;
        this.launchPromptAtom = atom("") as PrimitiveAtom<string>;
        this.launchRuntimeIdAtom = atom(loadLastAgent()) as PrimitiveAtom<string>;
        this.launchAlsoRunAtom = atom([]) as PrimitiveAtom<string[]>;
        this.launchBranchAtom = atom("") as PrimitiveAtom<string>;
        this.launchInteractiveAtom = atom(loadLastInteractive()) as PrimitiveAtom<boolean>;
        this.postingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.launchResultAtom = atom(null) as PrimitiveAtom<RecoderLaunchResult>;
        this.rowStatusAtom = atom({}) as PrimitiveAtom<Record<string, string>>;
        this.busyRowAtom = atom("") as PrimitiveAtom<string>;
        this.compareAtom = atom({}) as PrimitiveAtom<Record<string, CompareView>>;
        this.compareOpenAtom = atom("") as PrimitiveAtom<string>;
        this.pairAAtom = atom("") as PrimitiveAtom<string>;
        this.pairBAtom = atom("") as PrimitiveAtom<string>;
        this.readinessAtom = atom({}) as PrimitiveAtom<Record<string, RecoderWorkspaceReadiness>>;
        this.lastMergeAtom = atom({}) as PrimitiveAtom<Record<string, RecoderMergeRecord>>;
        this.selectedWorkspaceIdAtom = atom("") as PrimitiveAtom<string>;
        this.groupsAtom = atom((get) => groupByTaskGroup(get(this.workspacesAtom)));
    }

    get viewComponent(): ViewComponent {
        return RecoderConductorView;
    }

    // Degrade-safe: a failed/absent health probe leaves setup unloaded (the panel
    // simply shows a neutral getting-started message), never throwing.
    async refreshSetup() {
        try {
            const base = getRecoderBackendUrl();
            const [rtRes, hRes] = await Promise.all([
                fetch(`${base}/api/conductor/runtimes`),
                fetch(`${base}/api/conductor/health`),
            ]);
            const rt = (await rtRes.json())?.data ?? {};
            const h = (await hRes.json())?.data ?? {};
            // openfang is the in-process engine, not a coding agent the user
            // launches into a worktree — keep it out of the "ready agents" list.
            const agents = Array.isArray(rt?.runtimes)
                ? rt.runtimes
                      .filter((r: { runtimeId: string }) => r.runtimeId !== "openfang")
                      .map((r: { runtimeId: string; available: boolean }) => ({
                          runtimeId: r.runtimeId,
                          available: Boolean(r.available),
                      }))
                : [];
            const tmuxBin = typeof h?.substrate?.tmuxBin == "string" ? h.substrate.tmuxBin : "";
            globalStore.set(this.setupAtom, { agents, git: Boolean(h?.available), loaded: true, probed: true, tmuxBin });
        } catch {
            globalStore.set(this.setupAtom, { agents: [], git: false, loaded: false, probed: true, tmuxBin: "" });
        }
    }

    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        let workspaces: RecoderWorkspace[] = [];
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces`);
            const body = await res.json();
            // The conductor wraps the list as { data: { workspaces: [...] } };
            // tolerate a bare { data: [...] } too so an older embedded backend
            // still renders. Never assume a shape we didn't see.
            const data = body?.data;
            const list = Array.isArray(data?.workspaces) ? data.workspaces : Array.isArray(data) ? data : [];
            // Archived workspaces are terminal history, not live work — the board
            // shows only active ones so it never clutters with dead/merged runs.
            workspaces = (list as RecoderWorkspace[]).filter((w) => w.state != "archived");
            globalStore.set(this.workspacesAtom, workspaces);
        } catch (e) {
            globalStore.set(this.errorAtom, e instanceof Error ? e.message : String(e));
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
        // Setup readiness + per-workspace diff summaries run alongside, each
        // independently degrade-safe.
        this.refreshSetup();
        this.loadDiffSummaries(workspaces);
    }

    // Best-effort per-workspace changed-line summary. Each fetch degrades to "no
    // entry" on any failure or a non-available diff, and the whole map is rebuilt
    // from the current list so stale ids are pruned. Never throws, never fabricates.
    async loadDiffSummaries(workspaces: RecoderWorkspace[]) {
        const base = getRecoderBackendUrl();
        const entries = await Promise.all(
            workspaces.map(async (ws): Promise<[string, RecoderDiffSummary] | null> => {
                try {
                    const res = await fetch(
                        `${base}/api/conductor/workspaces/${encodeURIComponent(ws.workspaceId)}/diff/files`
                    );
                    if (!res.ok) {
                        return null;
                    }
                    const data = (await res.json())?.data;
                    if (data?.available !== true || !Array.isArray(data.files)) {
                        return null;
                    }
                    let additions = 0;
                    let deletions = 0;
                    for (const f of data.files) {
                        if (typeof f?.insertions == "number") additions += f.insertions;
                        if (typeof f?.deletions == "number") deletions += f.deletions;
                    }
                    return [ws.workspaceId, { additions, deletions, files: data.files.length }];
                } catch {
                    return null;
                }
            })
        );
        const next: Record<string, RecoderDiffSummary> = {};
        for (const e of entries) {
            if (e) next[e[0]] = e[1];
        }
        globalStore.set(this.diffSummariesAtom, next);
    }

    // Load the side-by-side compare aggregate for one parallel-run group, keyed by
    // taskGroup. Reads { data: { compare } }. Degrade-safe: any failure / non-2xx /
    // missing shape leaves the prior entry untouched (absent → neutral), never
    // throws, never fabricates a compare.
    async loadCompare(taskGroup: string) {
        const tg = taskGroup.trim();
        if (tg == "") {
            return;
        }
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/compare?taskGroup=${encodeURIComponent(tg)}`
            );
            if (!res.ok) {
                return;
            }
            const compare = (await res.json())?.data?.compare;
            if (compare == null || typeof compare != "object") {
                return;
            }
            const cur = globalStore.get(this.compareAtom);
            globalStore.set(this.compareAtom, { ...cur, [tg]: compare as CompareView });
        } catch {
            // degrade-safe: an unreachable/failed compare leaves the map unchanged
        }
    }

    // Toggle the expanded compare panel for a group. Opening a group loads its
    // side-by-side aggregate AND the per-sibling merge-decision views together, so
    // the panel renders contested set + readiness + mergeability in one pass. Each
    // underlying read is independently degrade-safe. Re-toggling collapses it.
    async toggleCompare(taskGroup: string, siblings: { workspaceId: string }[]) {
        const tg = taskGroup.trim();
        if (tg == "") {
            return;
        }
        // A fresh open (or a collapse) always starts the pairwise picker clean so a
        // stale A/B from another group can never bleed into this panel.
        globalStore.set(this.pairAAtom, "");
        globalStore.set(this.pairBAtom, "");
        if (globalStore.get(this.compareOpenAtom) == tg) {
            globalStore.set(this.compareOpenAtom, "");
            return;
        }
        globalStore.set(this.compareOpenAtom, tg);
        await Promise.all([this.loadCompare(tg), this.loadGroupReadiness(siblings)]);
    }

    // Toggle a workspace into the A or B pairwise slot. Re-picking the same slot's
    // current pick clears it; picking a workspace already held by the OTHER slot
    // moves it (the same sibling can never be both A and B).
    pickPair(slot: "A" | "B", workspaceId: string) {
        if (!workspaceId) {
            return;
        }
        const a = globalStore.get(this.pairAAtom);
        const b = globalStore.get(this.pairBAtom);
        if (slot == "A") {
            if (a == workspaceId) {
                globalStore.set(this.pairAAtom, "");
                return;
            }
            globalStore.set(this.pairAAtom, workspaceId);
            if (b == workspaceId) {
                globalStore.set(this.pairBAtom, "");
            }
            return;
        }
        if (b == workspaceId) {
            globalStore.set(this.pairBAtom, "");
            return;
        }
        globalStore.set(this.pairBAtom, workspaceId);
        if (a == workspaceId) {
            globalStore.set(this.pairAAtom, "");
        }
    }

    // Batch the two merge-decision reads (readiness + mergeability) for every
    // sibling of a group, keyed by workspaceId. Each read is INDEPENDENTLY
    // degrade-safe: an absent side means that probe failed, never a fabricated
    // verdict. Merges into the existing map so unrelated groups keep their views.
    async loadGroupReadiness(siblings: { workspaceId: string }[]) {
        const base = getRecoderBackendUrl();
        const entries = await Promise.all(
            siblings.map(async (s): Promise<[string, RecoderWorkspaceReadiness] | null> => {
                const id = s?.workspaceId;
                if (!id) {
                    return null;
                }
                const [readiness, mergeability] = await Promise.all([
                    this.fetchReadiness(base, id),
                    this.fetchMergeability(base, id),
                ]);
                if (readiness == null && mergeability == null) {
                    return null;
                }
                const entry: RecoderWorkspaceReadiness = {};
                if (readiness != null) entry.readiness = readiness;
                if (mergeability != null) entry.mergeability = mergeability;
                return [id, entry];
            })
        );
        const next: Record<string, RecoderWorkspaceReadiness> = { ...globalStore.get(this.readinessAtom) };
        for (const e of entries) {
            if (e) next[e[0]] = e[1];
        }
        globalStore.set(this.readinessAtom, next);
    }

    // GET /workspaces/:id/readiness → { data: ReadinessView }. Degrade-safe: any
    // failure / non-2xx / missing shape yields null (the caller drops the side).
    async fetchReadiness(base: string, workspaceId: string): Promise<ReadinessView> {
        try {
            const res = await fetch(`${base}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/readiness`);
            if (!res.ok) {
                return null;
            }
            const data = (await res.json())?.data;
            return data != null && typeof data == "object" ? (data as ReadinessView) : null;
        } catch {
            return null;
        }
    }

    // GET /workspaces/:id/mergeability → { data: MergeabilityView }. Degrade-safe:
    // any failure / non-2xx / missing shape yields null (the caller drops the side).
    async fetchMergeability(base: string, workspaceId: string): Promise<MergeabilityView> {
        try {
            const res = await fetch(`${base}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/mergeability`);
            if (!res.ok) {
                return null;
            }
            const data = (await res.json())?.data;
            return data != null && typeof data == "object" ? (data as MergeabilityView) : null;
        } catch {
            return null;
        }
    }

    // GET /workspaces/:id/audit → { data: { audit: AuditRecord[] } } — the queryable
    // durable governance Merkle trail sealed by the merge gate. Degrade-safe: any
    // failure / non-2xx / missing shape yields [] (also the truthful solo-desktop
    // result, which seals no local store). Read by the evidence step so an exported
    // artifact prefers the sealed durable record over the client-assembled fallback.
    async fetchWorkspaceAudit(workspaceId: string): Promise<RecoderAuditEntry[]> {
        if (!workspaceId) {
            return [];
        }
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/audit`
            );
            if (!res.ok) {
                return [];
            }
            const audit = (await res.json())?.data?.audit;
            return Array.isArray(audit) ? (audit as RecoderAuditEntry[]) : [];
        } catch {
            return [];
        }
    }

    // Inline launch — the product loop's entry point. Launches the primary agent
    // plus any deliberately-ticked parallel agents, each in its OWN worktree, all
    // sharing ONE taskGroup so the compare board can aggregate siblings. Sends the
    // exact body the POST /workspaces handler requires (spaceId/projectId/taskId/
    // repoPath/runtimeId). Truthful partial results: each started workspace stays
    // started; the first failure names its agent and stops. Never fabricates a win.
    async launch() {
        const repoPath = globalStore.get(this.launchRepoPathAtom).trim();
        const primary = globalStore.get(this.launchRuntimeIdAtom).trim();
        if (repoPath == "" || primary == "") {
            globalStore.set(this.launchResultAtom, { ok: false, error: "Pick a folder and choose an agent." });
            return;
        }
        const also = globalStore.get(this.launchAlsoRunAtom).filter((id) => id != "" && id != primary);
        const agents = [primary, ...also];
        const prompt = globalStore.get(this.launchPromptAtom).trim();
        const branch = globalStore.get(this.launchBranchAtom).trim();
        const interactive = globalStore.get(this.launchInteractiveAtom);
        // A shared branch across siblings would collide across worktrees, so a
        // user branch is honored only for a solo launch; parallel siblings are
        // auto-named per agent server-side.
        const taskGroup = agents.length > 1 ? genTaskGroupId() : "";
        globalStore.set(this.postingAtom, true);
        globalStore.set(this.launchResultAtom, null);
        const base = getRecoderBackendUrl();
        let started = 0;
        let degraded = 0;
        let lastDegradedReason = "";
        let firstStarted: { workspaceId: string; sessionName?: string; worktreePath?: string; runtimeId: string } = null;
        try {
            for (const agent of agents) {
                const reqBody = {
                    spaceId: "default",
                    projectId: "default",
                    taskId: genTaskId(),
                    repoPath,
                    runtimeId: agent,
                    ...(prompt != "" ? { prompt } : {}),
                    ...(branch != "" && agents.length == 1 ? { branch } : {}),
                    ...(interactive ? { interactive: true } : {}),
                    ...(taskGroup != "" ? { taskGroup } : {}),
                };
                const res = await fetch(`${base}/api/conductor/workspaces`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(reqBody),
                });
                const parsed = await res.json().catch(() => ({}));
                if (!res.ok || !parsed?.success) {
                    const reason =
                        readErrorReason(parsed) ||
                        (typeof parsed?.error == "string" && parsed.error) ||
                        `HTTP ${res.status}`;
                    throw new Error(reason);
                }
                const workspace = parsed?.data?.workspace;
                const state = workspace != null && typeof workspace.state == "string" ? workspace.state : "";
                if (!LAUNCH_HEALTHY_STATES.has(state)) {
                    degraded += 1;
                    lastDegradedReason = launchStateReason(workspace) || (state != "" ? `state ${state}` : "no workspace state");
                    continue;
                }
                started += 1;
                if (firstStarted == null) {
                    const wsId = typeof workspace?.workspaceId == "string" ? workspace.workspaceId : "";
                    if (wsId != "") {
                        firstStarted = { workspaceId: wsId, runtimeId: agent };
                        if (typeof workspace.sessionName == "string") {
                            firstStarted.sessionName = workspace.sessionName;
                        }
                        if (typeof workspace.worktreePath == "string") {
                            firstStarted.worktreePath = workspace.worktreePath;
                        }
                    }
                }
            }
            this.rememberRepo(repoPath);
            this.rememberAgent(primary, interactive);
            const total = agents.length;
            if (degraded > 0) {
                // A worktree that never came up is a real failure — keep the panel
                // open with the true reason instead of flashing a success toast.
                const summary =
                    total > 1
                        ? `Launched ${started} of ${total} — ${degraded} failed at worktree`
                        : "Workspace failed at worktree";
                const detail = lastDegradedReason != "" ? ` — ${lastDegradedReason}` : "";
                globalStore.set(this.launchResultAtom, { ok: false, error: `${summary}${detail}` });
                await this.refresh();
                return;
            }
            globalStore.set(this.launchResultAtom, {
                ok: true,
                message: total > 1 ? `Launched ${started} agents.` : "Workspace created.",
                ...(firstStarted != null
                    ? {
                          workspaceId: firstStarted.workspaceId,
                          runtimeId: firstStarted.runtimeId,
                          ...(firstStarted.sessionName != null ? { sessionName: firstStarted.sessionName } : {}),
                          ...(firstStarted.worktreePath != null ? { worktreePath: firstStarted.worktreePath } : {}),
                      }
                    : {}),
                interactive,
                parallelCount: also.length,
            });
            globalStore.set(this.launchOpenAtom, false);
            globalStore.set(this.launchPromptAtom, "");
            globalStore.set(this.launchAlsoRunAtom, []);
            await this.refresh();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            globalStore.set(this.launchResultAtom, {
                ok: false,
                error: started > 0 ? `Started ${started} of ${agents.length} - ${msg}` : msg,
            });
            if (started > 0) {
                await this.refresh();
            }
        } finally {
            globalStore.set(this.postingAtom, false);
        }
    }

    // Persist a successfully-launched repo so returning users one-click it back.
    // De-duplicated, most-recent-first, capped. Degrade-safe: a corrupt/absent
    // store must never break launch, so the whole write is guarded.
    rememberRepo(repoPath: string) {
        const p = repoPath.trim();
        if (p == "") {
            return;
        }
        try {
            const next = [p, ...loadRecentRepos().filter((x) => x != p)].slice(0, RECENT_REPOS_CAP);
            localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(next));
            globalStore.set(this.recentReposAtom, next);
        } catch {
            // degrade-safe: a corrupt/absent store must never break launch
        }
    }

    // Persist the last-used agent + interactive choice so the next launch panel
    // seeds from the dev's real preference instead of re-forcing the first ready
    // agent. Degrade-safe: a corrupt store must never break launch.
    rememberAgent(runtimeId: string, interactive: boolean) {
        try {
            if (runtimeId != "") {
                localStorage.setItem(LAST_AGENT_KEY, runtimeId);
            }
            localStorage.setItem(LAST_INTERACTIVE_KEY, interactive ? "true" : "false");
        } catch {
            // degrade-safe: a corrupt store must never break launch
        }
    }

    setRowStatus(workspaceId: string, text: string) {
        const cur = globalStore.get(this.rowStatusAtom);
        globalStore.set(this.rowStatusAtom, { ...cur, [workspaceId]: text });
    }

    setLastMerge(workspaceId: string, record: RecoderMergeRecord) {
        const cur = globalStore.get(this.lastMergeAtom);
        globalStore.set(this.lastMergeAtom, { ...cur, [workspaceId]: record });
    }

    // After a workspace's delivered state changes (a merge), re-read the compare
    // aggregate + per-sibling readiness/mergeability for whichever loaded group
    // contains it, so its badges reflect the post-merge truth instead of the
    // once-loaded pre-merge verdict. Degrade-safe: if no loaded compare group
    // holds this workspace (e.g. a solo board-row merge), there is nothing to
    // refresh and it returns without a network call. Each underlying read is
    // itself degrade-safe and never fabricates a verdict.
    async refreshCompareForWorkspace(workspaceId: string) {
        if (!workspaceId) {
            return;
        }
        const compare = globalStore.get(this.compareAtom);
        for (const [tg, view] of Object.entries(compare)) {
            const siblings = view?.siblings ?? [];
            if (!siblings.some((s) => s.workspaceId == workspaceId)) {
                continue;
            }
            await Promise.all([
                this.loadCompare(tg),
                this.loadGroupReadiness(siblings.map((s) => ({ workspaceId: s.workspaceId }))),
            ]);
            return;
        }
    }

    // Merge the workspace into its base — the "review → merge" close of the loop.
    // Captures the governance verdict TRUTHFULLY: a 200 parses { merge, verdict }
    // and stashes the exact effect/tier/engine for the evidence step; a 403 surfaces
    // the gate's reason (needs approval / denied); a 503 surfaces "merge could not
    // complete — <reason>". In a solo desktop the merge click IS the approval
    // (server-side). Never fabricates a merge — every branch reads the real body.
    async mergeWorkspace(workspaceId: string) {
        if (!workspaceId) {
            return;
        }
        globalStore.set(this.busyRowAtom, workspaceId);
        this.setRowStatus(workspaceId, "");
        const at = new Date().toISOString();
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/merge`,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
            );
            const body = await res.json().catch(() => null);
            if (res.ok) {
                const data = (body as { data?: unknown })?.data as
                    | { merge?: RecoderMergeOutcome; verdict?: RecoderMergeVerdict }
                    | undefined;
                const merge = data?.merge;
                const verdict = data?.verdict;
                const merged = merge?.merged == true;
                this.setLastMerge(workspaceId, {
                    status: merged ? "merged" : "no_change",
                    ...(merge != null ? { merge } : {}),
                    ...(verdict != null ? { verdict } : {}),
                    at,
                });
                this.setRowStatus(workspaceId, merged ? "Merged." : "Already up to date - nothing to merge.");
                await this.refresh();
                // A merge flips this sibling's delivered state, so the compare
                // panel's readiness/mergeability badges (loaded once at open) go
                // stale. Re-read them for the whole group so the merged branch
                // stops reading a pre-merge 'ready'/'clean' next to a Merged marker.
                await this.refreshCompareForWorkspace(workspaceId);
                return;
            }
            const reason = readErrorReason(body);
            if (res.status == 403) {
                this.setLastMerge(workspaceId, { status: "blocked", ...(reason ? { reason } : {}), at });
                this.setRowStatus(workspaceId, reason || "Merge blocked - needs approval.");
                return;
            }
            if (res.status == 503) {
                this.setLastMerge(workspaceId, { status: "failed", ...(reason ? { reason } : {}), at });
                this.setRowStatus(workspaceId, `Merge could not complete - ${reason || "operation failed"}.`);
                return;
            }
            this.setLastMerge(workspaceId, { status: "failed", ...(reason ? { reason } : {}), at });
            this.setRowStatus(workspaceId, reason || `Merge failed (${res.status}).`);
        } catch {
            this.setRowStatus(workspaceId, "Merge unavailable - Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.busyRowAtom, "");
        }
    }

    // Archive a finished workspace, then refresh so the row drops out. Degrade-safe:
    // a non-2xx surfaces the backend's reason; a thrown fetch surfaces "unreachable".
    async archiveWorkspace(workspaceId: string) {
        if (!workspaceId) {
            return;
        }
        globalStore.set(this.busyRowAtom, workspaceId);
        this.setRowStatus(workspaceId, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/archive`,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
            );
            if (res.ok) {
                await this.refresh();
                return;
            }
            const body = await res.json().catch(() => null);
            const reason = readErrorReason(body);
            this.setRowStatus(workspaceId, reason || `Archive failed (${res.status}).`);
        } catch {
            this.setRowStatus(workspaceId, "Archive unavailable - Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.busyRowAtom, "");
        }
    }
}

export {
    RecoderViewModel,
    groupByTaskGroup,
    computePairwise,
    computeSuggestedWinner,
    TASK_GROUP_METADATA_KEY,
    type RecoderWorkspace,
    type RecoderSetup,
    type RecoderDiffSummary,
    type RecoderLaunchResult,
    type RecoderWorkspaceGroup,
    type SiblingCompareEntry,
    type ContestedFile,
    type PairwiseDiffDelta,
    type PairwiseCompareView,
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
};
