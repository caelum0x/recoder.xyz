// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi, globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { agentLabel } from "./recoder-agent-labels";
import {
    deriveLifecycleColumns,
    adHocCompareIds,
    convergeSelectionRepo,
    workspaceProjectId,
    deriveProjectIdentity,
    deriveProjects,
    detectAttentionTransitions,
    detectNeedsInputTransitions,
    diffSummaryFetchKey,
    filterByProject,
    filterWorkspaces,
    groupByTaskGroup,
    isTerminalWorkspaceState,
    mergeArchivedHistory,
    shouldRefetchDiffSummary,
    workspaceAttentionMap,
    workspaceStateMap,
    type ProjectSummary,
    type CompareView,
    type MergeabilityView,
    type ReadinessView,
    type RecoderAttentionEvent,
    type RecoderAuditEntry,
    type RecoderLifecycleColumn,
    type RecoderBoardShow,
    type RecoderDiffSummary,
    type RecoderMergeOutcome,
    type RecoderMergeRecord,
    type RecoderMergeVerdict,
    type RecoderWorkspace,
    type RecoderWorkspaceGroup,
    type RecoderWorkspaceReadiness,
} from "./recoder-board-logic";
import { parseAgentAuthState, type AgentAuthState } from "./recoder-agent-auth";
import { parseArchivedPage, type ArchivedPageMeta } from "./recoder-first-run-logic";
import {
    branchErrorMessage,
    parseCheckpointList,
    readBranchedWorkspaceId,
    restoreErrorMessage,
    snapshotErrorMessage,
    snapshotRequestBody,
    type RecoderCheckpoint,
} from "./recoder-checkpoint-logic";
import { isGitHubRepoUrl, parseCloneResponse } from "./recoder-clone-logic";
import { nextRecentRepos, planLaunchAgents, shapeLaunchRequestBody } from "./recoder-launch-logic";
import {
    parseGithubRepos,
    parseGithubStatus,
    type RecoderGithubRepo,
    type RecoderGithubStatus,
} from "./recoder-github-logic";
import { type MeteringDisplay } from "./recoder-metering";
import { fetchWorkspaceUsage } from "./recoder-usage-strip";
import { fetchFileVersions, fileVersionsKey, mergeFileVersions, type FileVersionsFetchResult } from "./recoder-compare-logic";
import { RecoderConnectionModel } from "./recoder-connection-model";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import {
    fetchWorkspacePrStatus,
    prStatusFetchKey,
    shouldRefetchPrStatus,
    type PrFetchMeta,
    type RecoderPrChip,
} from "./recoder-pr-status";
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

// First-run environment import (GET /api/conductor/environment) — what the host
// already has, so onboarding can say "we found your setup". null until probed.
type RecoderEnvironment = {
    gitIdentity: { name: string; email: string } | null;
    agentConfigs: { id: string; present: boolean }[];
    ghAuthenticated: boolean | null;
    shell: string;
};

// Coerce the untrusted /environment payload into the view shape. Anything that
// isn't the documented shape degrades to a safe default (null identity, no
// configs, unknown gh, empty shell) — never a throw, never a fabricated config.
function parseEnvironmentImport(data: unknown): RecoderEnvironment {
    if (data == null || typeof data != "object") {
        return { gitIdentity: null, agentConfigs: [], ghAuthenticated: null, shell: "" };
    }
    const d = data as Record<string, unknown>;
    const gi = d.gitIdentity;
    const gitIdentity =
        gi != null && typeof gi == "object"
            ? {
                  name: typeof (gi as Record<string, unknown>).name == "string" ? ((gi as Record<string, unknown>).name as string) : "",
                  email: typeof (gi as Record<string, unknown>).email == "string" ? ((gi as Record<string, unknown>).email as string) : "",
              }
            : null;
    const agentConfigs = Array.isArray(d.agentConfigs)
        ? d.agentConfigs
              .filter((a): a is { id: string; present: boolean } => a != null && typeof a == "object" && typeof (a as Record<string, unknown>).id == "string")
              .map((a) => ({ id: a.id, present: Boolean((a as Record<string, unknown>).present) }))
        : [];
    return {
        gitIdentity: gitIdentity != null && (gitIdentity.name != "" || gitIdentity.email != "") ? gitIdentity : null,
        agentConfigs,
        ghAuthenticated: typeof d.ghAuthenticated == "boolean" ? d.ghAuthenticated : null,
        shell: typeof d.shell == "string" ? d.shell : "",
    };
}

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
const LAST_AGENTS_KEY = "recoder:last-agents";
const LAST_INTERACTIVE_KEY = "recoder:last-interactive";
const NOTIFY_ATTENTION_KEY = "recoder:notify-attention";

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

