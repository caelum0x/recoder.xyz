// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { agentLabel } from "./recoder-agent-labels";
import {
    bucketWorkspaceGroups,
    filterWorkspaces,
    groupByTaskGroup,
    isTerminalWorkspaceState,
    type CompareView,
    type MergeabilityView,
    type ReadinessView,
    type RecoderAuditEntry,
    type RecoderBoardBucket,
    type RecoderBoardShow,
    type RecoderDiffSummary,
    type RecoderMergeOutcome,
    type RecoderMergeRecord,
    type RecoderMergeVerdict,
    type RecoderWorkspace,
    type RecoderWorkspaceGroup,
    type RecoderWorkspaceReadiness,
} from "./recoder-board-logic";
import { isGitHubRepoUrl, parseCloneResponse } from "./recoder-clone-logic";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { readErrorReason } from "./recoder-errors";
import { RecoderConductorView } from "./recoder";

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
    // Every workspace the backend returned, INCLUDING archived + failed, so the
    // board's Show views (Active / All / Archived) switch without a refetch.
    allWorkspacesAtom: PrimitiveAtom<RecoderWorkspace[]>;
    // The live (non-terminal) workspaces — what the palette and getting-started
    // logic reason over regardless of the board's current Show filter.
    workspacesAtom!: Atom<RecoderWorkspace[]>;
    loadingAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;
    setupAtom: PrimitiveAtom<RecoderSetup>;
    diffSummariesAtom: PrimitiveAtom<Record<string, RecoderDiffSummary>>;
    launchOpenAtom: PrimitiveAtom<boolean>;
    commandPaletteOpenAtom: PrimitiveAtom<boolean>;
    shortcutsOpenAtom: PrimitiveAtom<boolean>;
    launchRepoPathAtom: PrimitiveAtom<string>;
    // Advance, non-blocking hint: false once the picked folder is confirmed NOT a
    // git repo (checked read-only at pick time). Launch stays enabled — the backend
    // owns the truth; this only warns before the round trip. Default true = no warning.
    launchRepoIsGitAtom: PrimitiveAtom<boolean>;
    recentReposAtom: PrimitiveAtom<string[]>;
    launchPromptAtom: PrimitiveAtom<string>;
    launchRuntimeIdAtom: PrimitiveAtom<string>;
    launchAlsoRunAtom: PrimitiveAtom<string[]>;
    launchBranchAtom: PrimitiveAtom<string>;
    launchInteractiveAtom: PrimitiveAtom<boolean>;
    postingAtom: PrimitiveAtom<boolean>;
    launchResultAtom: PrimitiveAtom<RecoderLaunchResult>;
    // Live per-agent progress during a multi-agent launch (workspaces POST serially,
    // each a worktree + tmux session that takes seconds); "" when idle/single-agent.
    launchProgressAtom: PrimitiveAtom<string>;
    // Human result of the last per-row action (merge / archive), keyed by id.
    rowStatusAtom: PrimitiveAtom<Record<string, string>>;
    // The workspace id whose row action is currently in-flight ("" when idle).
    busyRowAtom: PrimitiveAtom<string>;
    // Parallel-run groups derived from the current workspaces (metadata.taskGroup).
    groupsAtom!: Atom<RecoderWorkspaceGroup[]>;
    // Board filter bar state: free-text query + the Show view.
    boardFilterAtom: PrimitiveAtom<string>;
    boardShowAtom: PrimitiveAtom<RecoderBoardShow>;
    // The board's visible rows: Show view + text query applied to the unfiltered list.
    boardWorkspacesAtom!: Atom<RecoderWorkspace[]>;
    // The visible rows grouped by taskGroup and folded into recency buckets —
    // exactly the order the board renders and keyboard nav walks.
    boardBucketsAtom!: Atom<RecoderBoardBucket[]>;
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
    // "Open GitHub project" clone modal state. destDir "" means "use the
    // backend's default repos folder" (the POST omits it) — the client never
    // fabricates the conductor's configured base dir.
    cloneOpenAtom: PrimitiveAtom<boolean>;
    cloneUrlAtom: PrimitiveAtom<string>;
    cloneDestDirAtom: PrimitiveAtom<string>;
    cloningAtom: PrimitiveAtom<boolean>;
    cloneErrorAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder";
        this.viewIcon = atom("layer-group");
        this.viewName = atom("Recoder");
        this.allWorkspacesAtom = atom([]) as PrimitiveAtom<RecoderWorkspace[]>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.setupAtom = atom({ agents: [], git: false, loaded: false, probed: false, tmuxBin: "" }) as PrimitiveAtom<RecoderSetup>;
        this.diffSummariesAtom = atom({}) as PrimitiveAtom<Record<string, RecoderDiffSummary>>;
        this.launchOpenAtom = atom(false) as PrimitiveAtom<boolean>;
        this.commandPaletteOpenAtom = atom(false) as PrimitiveAtom<boolean>;
        this.shortcutsOpenAtom = atom(false) as PrimitiveAtom<boolean>;
        this.launchRepoPathAtom = atom(loadRecentRepos()[0] ?? "") as PrimitiveAtom<string>;
        this.launchRepoIsGitAtom = atom(true) as PrimitiveAtom<boolean>;
        this.recentReposAtom = atom(loadRecentRepos()) as PrimitiveAtom<string[]>;
        this.launchPromptAtom = atom("") as PrimitiveAtom<string>;
        this.launchRuntimeIdAtom = atom(loadLastAgent()) as PrimitiveAtom<string>;
        this.launchAlsoRunAtom = atom([]) as PrimitiveAtom<string[]>;
        this.launchBranchAtom = atom("") as PrimitiveAtom<string>;
        this.launchInteractiveAtom = atom(loadLastInteractive()) as PrimitiveAtom<boolean>;
        this.postingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.launchResultAtom = atom(null) as PrimitiveAtom<RecoderLaunchResult>;
        this.launchProgressAtom = atom("") as PrimitiveAtom<string>;
        this.rowStatusAtom = atom({}) as PrimitiveAtom<Record<string, string>>;
        this.busyRowAtom = atom("") as PrimitiveAtom<string>;
        this.compareAtom = atom({}) as PrimitiveAtom<Record<string, CompareView>>;
        this.compareOpenAtom = atom("") as PrimitiveAtom<string>;
        this.pairAAtom = atom("") as PrimitiveAtom<string>;
        this.pairBAtom = atom("") as PrimitiveAtom<string>;
        this.readinessAtom = atom({}) as PrimitiveAtom<Record<string, RecoderWorkspaceReadiness>>;
        this.lastMergeAtom = atom({}) as PrimitiveAtom<Record<string, RecoderMergeRecord>>;
        this.selectedWorkspaceIdAtom = atom("") as PrimitiveAtom<string>;
        this.cloneOpenAtom = atom(false) as PrimitiveAtom<boolean>;
        this.cloneUrlAtom = atom("") as PrimitiveAtom<string>;
        this.cloneDestDirAtom = atom("") as PrimitiveAtom<string>;
        this.cloningAtom = atom(false) as PrimitiveAtom<boolean>;
        this.cloneErrorAtom = atom("") as PrimitiveAtom<string>;
        this.boardFilterAtom = atom("") as PrimitiveAtom<string>;
        this.boardShowAtom = atom("active") as PrimitiveAtom<RecoderBoardShow>;
        this.workspacesAtom = atom((get) =>
            get(this.allWorkspacesAtom).filter((w) => !isTerminalWorkspaceState(w.state))
        );
        this.groupsAtom = atom((get) => groupByTaskGroup(get(this.workspacesAtom)));
        this.boardWorkspacesAtom = atom((get) =>
            filterWorkspaces(get(this.allWorkspacesAtom), get(this.boardShowAtom), get(this.boardFilterAtom))
        );
        // `new Date()` at compute time is fresh enough: the 6s poll re-sets
        // allWorkspacesAtom, which recomputes the buckets.
        this.boardBucketsAtom = atom((get) =>
            bucketWorkspaceGroups(groupByTaskGroup(get(this.boardWorkspacesAtom)), new Date())
        );
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
            // Keep the UNFILTERED list: archived + failed workspaces are terminal
            // history, hidden by the board's default Active view, but retained here
            // so the All / Archived views switch without a refetch.
            const all = list as RecoderWorkspace[];
            globalStore.set(this.allWorkspacesAtom, all);
            workspaces = all.filter((w) => !isTerminalWorkspaceState(w.state));
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
                if (agents.length > 1) {
                    globalStore.set(
                        this.launchProgressAtom,
                        `Launching ${agentLabel(agent)} (${started + degraded + 1} of ${agents.length})…`
                    );
                }
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
            globalStore.set(this.launchProgressAtom, "");
        }
    }

    // Clone a GitHub repo through POST /api/conductor/repos/clone — the "Open
    // GitHub project" entry. Pre-validates with the pure URL mirror (the backend
    // still owns the truth), then renders exactly what the edge reported: no fake
    // progress, no fabricated success. On success the modal closes and the launch
    // panel opens seeded with the cloned folder, so the next step is one click.
    async cloneRepo(url: string, destDir?: string) {
        const trimmed = (url ?? "").trim();
        if (!isGitHubRepoUrl(trimmed)) {
            globalStore.set(
                this.cloneErrorAtom,
                "Enter a GitHub repository URL like https://github.com/owner/repo."
            );
            return;
        }
        globalStore.set(this.cloningAtom, true);
        globalStore.set(this.cloneErrorAtom, "");
        try {
            const dest = (destDir ?? "").trim();
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/repos/clone`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: trimmed, ...(dest != "" ? { destDir: dest } : {}) }),
            });
            const body = await res.json().catch(() => null);
            const parsed = parseCloneResponse(res.status, body);
            if (!parsed.ok) {
                globalStore.set(this.cloneErrorAtom, parsed.error);
                return;
            }
            globalStore.set(this.cloneOpenAtom, false);
            globalStore.set(this.cloneUrlAtom, "");
            globalStore.set(this.launchRepoPathAtom, parsed.repoPath);
            globalStore.set(this.launchRepoIsGitAtom, true);
            this.rememberRepo(parsed.repoPath);
            globalStore.set(this.launchOpenAtom, true);
        } catch {
            globalStore.set(this.cloneErrorAtom, "Clone unavailable - Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.cloningAtom, false);
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
                if (reason != null && /invalid workspace transition/i.test(reason)) {
                    this.setRowStatus(workspaceId, "Merge isn’t available yet — review this workspace first.");
                    return;
                }
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

export { RecoderViewModel, type RecoderSetup, type RecoderLaunchResult };
export * from "./recoder-board-logic";