// The last-used agent SELECTION (ordered, primary first) so a returning dev's
// multi-agent fan-out is one open away. Degrade-safe: bad JSON / non-string
// entries fall back to the single last-agent (then to zero-config all-detected).
function loadLastAgents(): string[] {
    try {
        const raw = localStorage.getItem(LAST_AGENTS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr.filter((x): x is string => typeof x == "string" && x != "") : [];
        if (list.length > 0) {
            return list;
        }
        const single = loadLastAgent();
        return single != "" ? [single] : [];
    } catch {
        return [];
    }
}

function loadLastInteractive(): boolean {
    try {
        return localStorage.getItem(LAST_INTERACTIVE_KEY) != "false";
    } catch {
        return true;
    }
}

// Default ON: the whole point of parallel agents is walking away; only an
// explicit "false" (or nothing to read) opts out. Degrade-safe like the others.
function loadNotifyOnAttention(): boolean {
    try {
        return localStorage.getItem(NOTIFY_ATTENTION_KEY) != "false";
    } catch {
        return true;
    }
}

// One module-level ipc listener retargeted to the most-recently-constructed
// model: the preload bridge has no unsubscribe, so per-instance registration
// would route OS-notification clicks to closed boards and pile up listeners.
let attentionClickModel: RecoderViewModel = null;
let attentionClickWired = false;

function wireAttentionClicks(model: RecoderViewModel) {
    attentionClickModel = model;
    if (attentionClickWired) {
        return;
    }
    try {
        getApi().onAttentionNotificationClick((workspaceId) => {
            if (attentionClickModel == null || typeof workspaceId != "string" || workspaceId == "") {
                return;
            }
            globalStore.set(attentionClickModel.selectedWorkspaceIdAtom, workspaceId);
        });
        attentionClickWired = true;
    } catch {
        // No bridge (preview/test) — a click still focuses the window via main.
    }
}

class RecoderViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    // The live poll list (GET /workspaces?archived=false): every non-archived
    // record INCLUDING failed, so the Active/All views and the failed-transition
    // notifications work off one poll. Archived history is a SEPARATE on-demand
    // read (archivedWorkspacesAtom) so a busy board's poll stops shipping the
    // whole history every 6s.
    allWorkspacesAtom: PrimitiveAtom<RecoderWorkspace[]>;
    // Archived history from GET /workspaces/archived (most-recent-first). Loaded
    // once on the first refresh (so the board knows history exists) and re-read
    // while a history Show view (All / Archived) is open. [] until loaded /
    // when there is genuinely no history — never a fabricated row.
    archivedWorkspacesAtom: PrimitiveAtom<RecoderWorkspace[]>;
    // The archived edge's pagination meta ({total,limit,offset}) from the LAST
    // successful history read. null until a meta-carrying page lands (older
    // backends send none) — the history view then shows no total, never a
    // fabricated one.
    archivedMetaAtom: PrimitiveAtom<ArchivedPageMeta>;
    // True while a "show older" page fetch is in flight (gates double-clicks).
    loadingOlderArchivedAtom: PrimitiveAtom<boolean>;
    // The live poll list + archived history folded together (live copy wins on an
    // id collision) — what the board's Show views and empty-state gates read.
    combinedWorkspacesAtom!: Atom<RecoderWorkspace[]>;
    // The live (non-terminal) workspaces — what the palette and getting-started
    // logic reason over regardless of the board's current Show filter.
    workspacesAtom!: Atom<RecoderWorkspace[]>;
    loadingAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;
    setupAtom: PrimitiveAtom<RecoderSetup>;
    // Best-effort per-runtime auth verdict (runtimeId → state), seeded by the
    // main-process credential probe. Absent/`unknown` ⇒ "detected, login not
    // verified" — never a fabricated "authenticated".
    agentAuthAtom: PrimitiveAtom<Record<string, AgentAuthState>>;
    // First-run environment import (git identity, agent configs, gh, shell); null until probed.
    environmentAtom: PrimitiveAtom<RecoderEnvironment>;
    // Detected GitHub identity (token-free GET /github/status); null until a
    // successful probe — "unknown", never a fabricated not-connected.
    githubStatusAtom: PrimitiveAtom<RecoderGithubStatus>;
    // The detected account's clonable repos (GET /github/repos); [] until loaded
    // or when gh is absent/signed out — the pickers then fall back to paste.
    githubReposAtom: PrimitiveAtom<RecoderGithubRepo[]>;
    // True once the GitHub probe LANDED (status parsed from a 2xx). Gates the
    // fetch to once per session — /github/repos shells `gh repo list` (a real
    // GitHub API call) on the backend, so it must not ride the 6s poll. A
    // failed/unreachable probe leaves this false so the next poll retries.
    githubLoaded: boolean;
    diffSummariesAtom: PrimitiveAtom<Record<string, RecoderDiffSummary>>;
    // Per-workspace PR chip from GET /workspaces/:id/pr-status (gh-backed). A
    // missing entry means gh couldn't be consulted, the branch has no PR, or the
    // probe degraded — the row simply shows no chip, never a fabricated PR.
    prStatusAtom: PrimitiveAtom<Record<string, RecoderPrChip>>;
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
    // Board filter bar state: free-text query + the Show view + the Project filter.
    boardFilterAtom: PrimitiveAtom<string>;
    boardShowAtom: PrimitiveAtom<RecoderBoardShow>;
    // Selected project id ("" = all projects). Filters the board to one repo.
    boardProjectAtom: PrimitiveAtom<string>;
    // Distinct projects across ALL workspaces (with counts) for the filter dropdown.
    projectsAtom!: Atom<ProjectSummary[]>;
    // The board's visible rows: Show view + text query + project applied to the unfiltered list.
    boardWorkspacesAtom!: Atom<RecoderWorkspace[]>;
    // The visible rows grouped by taskGroup and folded into lifecycle columns
    // (queued → running → needs-review → done) — exactly the order the board renders
    // and keyboard nav walks. Grouped by STATE (PW3 #8), not recency.
    boardColumnsAtom!: Atom<RecoderLifecycleColumn[]>;
    // Ad-hoc converge selection (PW1 #1): the board's "tick 2+ separately-launched
    // workspaces to converge them" affordance. selectModeAtom toggles the quiet
    // checkboxes; selectedForConvergeAtom is the ticked id set. Cleared together when
    // select mode closes so a stale pick never leaks into the next session.
    selectModeAtom: PrimitiveAtom<boolean>;
    selectedForConvergeAtom: PrimitiveAtom<Set<string>>;
    // Truthful reason the last ad-hoc compare load could not form a group (a 400
    // too-few/incompatible, 404 unowned, or unreachable backend); "" when the overlay
    // opened. Surfaced as a quiet line — never a fabricated group.
    adHocConvergeErrorAtom: PrimitiveAtom<string>;
    // Side-by-side compare view keyed by taskGroup; absent ⇒ never loaded / degraded.
    compareAtom: PrimitiveAtom<Record<string, CompareView>>;
    // The taskGroup whose full compare panel is expanded; "" ⇒ none open.
    compareOpenAtom: PrimitiveAtom<string>;
    // The two workspaceIds picked for the focused A-vs-B pairwise compare inside
    // the open panel; "" ⇒ that slot is unpicked. Reset whenever the panel toggles.
    pairAAtom: PrimitiveAtom<string>;
    pairBAtom: PrimitiveAtom<string>;
    // The shared per-contested-file winner selection (path → winning workspaceId,
    // or the converge "@synthesize" sentinel) — EXACTLY the converge compose input
    // shape (ConvergeSelection). ONE source of truth read and edited by BOTH the
    // compare panel's contested strip and the ConvergePanel; the compare panel
    // clears it whenever the compared group changes so picks never bleed across
    // groups. An absent path is deliberately unresolved, never a defaulted winner.
    convergeSelectionAtom: PrimitiveAtom<Record<string, string>>;
    // N-up per-file version reads keyed by the clicked contested path — the base +
    // each sibling's copy of ONE file, for the compare strip's column render. An
    // absent path key ⇒ not yet requested (the panel then triggers the load); an
    // { ok:false } entry is a truthful failure the panel surfaces as a quiet error
    // row, never a fabricated empty version set. Cleared by the panel on group switch.
    fileVersionsAtom: PrimitiveAtom<Record<string, FileVersionsFetchResult>>;
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
    // Workspace-scoped cost/token display from GET /inference/usage?workspaceId=…
    // tagged with the workspaceId it describes, so the strip never shows one
    // workspace's spend under another. null ⇒ not loaded / degraded (honest
    // missing state, never a fabricated $0 strip).
    usageAtom: PrimitiveAtom<MeteringDisplay>;
    usageWorkspaceIdAtom: PrimitiveAtom<string>;
    // Checkpoints for the SELECTED workspace, tagged with the workspaceId they
    // were fetched for so a stale fetch never renders under another row. The id
    // is set only on a successful load — a failed/unreachable probe keeps the
    // strip silent instead of claiming "no checkpoints".
    checkpointsAtom: PrimitiveAtom<RecoderCheckpoint[]>;
    checkpointsWorkspaceIdAtom: PrimitiveAtom<string>;
    // "Open GitHub project" clone modal state. destDir "" means "use the
    // backend's default repos folder" (the POST omits it) — the client never
    // fabricates the conductor's configured base dir.
    cloneOpenAtom: PrimitiveAtom<boolean>;
    cloneUrlAtom: PrimitiveAtom<string>;
    cloneDestDirAtom: PrimitiveAtom<string>;
    cloningAtom: PrimitiveAtom<boolean>;
    cloneErrorAtom: PrimitiveAtom<string>;
    // Whether needs-attention OS notifications fire (default ON, persisted).
    notifyOnAttentionAtom: PrimitiveAtom<boolean>;
    // Per-workspace state as of the LAST successful poll; null until the first
    // poll lands, which seeds silently — a session never notifies about states
    // it didn't watch change (no storm when reopening onto waiting workspaces).
    prevWorkspaceStates: Map<string, string>;
    // workspaceId:state keys already notified this session (de-dupe on bounce).
    notifiedAttentionKeys: ReadonlySet<string>;
    // Per-workspace ATTENTION as of the LAST successful /views merge; null until
    // the first successful views read, which seeds silently. Separate from the
    // durable-state map above: attention is the live "agent stopped, needs you"
    // axis (needs_input / awaiting_approval) the board badges and pings on.
    prevWorkspaceAttention: Map<string, string>;
    // workspaceId:attn:<attention> keys already notified this session (de-dupe).
    notifiedNeedsInputKeys: ReadonlySet<string>;
    // Per-workspace diff-summary fetch key (state + updatedAt) as of the last
    // loadDiffSummaries attempt. Gates the 6s poll's diff fan-out — each fetch
    // shells host git on the backend, so idle rows whose key hasn't advanced are
    // not re-asked (see shouldRefetchDiffSummary).
    diffFetchKeys: Map<string, string>;
    // Per-workspace pr-status probe gate (revision key + last-probe time). Each
    // probe shells `gh` (a GitHub API call) on the backend, so rows re-ask only
    // on a revision advance or after the refresh interval (see shouldRefetchPrStatus).
    prFetchMeta: Map<string, PrFetchMeta>;
    // True while a manual "Re-scan agents" probe is in flight (first-run setup).
    setupProbingAtom: PrimitiveAtom<boolean>;
    // Whether GET /workspaces/archived has been attempted this session. The first
    // refresh always loads it (the board must know history exists even when every
    // record is archived); later polls re-read it only while a history Show view
    // is open, so the recurring 6s cost stays one live-list fetch.
    archivedLoaded: boolean;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder";
        this.viewIcon = atom("layer-group");
        this.viewName = atom("Recoder");
        this.allWorkspacesAtom = atom([]) as PrimitiveAtom<RecoderWorkspace[]>;
        this.archivedWorkspacesAtom = atom([]) as PrimitiveAtom<RecoderWorkspace[]>;
        this.archivedMetaAtom = atom(null) as PrimitiveAtom<ArchivedPageMeta>;
        this.loadingOlderArchivedAtom = atom(false) as PrimitiveAtom<boolean>;
        this.archivedLoaded = false;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.setupAtom = atom({ agents: [], git: false, loaded: false, probed: false, tmuxBin: "" }) as PrimitiveAtom<RecoderSetup>;
        this.agentAuthAtom = atom({}) as PrimitiveAtom<Record<string, AgentAuthState>>;
        this.environmentAtom = atom(null) as PrimitiveAtom<RecoderEnvironment>;
        this.githubStatusAtom = atom(null) as PrimitiveAtom<RecoderGithubStatus>;
        this.githubReposAtom = atom([]) as PrimitiveAtom<RecoderGithubRepo[]>;
        this.githubLoaded = false;
        this.diffSummariesAtom = atom({}) as PrimitiveAtom<Record<string, RecoderDiffSummary>>;
        this.prStatusAtom = atom({}) as PrimitiveAtom<Record<string, RecoderPrChip>>;
        this.launchOpenAtom = atom(false) as PrimitiveAtom<boolean>;
        this.commandPaletteOpenAtom = atom(false) as PrimitiveAtom<boolean>;
        this.shortcutsOpenAtom = atom(false) as PrimitiveAtom<boolean>;
        this.launchRepoPathAtom = atom(loadRecentRepos()[0] ?? "") as PrimitiveAtom<string>;
        this.launchRepoIsGitAtom = atom(true) as PrimitiveAtom<boolean>;
        this.recentReposAtom = atom(loadRecentRepos()) as PrimitiveAtom<string[]>;
        this.launchPromptAtom = atom("") as PrimitiveAtom<string>;
        this.launchRuntimeIdAtom = atom(loadLastAgents()[0] ?? "") as PrimitiveAtom<string>;
        this.launchAlsoRunAtom = atom(loadLastAgents().slice(1)) as PrimitiveAtom<string[]>;
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
        this.convergeSelectionAtom = atom({}) as PrimitiveAtom<Record<string, string>>;
        this.fileVersionsAtom = atom({}) as PrimitiveAtom<Record<string, FileVersionsFetchResult>>;
        this.readinessAtom = atom({}) as PrimitiveAtom<Record<string, RecoderWorkspaceReadiness>>;
        this.lastMergeAtom = atom({}) as PrimitiveAtom<Record<string, RecoderMergeRecord>>;
        this.selectedWorkspaceIdAtom = atom("") as PrimitiveAtom<string>;
        this.usageAtom = atom(null) as PrimitiveAtom<MeteringDisplay>;
        this.usageWorkspaceIdAtom = atom("") as PrimitiveAtom<string>;
        this.checkpointsAtom = atom([]) as PrimitiveAtom<RecoderCheckpoint[]>;
        this.checkpointsWorkspaceIdAtom = atom("") as PrimitiveAtom<string>;
        this.cloneOpenAtom = atom(false) as PrimitiveAtom<boolean>;
        this.cloneUrlAtom = atom("") as PrimitiveAtom<string>;
        this.cloneDestDirAtom = atom("") as PrimitiveAtom<string>;
        this.cloningAtom = atom(false) as PrimitiveAtom<boolean>;
        this.cloneErrorAtom = atom("") as PrimitiveAtom<string>;
        this.notifyOnAttentionAtom = atom(loadNotifyOnAttention()) as PrimitiveAtom<boolean>;
        this.prevWorkspaceStates = null;
        this.notifiedAttentionKeys = new Set();
        this.diffFetchKeys = new Map();
        this.prFetchMeta = new Map();
        this.prevWorkspaceAttention = null;
        this.notifiedNeedsInputKeys = new Set();
        this.setupProbingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.boardFilterAtom = atom("") as PrimitiveAtom<string>;
        this.boardShowAtom = atom("active") as PrimitiveAtom<RecoderBoardShow>;
        this.boardProjectAtom = atom("") as PrimitiveAtom<string>;
        this.selectModeAtom = atom(false) as PrimitiveAtom<boolean>;
        this.selectedForConvergeAtom = atom(new Set<string>()) as PrimitiveAtom<Set<string>>;
        this.adHocConvergeErrorAtom = atom("") as PrimitiveAtom<string>;
        this.combinedWorkspacesAtom = atom((get) =>
            mergeArchivedHistory(get(this.allWorkspacesAtom), get(this.archivedWorkspacesAtom))
        );
        this.projectsAtom = atom((get) => deriveProjects(get(this.combinedWorkspacesAtom)));
        this.workspacesAtom = atom((get) =>
            get(this.allWorkspacesAtom).filter((w) => !isTerminalWorkspaceState(w.state))
        );
        this.groupsAtom = atom((get) => groupByTaskGroup(get(this.workspacesAtom)));
        this.boardWorkspacesAtom = atom((get) =>
            filterByProject(
                filterWorkspaces(get(this.combinedWorkspacesAtom), get(this.boardShowAtom), get(this.boardFilterAtom)),
                get(this.boardProjectAtom)
            )
        );
        this.boardColumnsAtom = atom((get) =>
            deriveLifecycleColumns(groupByTaskGroup(get(this.boardWorkspacesAtom)))
        );
        wireAttentionClicks(this);
    }

    dispose() {
        if (attentionClickModel == this) {
            attentionClickModel = null;
        }
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
            void this.refreshAgentAuth(agents);
        } catch {
            globalStore.set(this.setupAtom, { agents: [], git: false, loaded: false, probed: true, tmuxBin: "" });
            globalStore.set(this.agentAuthAtom, {});
        }
        this.refreshEnvironment();
        this.refreshGithub();
    }

    // GET /github/status + /github/repos → the GitHub half of the zero-config
    // first-run: detected identity + the account's repos for the pickers.
    // Loads once per session (see githubLoaded); the manual Re-scan forces a
    // re-probe. Degrade-safe: any failure is a null status / empty list — the
    // pickers truthfully fall back to the manual paste flow, never an error.
    async refreshGithub(force = false) {
        if (this.githubLoaded && !force) {
            return;
        }
        const base = getRecoderBackendUrl();
        let status: RecoderGithubStatus = null;
        try {
            const res = await fetch(`${base}/api/conductor/github/status`);
            const body = await res.json();
            if (res.ok) {
                status = parseGithubStatus(body?.data);
            }
        } catch {
            // backend unreachable (cold start) — stay unloaded so the next poll retries
        }
        globalStore.set(this.githubStatusAtom, status);
        if (status == null) {
            return;
        }
        this.githubLoaded = true;
        try {
            const res = await fetch(`${base}/api/conductor/github/repos`);
            const body = await res.json();
            globalStore.set(this.githubReposAtom, res.ok ? parseGithubRepos(body?.data) : []);
        } catch {
            globalStore.set(this.githubReposAtom, []);
        }
    }

    // Best-effort, POSITIVE-ONLY per-agent auth probe. `/runtimes` reports PATH
    // availability but carries no login signal, so for each DETECTED runtime we ask
    // the main-process bridge whether it can see that CLI's own saved credential. A
    // confirmed credential ⇒ "authenticated" (the picker may say "ready"); anything
    // unverifiable ⇒ "unknown" (the picker says "detected", never a false "ready",
    // and offers the login path). Degrade-safe: no bridge / a throwing probe leaves
    // the runtime "unknown" — it never fabricates an "authenticated".
    async refreshAgentAuth(agents: { runtimeId: string; available: boolean }[]) {
        let probe: ((runtimeId: string) => Promise<string>) | undefined;
        try {
            probe = getApi()?.probeAgentAuth;
        } catch {
            probe = undefined;
        }
        if (typeof probe != "function") {
            return;
        }
        const detected = agents.filter((a) => a.available);
        const results = await Promise.all(
            detected.map(async (a): Promise<readonly [string, AgentAuthState]> => {
                try {
                    return [a.runtimeId, parseAgentAuthState(await probe(a.runtimeId))];
                } catch {
                    return [a.runtimeId, "unknown"];
                }
            })
        );
        globalStore.set(this.agentAuthAtom, Object.fromEntries(results));
    }

    // Manual "Re-scan agents" (first-run setup): re-probe installed agent CLIs
    // WITHOUT an app restart. The conductor's /runtimes does a fresh PATH probe
    // per request, so an agent installed into an already-known PATH dir is picked
    // up immediately. Toggles setupProbingAtom so the panel can show "Scanning…"
    // and stays truthful — launch only enables once an agent is actually detected.
    async rescanAgents() {
        globalStore.set(this.setupProbingAtom, true);
        // The manual re-scan also re-probes gh (a freshly-installed / freshly
        // logged-in gh should surface without an app restart).
        this.githubLoaded = false;
        try {
            await this.refreshSetup();
        } finally {
            globalStore.set(this.setupProbingAtom, false);
        }
    }

    // GET /api/conductor/environment → the first-run import summary. Degrade-safe:
    // any failure or a non-object payload leaves environmentAtom null (the "we
    // found your setup" card simply doesn't render), never a throw.
    async refreshEnvironment() {
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/environment`);
            const body = await res.json();
            globalStore.set(this.environmentAtom, res.ok ? parseEnvironmentImport(body?.data) : null);
        } catch {
            globalStore.set(this.environmentAtom, null);
        }
    }

    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        let workspaces: RecoderWorkspace[] = [];
        try {
            // `archived=false` is served by the query-aware list edge
            // (workspaces-query.routes) so a busy board's 6s poll stops shipping
            // the whole archived history; failed rows are NOT archived and still
            // arrive, keeping the failed-transition notifications truthful.
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces?archived=false`);
            const body = await res.json();
            // The conductor wraps the list as { data: { workspaces: [...] } };
            // tolerate a bare { data: [...] } too so an older embedded backend
            // still renders. Never assume a shape we didn't see. (An older backend
            // without the query edge ignores `archived=false` and returns the full
            // list — the board still renders, just without the poll narrowing.)
            const data = body?.data;
            const list = Array.isArray(data?.workspaces) ? data.workspaces : Array.isArray(data) ? data : [];
            const base = getRecoderBackendUrl();
            const all = list as RecoderWorkspace[];
            // Enrich with the backend's attention classification (/views). A null
            // map = the probe degraded: rows keep no attention (no badge, no
            // needs-input ping) rather than a fabricated one.
            const attentionById = await this.fetchAttentionMap(base);
            const merged =
                attentionById != null
                    ? all.map((ws) =>
                          attentionById.has(ws.workspaceId)
                              ? { ...ws, attention: attentionById.get(ws.workspaceId) }
                              : ws
                      )
                    : all;
            globalStore.set(this.allWorkspacesAtom, merged);
            this.noteAttentionTransitions(merged);
            // Only fold the attention axis on a SUCCESSFUL views read, so a degraded
            // probe never reseeds the map and can never manufacture a needs-input ping.
            if (attentionById != null) {
                this.noteNeedsInputTransitions(merged);
            }
            workspaces = merged.filter((w) => !isTerminalWorkspaceState(w.state));
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch (e) {
            globalStore.set(this.errorAtom, e instanceof Error ? e.message : String(e));
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
        // Archived history rides the FIRST refresh (so the board knows history
        // exists even when every record is archived) and then only refreshes
        // while a history Show view is open — never a recurring cost on the
        // default Active board.
        if (!this.archivedLoaded || globalStore.get(this.boardShowAtom) != "active") {
            this.loadArchived();
        }
        // Setup readiness + per-workspace diff summaries run alongside, each
        // independently degrade-safe.
        this.refreshSetup();
        this.loadDiffSummaries(workspaces);
        this.loadPrStatuses(workspaces);
    }

    // GET /workspaces/archived → the archived history (most-recent-first). Degrade-
    // safe: any failure / non-2xx / missing shape keeps the prior list (the poll
    // will retry when a history view is open), never throws, never fabricates.
    // limit=200 is the edge's hard cap (recoder-qhlo): the board renders history
    // as one flat newest-first list, so the 200 most recent rows are everything
    // it can usefully show — and the archive-only-grows payload stays bounded on
    // the 6s poll while a history Show view is open.
    async loadArchived() {
        this.archivedLoaded = true;
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces/archived?limit=200`);
            if (!res.ok) {
                return;
            }
            const { workspaces, meta } = parseArchivedPage(await res.json());
            // The fresh first page wins on an id collision, but older pages the
            // user already fetched via "show older" stay appended — a poll while
            // a history view is open must not silently shrink the loaded history.
            globalStore.set(
                this.archivedWorkspacesAtom,
                mergeArchivedHistory(workspaces, globalStore.get(this.archivedWorkspacesAtom))
            );
            // A meta-less 2xx body (older backend) must not wipe a known total —
            // same guard as loadOlderArchived.
            if (meta != null) {
                globalStore.set(this.archivedMetaAtom, meta);
            }
        } catch {
            // degrade-safe: an unreachable history read keeps the prior list
        }
    }

    // "Show older" (recoder-oe8i): fetch the next archived page past what is
    // already loaded and dedup-append it (mergeArchivedHistory), carrying the
    // envelope meta forward so the "newest N of M" chip stays truthful. Degrade-
    // safe: any failure / non-2xx leaves the loaded history and meta untouched.
    async loadOlderArchived() {
        if (globalStore.get(this.loadingOlderArchivedAtom)) {
            return;
        }
        globalStore.set(this.loadingOlderArchivedAtom, true);
        try {
            const prior = globalStore.get(this.archivedWorkspacesAtom);
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/archived?limit=200&offset=${prior.length}`
            );
            if (!res.ok) {
                return;
            }
            const { workspaces, meta } = parseArchivedPage(await res.json());
            globalStore.set(this.archivedWorkspacesAtom, mergeArchivedHistory(prior, workspaces));
            if (meta != null) {
                globalStore.set(this.archivedMetaAtom, meta);
            }
        } catch {
            // degrade-safe: an unreachable page read keeps the loaded history
        } finally {
            globalStore.set(this.loadingOlderArchivedAtom, false);
        }
    }

    // The Show dropdown's entry point: switching into a history view (All /
    // Archived) re-reads the archived history immediately instead of waiting up
    // to 6s for the next poll to notice.
    setBoardShow(show: RecoderBoardShow) {
        globalStore.set(this.boardShowAtom, show);
        if (show != "active") {
            void this.loadArchived();
        }
    }

    // Compare this poll against the last SUCCESSFUL poll and fire an OS
    // notification per observed needs-human transition (running → awaiting_review,
    // anything → failed). Only called on a successful list read, so a backend
    // outage never reseeds the map and can never manufacture "new" workspaces.
    // The first poll of a session seeds silently.
    noteAttentionTransitions(all: RecoderWorkspace[]) {
        const prev = this.prevWorkspaceStates;
        this.prevWorkspaceStates = workspaceStateMap(all);
        if (prev == null || !globalStore.get(this.notifyOnAttentionAtom)) {
            return;
        }
        const events = detectAttentionTransitions(prev, all, this.notifiedAttentionKeys);
        if (events.length == 0) {
            return;
        }
        this.notifiedAttentionKeys = new Set([...this.notifiedAttentionKeys, ...events.map((e) => e.key)]);
        for (const event of events) {
            this.showAttentionNotification(event);
        }
    }

    // GET /api/conductor/views → the attention-enriched read model. Returns a
    // Map<workspaceId, attention> for every view that carries a string attention;
    // null on any failure / non-2xx / missing shape so the caller keeps the rows
    // un-enriched (no badge, no ping) rather than fabricating an attention. The
    // WorkspaceView list omits metadata, so this is a SIDE read merged onto the
    // /workspaces list — never a replacement for it.
    async fetchAttentionMap(base: string): Promise<Map<string, string> | null> {
        try {
            const res = await fetch(`${base}/api/conductor/views`);
            if (!res.ok) {
                return null;
            }
            const data = (await res.json())?.data;
            const list = Array.isArray(data?.workspaces) ? data.workspaces : [];
            const map = new Map<string, string>();
            for (const v of list) {
                if (v != null && typeof v.workspaceId == "string" && typeof v.attention == "string") {
                    map.set(v.workspaceId, v.attention);
                }
            }
            return map;
        } catch {
            return null;
        }
    }

    // Compare this poll's attention against the last SUCCESSFUL views merge and
    // fire an OS notification per observed transition INTO a needs-input signal
    // (agent stopped mid-run, waiting on the user for input or an approval) — the
    // "walk away, get pinged" promise. Only called on a successful views read, so
    // a degraded probe never reseeds the map. The first successful read seeds
    // silently (no storm when reopening onto already-waiting workspaces).
    noteNeedsInputTransitions(all: RecoderWorkspace[]) {
        const prev = this.prevWorkspaceAttention;
        this.prevWorkspaceAttention = workspaceAttentionMap(all);
        if (prev == null || !globalStore.get(this.notifyOnAttentionAtom)) {
            return;
        }
        const events = detectNeedsInputTransitions(prev, all, this.notifiedNeedsInputKeys);
        if (events.length == 0) {
            return;
        }
        this.notifiedNeedsInputKeys = new Set([...this.notifiedNeedsInputKeys, ...events.map((e) => e.key)]);
        for (const event of events) {
            this.showAttentionNotification(event);
        }
    }

    // Prefer the Electron main-process Notification (native OS delivery; the
    // click handler lives in main so it survives renderer GC, restores/focuses
    // the window natively, and badges the dock while the app is unfocused).
    // Falls back to the renderer web Notification when the bridge is absent.
    // Degrade-safe either way: a notification that can't show is a silent no-op
    // — the board itself still shows the state truthfully.
    showAttentionNotification(event: RecoderAttentionEvent) {
        const name = event.branch != "" ? event.branch : event.workspaceId;
        const title =
            event.kind == "review"
                ? `${name} is ready for review`
                : event.kind == "needs_input"
                  ? `${name} needs your input`
                  : event.kind == "awaiting_approval"
                    ? `${name} needs your approval`
                    : `${name} failed`;
        const body = event.runtimeId != "" ? agentLabel(event.runtimeId) : "";
        try {
            const api = getApi();
            if (api?.showAttentionNotification != null) {
                api.showAttentionNotification(event.workspaceId, title, body);
                return;
            }
        } catch {
            // fall through to the web Notification path
        }
        if (typeof Notification == "undefined" || Notification.permission == "denied") {
            return;
        }
        try {
            const notification = new Notification(title, {
                body,
                tag: event.key,
            });
            notification.onclick = () => {
                globalStore.set(this.selectedWorkspaceIdAtom, event.workspaceId);
                window.focus();
            };
        } catch {
            // degrade-safe: a notification that can't show must never break the poll
        }
    }

    setNotifyOnAttention(on: boolean) {
        globalStore.set(this.notifyOnAttentionAtom, on);
        try {
            localStorage.setItem(NOTIFY_ATTENTION_KEY, on ? "true" : "false");
        } catch {
            // degrade-safe: a corrupt store must never break the toggle
        }
    }

    // Best-effort per-workspace changed-line summary. Each fetch degrades to "no
    // entry" on any failure or a non-available diff, and the whole map is rebuilt
    // from the current list so stale ids are pruned. Never throws, never fabricates.
    // The fan-out is GATED (shouldRefetchDiffSummary): each fetch shells host git
    // on the backend, so only rows that are running or whose state/updatedAt
    // advanced since the last attempt are re-asked — one probe per row revision,
    // not one per 6s tick. Skipped rows carry their cached summary forward.
    async loadDiffSummaries(workspaces: RecoderWorkspace[]) {
        const base = getRecoderBackendUrl();
        const toFetch = workspaces.filter((ws) =>
            shouldRefetchDiffSummary(ws, this.diffFetchKeys.get(ws.workspaceId))
        );
        const entries = await Promise.all(
            toFetch.map(async (ws): Promise<[string, RecoderDiffSummary] | null> => {
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
        const fetched = new Map(entries.filter((e) => e != null));
        const fetchedIds = new Set(toFetch.map((ws) => ws.workspaceId));
        const prev = globalStore.get(this.diffSummariesAtom);
        const next: Record<string, RecoderDiffSummary> = {};
        for (const ws of workspaces) {
            const entry = fetchedIds.has(ws.workspaceId) ? fetched.get(ws.workspaceId) : prev[ws.workspaceId];
            if (entry) next[ws.workspaceId] = entry;
        }
        globalStore.set(this.diffSummariesAtom, next);
        // Record every attempt (even a failed/unavailable one) so an idle row is
        // probed once per revision, not retried every tick; a departed id drops out
        // here, so the gate map can never grow past the current list.
        this.diffFetchKeys = new Map(workspaces.map((ws) => [ws.workspaceId, diffSummaryFetchKey(ws)]));
    }

    // Best-effort per-workspace PR chip (gh-backed pr-status edge). Mirrors the
    // diff-summary fan-out: gated per row (revision advance OR the 60s interval,
    // since GitHub moves without the local row), skipped rows carry their cached
    // chip forward, departed ids are pruned, and a failed/no-PR probe simply drops
    // the entry. Never throws, never fabricates a PR.
    async loadPrStatuses(workspaces: RecoderWorkspace[]) {
        const base = getRecoderBackendUrl();
        const now = Date.now();
        const toFetch = workspaces.filter((ws) =>
            shouldRefetchPrStatus(ws, this.prFetchMeta.get(ws.workspaceId), now)
        );
        const entries = await Promise.all(
            toFetch.map(async (ws): Promise<[string, RecoderPrChip] | null> => {
                const chip = await fetchWorkspacePrStatus(base, ws.workspaceId);
                return chip != null ? [ws.workspaceId, chip] : null;
            })
        );
        const fetched = new Map(entries.filter((e) => e != null));
        const fetchedIds = new Set(toFetch.map((ws) => ws.workspaceId));
        const prev = globalStore.get(this.prStatusAtom);
        const next: Record<string, RecoderPrChip> = {};
        for (const ws of workspaces) {
            const entry = fetchedIds.has(ws.workspaceId) ? fetched.get(ws.workspaceId) : prev[ws.workspaceId];
            if (entry) next[ws.workspaceId] = entry;
        }
        globalStore.set(this.prStatusAtom, next);
        // Probed rows restart their interval clock; skipped rows keep their prior
        // meta so the 60s window isn't reset by every 6s tick.
        const meta = new Map<string, PrFetchMeta>();
        for (const ws of workspaces) {
            meta.set(
                ws.workspaceId,
                fetchedIds.has(ws.workspaceId)
                    ? { key: prStatusFetchKey(ws), at: now }
                    : this.prFetchMeta.get(ws.workspaceId)
            );
        }
        this.prFetchMeta = meta;
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

    // --- Ad-hoc converge selection (PW1 #1) -----------------------------------------
    // The board "select 2+ separately-launched workspaces, then converge" flow. The
    // COMPARE loads from the ad-hoc edge and feeds the SAME compareAtom/overlay the
    // taskGroup path uses (keyed by the synthetic adhoc: group id the backend returns).

    setSelectMode(on: boolean) {
        globalStore.set(this.selectModeAtom, on);
        if (!on) {
            globalStore.set(this.selectedForConvergeAtom, new Set<string>());
            globalStore.set(this.adHocConvergeErrorAtom, "");
        }
    }

    toggleSelectMode() {
        this.setSelectMode(!globalStore.get(this.selectModeAtom));
    }

    // Toggle a workspace into the ad-hoc converge selection (immutable Set copy). A
    // cross-repo pick is refused at the source too — the UI disables it, but the model
    // fail-closes so the set is always converge-valid (converging across repos is
    // nonsense the backend would 400).
    toggleSelectForConverge(workspaceId: string) {
        if (!workspaceId) {
            return;
        }
        const cur = globalStore.get(this.selectedForConvergeAtom);
        const next = new Set(cur);
        if (next.has(workspaceId)) {
            next.delete(workspaceId);
            globalStore.set(this.selectedForConvergeAtom, next);
            return;
        }
        const all = globalStore.get(this.combinedWorkspacesAtom);
        const repo = convergeSelectionRepo(all, cur);
        const ws = all.find((w) => w.workspaceId == workspaceId);
        if (repo != null && ws != null && workspaceProjectId(ws) != repo) {
            return;
        }
        next.add(workspaceId);
        globalStore.set(this.selectedForConvergeAtom, next);
    }

    // Load the ad-hoc compare aggregate for an EXPLICIT id set and feed the SAME
    // compareAtom/overlay the taskGroup path uses, keyed by the synthetic adhoc: group
    // id the backend returns as CompareView.taskGroup. Degrade-safe + truthful: a 400
    // too-few/incompatible, a 404 unowned/missing, an unrecognized shape, or an
    // unreachable backend sets adHocConvergeErrorAtom and opens NO overlay — never a
    // fabricated group. On success it clears the pairwise picker and opens the overlay.
    async loadAdHocCompare(workspaceIds: string[]) {
        const ids = adHocCompareIds(workspaceIds);
        globalStore.set(this.adHocConvergeErrorAtom, "");
        if (ids.length < 2) {
            globalStore.set(this.adHocConvergeErrorAtom, "Select 2+ workspaces to converge.");
            return;
        }
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/compare/ad-hoc?ids=${encodeURIComponent(ids.join(","))}`
            );
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(
                    this.adHocConvergeErrorAtom,
                    readErrorReason(body) || `Couldn’t compare these workspaces (HTTP ${res.status}).`
                );
                return;
            }
            const view = body?.data?.compare as CompareView;
            const tg = typeof view?.taskGroup == "string" ? view.taskGroup : "";
            if (view == null || tg == "" || !Array.isArray(view.siblings)) {
                globalStore.set(
                    this.adHocConvergeErrorAtom,
                    "Couldn’t compare these workspaces — unrecognized response."
                );
                return;
            }
            const cur = globalStore.get(this.compareAtom);
            globalStore.set(this.compareAtom, { ...cur, [tg]: view });
            globalStore.set(this.pairAAtom, "");
            globalStore.set(this.pairBAtom, "");
            globalStore.set(this.compareOpenAtom, tg);
            void this.loadGroupReadiness(view.siblings.map((s) => ({ workspaceId: s.workspaceId })));
        } catch {
            globalStore.set(
                this.adHocConvergeErrorAtom,
                "Couldn’t compare these workspaces — Recoder isn’t reachable."
            );
        }
    }

    // Load the N-up per-file versions for ONE contested path (the base + each sibling's
    // copy), keyed by path. The fetch is degrade-safe and NEVER throws: a failure /
    // non-2xx / unrecognized shape is stored as a truthful { ok:false, error } under the
    // path so the panel shows a quiet error row with a retry — never a fabricated empty
    // version set. A blank taskGroup/path is a no-op (no request shaped).
    async loadFileVersions(taskGroup: string, path: string) {
        const tg = (taskGroup ?? "").trim();
        const rel = (path ?? "").trim();
        if (tg == "" || rel == "") {
            return;
        }
        const result = await fetchFileVersions(tg, rel);
        const cur = globalStore.get(this.fileVersionsAtom);
        globalStore.set(this.fileVersionsAtom, mergeFileVersions(cur, fileVersionsKey(tg, rel), result));
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

    // GET /inference/usage?workspaceId=… — the workspace-scoped ledger read for
    // the cost strip, via the SAME truthful reader the terminal strip uses so both
    // surfaces share one envelope contract: fetchWorkspaceUsage returns null for a
    // non-2xx, a non-JSON body, a transport fault, OR a `success !== true`
    // envelope (an errored-but-200 body never renders as real spend). The result
    // is tagged with the workspaceId it was fetched FOR; a null display makes the
    // strip vanish rather than showing stale or fabricated spend.
    async loadUsage(workspaceId: string) {
        if (!workspaceId) {
            return;
        }
        const display = await fetchWorkspaceUsage(getRecoderBackendUrl(), workspaceId);
        globalStore.set(this.usageAtom, display);
        globalStore.set(this.usageWorkspaceIdAtom, workspaceId);
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
        const also = globalStore.get(this.launchAlsoRunAtom);
        const prompt = globalStore.get(this.launchPromptAtom).trim();
        const branch = globalStore.get(this.launchBranchAtom).trim();
        const interactive = globalStore.get(this.launchInteractiveAtom);
        // Fold (primary, also) into the ordered fan-out list + shared taskGroup.
        // A shared branch across siblings would collide across worktrees, so the
        // shaping honors a user branch only for a solo launch; parallel siblings
        // are auto-named per agent server-side.
        const { agents, taskGroup } = planLaunchAgents(primary, also, genTaskGroupId);
        const projectId = deriveProjectIdentity(repoPath).projectId;
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
                // Real project identity from the repo path so the board can group
                // and filter by project (was hardcoded "default").
                const reqBody = shapeLaunchRequestBody(
                    { repoPath, prompt, branch, interactive, taskGroup, agentCount: agents.length, projectId },
                    agent,
                    genTaskId()
                );
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
            this.rememberAgents(agents, interactive);
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
                parallelCount: Math.max(0, agents.length - 1),
            });
            globalStore.set(this.launchOpenAtom, false);
            globalStore.set(this.launchPromptAtom, "");
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
            const next = nextRecentRepos(loadRecentRepos(), p, RECENT_REPOS_CAP);
            localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(next));
            globalStore.set(this.recentReposAtom, next);
        } catch {
            // degrade-safe: a corrupt/absent store must never break launch
        }
    }

    // Persist the last-used agent SELECTION + interactive choice so the next launch
    // panel seeds from the dev's real fan-out preference instead of re-forcing the
    // first ready agent. Keeps LAST_AGENT_KEY in sync for older single-agent reads.
    // Degrade-safe: a corrupt store must never break launch.
    rememberAgents(agents: readonly string[], interactive: boolean) {
        try {
            const list = (agents ?? []).filter((id) => id != "");
            if (list.length > 0) {
                localStorage.setItem(LAST_AGENTS_KEY, JSON.stringify(list));
                localStorage.setItem(LAST_AGENT_KEY, list[0]);
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

    // Gracefully stop a running agent: the backend kills the live session, KEEPS the
    // worktree, transitions the workspace to `cancelled`, and seals an audit entry.
    // Governed → surface a gated (403) / illegal-transition (503) / unreachable
    // outcome truthfully; never fake a stop.
    async stopWorkspace(workspaceId: string) {
        if (!workspaceId) {
            return;
        }
        globalStore.set(this.busyRowAtom, workspaceId);
        this.setRowStatus(workspaceId, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/stop`,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
            );
            if (res.ok) {
                this.setRowStatus(workspaceId, "Stopped.");
                await this.refresh();
                return;
            }
            const body = await res.json().catch(() => null);
            const reason = readErrorReason(body);
            if (res.status == 403) {
                this.setRowStatus(workspaceId, reason || "Stop blocked - needs approval.");
                return;
            }
            if (res.status == 503 && reason != null && /invalid workspace transition/i.test(reason)) {
                this.setRowStatus(workspaceId, "Nothing to stop — this run isn’t active.");
                return;
            }
            this.setRowStatus(workspaceId, reason || `Stop failed (${res.status}).`);
        } catch {
            this.setRowStatus(workspaceId, "Stop unavailable - Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.busyRowAtom, "");
        }
    }

    // Load the selected workspace's checkpoints. The tag atom is set only on a
    // successful read, so an unreachable backend keeps the strip silent instead
    // of claiming "no checkpoints".
    async loadCheckpoints(workspaceId: string) {
        if (!workspaceId) {
            return;
        }
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/checkpoints`
            );
            if (!res.ok) {
                return;
            }
            const body = await res.json().catch(() => null);
            globalStore.set(this.checkpointsAtom, parseCheckpointList(body));
            globalStore.set(this.checkpointsWorkspaceIdAtom, workspaceId);
        } catch {
            // unreachable — keep whatever was loaded before
        }
    }

    // Snapshot the workspace's current git state (non-destructive: the backend
    // tags HEAD plus any uncommitted edits without touching the worktree). An
    // optional operator label rides along. Governed → a 403 surfaces the gate's
    // reason truthfully, never a faked save.
    async snapshotWorkspace(workspaceId: string, label?: string) {
        if (!workspaceId) {
            return;
        }
        globalStore.set(this.busyRowAtom, workspaceId);
        this.setRowStatus(workspaceId, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/checkpoints`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(snapshotRequestBody(label)),
                }
            );
            if (res.ok) {
                this.setRowStatus(workspaceId, "Checkpoint saved.");
                await this.loadCheckpoints(workspaceId);
                return;
            }
            const body = await res.json().catch(() => null);
            this.setRowStatus(workspaceId, snapshotErrorMessage(res.status, readErrorReason(body)));
        } catch {
            this.setRowStatus(workspaceId, "Checkpoint unavailable - Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.busyRowAtom, "");
        }
    }

    // Restore the worktree to a checkpoint. The backend snapshots the CURRENT
    // state first (automatic safety tag), so restoring never silently loses work.
    async restoreCheckpoint(workspaceId: string, checkpointId: string) {
        if (!workspaceId || !checkpointId) {
            return;
        }
        globalStore.set(this.busyRowAtom, workspaceId);
        this.setRowStatus(workspaceId, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/checkpoints/${encodeURIComponent(checkpointId)}/restore`,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
            );
            if (res.ok) {
                this.setRowStatus(workspaceId, "Restored to checkpoint - the previous state was saved as a safety snapshot.");
                await this.refresh();
                return;
            }
            const body = await res.json().catch(() => null);
            this.setRowStatus(workspaceId, restoreErrorMessage(res.status, readErrorReason(body)));
        } catch {
            this.setRowStatus(workspaceId, "Restore unavailable - Recoder isn’t reachable.");
        } finally {
            globalStore.set(this.busyRowAtom, "");
        }
    }

    // Branch a NEW workspace whose fresh worktree starts from the checkpoint's
    // snapshot tree — safe experimentation without losing the good run. Returns
    // the new workspace id so the caller can hand off (open it); "" on any
    // failure, so a blocked/failed branch never opens a phantom session.
    async branchCheckpoint(workspaceId: string, checkpointId: string): Promise<string> {
        if (!workspaceId || !checkpointId) {
            return "";
        }
        globalStore.set(this.busyRowAtom, workspaceId);
        this.setRowStatus(workspaceId, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/checkpoints/${encodeURIComponent(checkpointId)}/branch`,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
            );
            const body = await res.json().catch(() => null);
            if (res.ok) {
                const newWorkspaceId = readBranchedWorkspaceId(body);
                this.setRowStatus(workspaceId, "Branched a new workspace from the checkpoint.");
                await this.refresh();
                return newWorkspaceId;
            }
            this.setRowStatus(workspaceId, branchErrorMessage(res.status, readErrorReason(body)));
            return "";
        } catch {
            this.setRowStatus(workspaceId, "Branch unavailable - Recoder isn’t reachable.");
            return "";
        } finally {
            globalStore.set(this.busyRowAtom, "");
        }
    }
}

export { RecoderViewModel, parseEnvironmentImport, type RecoderSetup, type RecoderEnvironment, type RecoderLaunchResult };
export * from "./recoder-board-logic";
