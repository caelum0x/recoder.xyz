// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import RecoderCubeLogo from "@/app/asset/logo.svg";
import { createBlock, getApi } from "@/app/store/global";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { agentAuthOptionSuffix, agentAuthPresentation } from "./recoder-agent-auth";
import { agentLabel } from "./recoder-agent-labels";
import { AgentAuthAffordance, RecoderAgentSetup } from "./recoder-agent-setup";
import { WorkspaceCheckpoints } from "./recoder-checkpoints";
import { RecoderCloneModal } from "./recoder-clone";
import { RecoderCommandPalette, type RecoderCommand } from "./recoder-command-palette";
import { RecoderComparePanel } from "./recoder-compare";
import { RecoderConnectionModel } from "./recoder-connection-model";
import { RecoderHealthModel } from "./recoder-health-model";
import type { HealthTone } from "./recoder-health-logic";
import { isConnectivityError } from "./recoder-errors";
import {
    archivedHistoryNotice,
    firstRunAgentChips,
    firstRunHero,
    firstRunSignIn,
    shouldShowGettingStarted,
    showConvergeAffordance,
} from "./recoder-first-run-logic";
import {
    filterClonableRepos,
    filterReposByQuery,
    githubIdentityLabel,
    RepoChipDisplayLimit,
    repoPickerHint,
} from "./recoder-github-logic";
import { RecoderIdentityAffordance } from "./recoder-identity";
import {
    launchDisabledReason,
    orderedRecentRepos,
    parallelSelectionHint,
    reconcileSelection,
    seedAgentSelection,
    selectedAgentIds,
    toggleAgentSelection,
} from "./recoder-launch-logic";
import { RecoderIdentityModel } from "./recoder-identity-model";
import {
    convergeSelectDisabled,
    convergeSelectionRepo,
    deriveAdHocConverge,
    deriveCardSummary,
    deriveClusterState,
    formatRelativeAge,
    isTerminalWorkspaceState,
    RecoderViewModel,
    suggestNextAction,
    workspaceSearchKeywords,
    type CompareView,
    type RecoderBoardShow,
    type RecoderDiffSummary,
    type RecoderEnvironment,
    type RecoderRowActionId,
    type RecoderWorkspace,
} from "./recoder-model";
import { navigationCommands } from "./recoder-nav-commands";
import { openWorkspaceTerminal } from "./recoder-open-terminal";
import { prChipLabel, prChipTone, type RecoderPrChip } from "./recoder-pr-status";
import { RecoderShortcutsOverlay } from "./recoder-shortcuts";
import { usageCostTitle } from "./recoder-metering";
import { RecoderErrorRow, RecoderSkeleton } from "./recoder-states";
import {
    CHIP,
    ENTRY_CARD,
    ERROR_ROW,
    FIELD_LABEL,
    INPUT,
    META,
    PAGE_TITLE,
    PICK_BTN_ON,
    PRIMARY_BTN,
    QUIET_BTN,
    ROW_TITLE,
    SECTION_TITLE,
    STATE_CHIP,
} from "./recoder-styles";
import { fetchTranscriptSearch, projectTranscriptSearchResult, transcriptCommands } from "./recoder-transcript-search";
import { RecoderWhatsNew } from "./recoder-whats-new-panel";

// Same cadence as the terminal view's UsageStrip so the board's cost line stays
// live during an active run instead of freezing at selection time.
const UsageRefreshMs = 15_000;

// The health dot polls the backend rollup on a calm cadence — a quiet up/down
// signal, not a hot loop.
const HealthRefreshMs = 10_000;

// createBlock is fire-and-forget from event handlers; a failed cross-block open
// must never crash the view, so every call is wrapped and errors are swallowed.
async function openBlock(blockDef: { meta: Record<string, unknown> }) {
    try {
        await createBlock(blockDef);
    } catch {
        // degrade-safe: opening a block should never take down the hub view
    }
}

function openSession(workspaceId: string) {
    openBlock({ meta: { view: "recoder-terminal", "recoder:workspaceid": workspaceId } });
}

function openReview(workspaceId?: string) {
    openBlock({ meta: { view: "recoder-diff", ...(workspaceId ? { "recoder:workspaceid": workspaceId } : {}) } });
}

// Open any Recoder surface (runs/approvals/memory/board/settings) as its own
// block — the same view meta a rail widget uses, routed through openBlock so a
// failed open degrades quietly instead of taking down the hub.
function openView(view: string) {
    openBlock({ meta: { view } });
}

// Attach the workspace's live tmux session as a real wave term block, using the
// conductor-pinned tmux (from setup health) so we hit the same tmux server.
function openTerminal(ws: RecoderWorkspace, tmuxBin: string) {
    openWorkspaceTerminal({ sessionName: ws.sessionName, cwd: ws.worktreePath }, tmuxBin || undefined);
}

// The picker is the only entry path for a repo, so paths are always absolute;
// show just the leaf folder name and keep the full path on hover/title.
function folderName(repoPath: string): string {
    return repoPath.split(/[\\/]/).filter(Boolean).pop() ?? repoPath;
}

// The palette's Sessions provider: backend transcript search → pure projection
// → palette commands, with truthful unavailable/failed/capped-scan notices kept
// as visible rows. The search result (the matching snippet) is the capability
// itself; opening a hit lands on the Runs surface where session activity lives —
// there is no deep per-session view to fake a jump into. Module-scope (no
// component state) so the palette's debounce effect sees a stable reference.
async function paletteSessionSearch(query: string): Promise<RecoderCommand[]> {
    const result = await fetchTranscriptSearch(query);
    return transcriptCommands(projectTranscriptSearchResult(result), () => openView("recoder-runs"));
}

// A parallel-run group is keyed by a generated grp_<id>; strip the prefix and
// clip so the cluster header reads as a short, stable tag rather than raw noise.
function shortTaskGroup(taskGroup: string): string {
    const raw = taskGroup ?? "";
    const trimmed = raw.startsWith("grp_") ? raw.slice(4) : raw;
    return trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed;
}

// The live PR chip — the workspace's pull-request state straight from the
// gh-backed pr-status edge. Not rendered at all when there is no chip (gh
// absent / no PR / degraded probe); clicking opens the PR when a URL exists.
function WorkspacePrChip({ pr }: { pr: RecoderPrChip }) {
    if (pr == null) {
        return null;
    }
    const clickable = pr.url != "";
    return (
        <span
            className={`rounded border px-1.5 py-0.5 text-xs whitespace-nowrap ${prChipTone(pr)} ${clickable ? "cursor-pointer hover:opacity-80" : ""}`}
            title={clickable ? pr.url : "Pull-request state via gh"}
            onClick={(e) => {
                e.stopPropagation();
                if (!clickable) {
                    return;
                }
                try {
                    getApi().openExternal(pr.url);
                } catch {
                    // no external opener wired — the chip stays a passive badge
                }
            }}
        >
            {prChipLabel(pr)}
        </span>
    );
}

WorkspacePrChip.displayName = "WorkspacePrChip";

type WorkspaceRowProps = {
    model: RecoderViewModel;
    ws: RecoderWorkspace;
    summary: RecoderDiffSummary;
    pr: RecoderPrChip;
    status: string;
    busy: boolean;
    tmuxBin: string;
    selected: boolean;
    onSelect: () => void;
    // Present only for rows in a 2+-sibling parallel group: the persistent quiet
    // "Compare · Converge" affordance that opens the group's compare panel.
    onConverge?: () => void;
};

function WorkspaceRow({
    model,
    ws,
    summary,
    pr,
    status,
    busy,
    tmuxBin,
    selected,
    onSelect,
    onConverge,
}: WorkspaceRowProps) {
    const ref = useRef<HTMLDivElement>(null);
    const usage = useAtomValue(model.usageAtom);
    const usageWorkspaceId = useAtomValue(model.usageWorkspaceIdAtom);
    useEffect(() => {
        if (!selected) {
            return;
        }
        ref.current?.scrollIntoView({ block: "nearest" });
        model.loadUsage(ws.workspaceId);
        const id = setInterval(() => model.loadUsage(ws.workspaceId), UsageRefreshMs);
        return () => clearInterval(id);
    }, [selected]);
    // The strip renders ONLY when the loaded display was fetched for THIS row's
    // workspace — a stale fetch for a previously-selected row shows nothing.
    const showUsage = selected && usage != null && usageWorkspaceId == ws.workspaceId;
    const terminal = isTerminalWorkspaceState(ws.state);
    const age = formatRelativeAge(ws.createdAt);
    // The de-crowded glance: one derived read folds the row down to title + agent +
    // ONE state (needs-input attention folded in) + the +/- diffstat. PR, age, and
    // the row actions move to the selected secondary line / hover so the resting
    // card reads in a single glance (DESIGN-REFERENCE §3A).
    const card = deriveCardSummary(ws, summary);
    const suggestion = suggestNextAction(ws.state, summary, ws.sessionName != null && ws.sessionName != "");
    // Promote exactly one existing button to primary when it IS the suggested next
    // step; every other button stays quiet. Never invents an action. Only the
    // selected row gets the promotion so the board carries at most one accent.
    const btnClass = (action: RecoderRowActionId): string =>
        selected && suggestion != null && suggestion.action == action && !busy ? PRIMARY_BTN : QUIET_BTN;
    // Row actions sit quiet until the card is the focus: revealed when selected, and
    // on hover for the mouse. Hidden actions drop pointer-events so an invisible
    // button is never clickable; focus-within keeps them reachable mid-tab.
    const actionsReveal = selected
        ? "opacity-100"
        : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto";
    return (
        <div
            ref={ref}
            tabIndex={0}
            data-selected={selected}
            onClick={onSelect}
            onFocus={onSelect}
            className={`group flex flex-col gap-1 rounded border border-white/8 px-3 py-2 recoder-transition hover:border-white/12 cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-white/50 ${selected ? "bg-accent" : "hover:bg-white/[0.04]"} ${terminal ? "opacity-60" : ""}`}
            title={`${ws.workspaceId} - ${ws.branch}`}
        >
            <div className="flex items-center gap-2">
                <span className={`${ROW_TITLE} min-w-0 truncate font-mono`}>{card.title}</span>
                <span className={`${META} shrink-0`}>{card.agent}</span>
                {card.needsYou ? (
                    <span
                        className={`${STATE_CHIP} inline-flex shrink-0 items-center gap-1 text-primary`}
                        title="This agent stopped mid-run and is waiting on you"
                    >
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        {card.state}
                    </span>
                ) : (
                    <span className={`${STATE_CHIP} shrink-0`}>{card.state}</span>
                )}
                {card.diffstat != "" && <span className={`${META} shrink-0 font-mono`}>{card.diffstat}</span>}
                <div className="flex-1" />
                {/* Actions stay quiet until the card is the focus (selected / hover /
                    focus-within) so the resting glance is title + agent + state + diff. */}
                <div className={`flex items-center gap-2 recoder-transition ${actionsReveal}`}>
                    {onConverge != null && (
                        <button
                            className={QUIET_BTN}
                            title="Compare this parallel group side-by-side and converge on one branch"
                            onClick={onConverge}
                        >
                            Compare · Converge
                        </button>
                    )}
                    {!terminal && (
                        <button className={btnClass("session")} onClick={() => openSession(ws.workspaceId)}>
                            Session
                        </button>
                    )}
                    {!terminal && ws.sessionName && (
                        <button className={QUIET_BTN} onClick={() => openTerminal(ws, tmuxBin)}>
                            Terminal
                        </button>
                    )}
                    {!terminal && ws.state != "awaiting_review" && (
                        <button
                            className={QUIET_BTN}
                            disabled={busy}
                            title="Stop this run (keeps the worktree)"
                            onClick={() => model.stopWorkspace(ws.workspaceId)}
                        >
                            {busy ? "..." : "Stop"}
                        </button>
                    )}
                    <button className={btnClass("review")} onClick={() => openReview(ws.workspaceId)}>
                        Review
                    </button>
                    {!terminal && (
                        <button
                            className={btnClass("merge")}
                            disabled={busy || ws.state != "awaiting_review"}
                            title={ws.state != "awaiting_review" ? "Review first to enable merge" : undefined}
                            onClick={() => model.mergeWorkspace(ws.workspaceId)}
                        >
                            {busy ? "..." : "Merge"}
                        </button>
                    )}
                    {ws.state != "archived" && (
                        <button
                            className={btnClass("archive")}
                            disabled={busy}
                            onClick={() => model.archiveWorkspace(ws.workspaceId)}
                        >
                            Archive
                        </button>
                    )}
                </div>
            </div>
            {selected && (pr != null || age != "") && (
                <div className={`${META} flex items-center gap-2`}>
                    <WorkspacePrChip pr={pr} />
                    {age != "" && <span>{age}</span>}
                </div>
            )}
            {selected && suggestion != null && (
                <div className={`${META} flex items-center gap-1.5`}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent/70 shrink-0" />
                    <span>{suggestion.label}</span>
                </div>
            )}
            {status && <div className={META}>{status}</div>}
            {showUsage && (
                <div className={`${META} font-mono`} title={usageCostTitle(usage)}>
                    {usage.totals.calls == "0"
                        ? "No usage attributed to this workspace yet"
                        : `${usage.provenance == "estimated" ? "~" : ""}${usage.totals.cost} · ${usage.totals.totalTokens} tok · ${usage.totals.calls} calls`}
                </div>
            )}
            {selected && !terminal && <WorkspaceCheckpoints model={model} workspaceId={ws.workspaceId} busy={busy} />}
        </div>
    );
}

WorkspaceRow.displayName = "WorkspaceRow";

// First-run "we found your setup" line — meets the dev where they already live
// (Cursor-style import). Renders nothing when the probe found nothing, so it is
// never a hollow claim.
function EnvironmentImportSummary({ env }: { env: RecoderEnvironment }) {
    if (env == null) {
        return null;
    }
    const found: string[] = [];
    if (env.gitIdentity != null) {
        found.push(`git as ${env.gitIdentity.name || env.gitIdentity.email}`);
    }
    const agents = env.agentConfigs.filter((a) => a.present).map((a) => agentLabel(a.id));
    if (agents.length > 0) {
        found.push(agents.join(", "));
    }
    if (env.ghAuthenticated === true) {
        found.push("gh authenticated");
    }
    if (env.shell != "") {
        found.push(env.shell);
    }
    if (found.length == 0) {
        return null;
    }
    return (
        <div className={`${META} flex items-center gap-1.5`}>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent/70 shrink-0" />
            <span>We found your setup — {found.join(" · ")}</span>
        </div>
    );
}

EnvironmentImportSummary.displayName = "EnvironmentImportSummary";

// Honest liveness for the whole recoder surface: nothing while live, an amber
// "Stale — reconnecting" once the last successful poll ages out or the newest
// poll failed while old data is still shown, red "Offline" until the first
// success. Reads the shared connection model so the Hub never presents stale
// data as live.
function RecoderConnectionBadge() {
    const state = useAtomValue(RecoderConnectionModel.getInstance().connectionStateAtom);
    if (state == "live") {
        return null;
    }
    const label = state == "offline" ? "Offline" : "Stale — reconnecting";
    const tone =
        state == "offline"
            ? "border-red-400/40 bg-red-400/15 text-red-300"
            : "border-amber-400/40 bg-amber-400/15 text-amber-300";
    return <span className={`rounded border px-1.5 py-0.5 text-xs whitespace-nowrap ${tone}`}>{label}</span>;
}

RecoderConnectionBadge.displayName = "RecoderConnectionBadge";

// The single quiet health dot (DESIGN-REFERENCE §3C): ONE quiet color, not a
// stoplight. Graphite by default — a dim neutral dot when up, the SAME neutral
// merely emphasized (higher opacity) when degraded, and the one muted crimson
// reserved for a real down. Never green/amber: a health signal must not borrow a
// "go" hue it hasn't earned, and degraded is a de-emphasis of the neutral rather
// than a second warning color. The detail lives only in the tooltip. A separate
// axis from RecoderConnectionBadge (that one is poll freshness); this one is real
// backend component health.
const HealthDotTone: Record<HealthTone, string> = {
    up: "bg-white/25",
    degraded: "bg-white/60",
    down: "bg-error/70",
};

function healthDotToneClass(tone: HealthTone): string {
    return HealthDotTone[tone] ?? HealthDotTone.degraded;
}

function RecoderHealthDot() {
    const health = RecoderHealthModel.getInstance();
    const dot = useAtomValue(health.healthDotAtom);
    useEffect(() => {
        health.refresh();
        const id = setInterval(() => health.refresh(), HealthRefreshMs);
        return () => clearInterval(id);
    }, []);
    return (
        <span
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${healthDotToneClass(dot.tone)}`}
            title={dot.label}
            aria-label={dot.label}
        />
    );
}

RecoderHealthDot.displayName = "RecoderHealthDot";

// Compare & Converge gets its own room: a full-view in-view modal instead of a
// panel crammed into the expanded board row. The board row keeps the trigger
// (the Compare button toggles compareOpen); this overlay is where the columns and
// the single decision list finally read cleanly with real width. Terminal-plain —
// a backdrop, a thin border, a title, and space; no new chrome.
function RecoderCompareOverlay({
    model,
    taskGroup,
    compareView,
    onClose,
}: {
    model: RecoderViewModel;
    taskGroup: string;
    compareView: CompareView;
    onClose: () => void;
}) {
    const paletteOpen = useAtomValue(model.commandPaletteOpenAtom);
    const shortcutsOpen = useAtomValue(model.shortcutsOpenAtom);
    // Escape composes with the palette/shortcuts overlays: while one of them is open
    // this handler stands down so a single Escape never tears down the whole stack.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key != "Escape" || paletteOpen || shortcutsOpen) {
                return;
            }
            e.stopPropagation();
            onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, paletteOpen, shortcutsOpen]);
    return (
        <div className="fixed inset-0 z-[var(--zindex-typeahead-modal)]">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="absolute inset-x-4 top-6 bottom-6 flex flex-col gap-2 rounded-md border border-white/8 bg-modalbg p-3 shadow-lg recoder-enter">
                <div className="flex items-center gap-2">
                    <span className={SECTION_TITLE}>Compare &amp; Converge</span>
                    <span className={`${META} font-mono`} title={taskGroup}>
                        {shortTaskGroup(taskGroup)}
                    </span>
                    <div className="flex-1" />
                    <button className={QUIET_BTN} onClick={onClose} title="Close compare (Esc)">
                        Close
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                    {compareView != null ? (
                        <RecoderComparePanel model={model} compareView={compareView} onReview={openReview} />
                    ) : (
                        <div className="rounded border border-white/8 p-2">
                            <RecoderSkeleton rows={3} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

RecoderCompareOverlay.displayName = "RecoderCompareOverlay";

function RecoderConductorView({ model }: ViewComponentProps<RecoderViewModel>) {
    const workspaces = useAtomValue(model.workspacesAtom);
    const allWorkspaces = useAtomValue(model.combinedWorkspacesAtom);
    const groups = useAtomValue(model.groupsAtom);
    const columns = useAtomValue(model.boardColumnsAtom);
    const selectMode = useAtomValue(model.selectModeAtom);
    const selectedForConverge = useAtomValue(model.selectedForConvergeAtom);
    const adHocConvergeError = useAtomValue(model.adHocConvergeErrorAtom);
    const [boardFilter, setBoardFilter] = useAtom(model.boardFilterAtom);
    const boardShow = useAtomValue(model.boardShowAtom);
    const [boardProject, setBoardProject] = useAtom(model.boardProjectAtom);
    const projects = useAtomValue(model.projectsAtom);
    const compare = useAtomValue(model.compareAtom);
    const compareOpen = useAtomValue(model.compareOpenAtom);
    const loading = useAtomValue(model.loadingAtom);
    const error = useAtomValue(model.errorAtom);
    const setup = useAtomValue(model.setupAtom);
    const diffSummaries = useAtomValue(model.diffSummariesAtom);
    const prStatuses = useAtomValue(model.prStatusAtom);
    const rowStatus = useAtomValue(model.rowStatusAtom);
    const busyRow = useAtomValue(model.busyRowAtom);
    const [launchOpen, setLaunchOpen] = useAtom(model.launchOpenAtom);
    const [paletteOpen, setPaletteOpen] = useAtom(model.commandPaletteOpenAtom);
    const [shortcutsOpen, setShortcutsOpen] = useAtom(model.shortcutsOpenAtom);
    const [cloneOpen, setCloneOpen] = useAtom(model.cloneOpenAtom);
    const identityModel = RecoderIdentityModel.getInstance();
    const identity = useAtomValue(identityModel.identityAtom);
    const signingIn = useAtomValue(identityModel.signingInAtom);
    const signInPrompt = useAtomValue(identityModel.promptAtom);
    const archivedMeta = useAtomValue(model.archivedMetaAtom);
    const archivedWorkspaces = useAtomValue(model.archivedWorkspacesAtom);
    const loadingOlderArchived = useAtomValue(model.loadingOlderArchivedAtom);
    const [selectedId, setSelectedId] = useAtom(model.selectedWorkspaceIdAtom);
    const [repoPath, setRepoPath] = useAtom(model.launchRepoPathAtom);
    const [repoIsGit, setLaunchRepoIsGit] = useAtom(model.launchRepoIsGitAtom);
    const recentRepos = useAtomValue(model.recentReposAtom);
    const [prompt, setPrompt] = useAtom(model.launchPromptAtom);
    const [runtimeId, setRuntimeId] = useAtom(model.launchRuntimeIdAtom);
    const [alsoRun, setAlsoRun] = useAtom(model.launchAlsoRunAtom);
    const [branch, setBranch] = useAtom(model.launchBranchAtom);
    const [interactive, setInteractive] = useAtom(model.launchInteractiveAtom);
    const posting = useAtomValue(model.postingAtom);
    const launchProgress = useAtomValue(model.launchProgressAtom);
    const launchResult = useAtomValue(model.launchResultAtom);
    const notifyOnAttention = useAtomValue(model.notifyOnAttentionAtom);
    const environment = useAtomValue(model.environmentAtom);
    const githubStatus = useAtomValue(model.githubStatusAtom);
    const githubRepos = useAtomValue(model.githubReposAtom);
    const cloning = useAtomValue(model.cloningAtom);
    const cloneError = useAtomValue(model.cloneErrorAtom);
    const setupProbing = useAtomValue(model.setupProbingAtom);
    const agentAuth = useAtomValue(model.agentAuthAtom);
    const [gitIniting, setGitIniting] = useState(false);
    const [repoQuery, setRepoQuery] = useState("");
    // A dimmed first-run chip's "install" affordance opens the existing agent
    // setup panel even when some agents are already detected.
    const [agentSetupOpen, setAgentSetupOpen] = useState(false);

    useEffect(() => {
        model.refresh();
        // Auto-poll (replaces the removed manual Refresh button).
        const id = setInterval(() => model.refresh(), 6000);
        return () => clearInterval(id);
    }, [model]);

    // Capture-phase so it beats Wave's window keyhandler; ⌘P, ⌘K, and ⌘/ are not
    // bound in keymodel.ts globalKeyMap, so there is no conflict to arbitrate.
    // preventDefault also suppresses the OS print dialog on ⌘P.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) {
                return;
            }
            const key = e.key.toLowerCase();
            if (key == "p" || key == "k") {
                e.preventDefault();
                e.stopPropagation();
                setPaletteOpen((v) => !v);
                return;
            }
            if (key == "/") {
                e.preventDefault();
                e.stopPropagation();
                setShortcutsOpen((v) => !v);
            }
        };
        document.addEventListener("keydown", handler, true);
        return () => document.removeEventListener("keydown", handler, true);
    }, [setPaletteOpen, setShortcutsOpen]);

    // Own the global "new agent" chord at the document level (same capture-phase
    // rationale as ⌘P above) so it fires on a fresh launch when the empty board has
    // no focused descendant — the local onBoardKeyDown never sees keys until a row
    // is focused, which made the advertised "N" onboarding hint dead on first run.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key != "n" && e.key != "N") {
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) {
                return;
            }
            const t = e.target as HTMLElement;
            const tag = t?.tagName;
            if (tag == "INPUT" || tag == "TEXTAREA" || tag == "SELECT" || t?.isContentEditable) {
                return;
            }
            // Gate on open panels so N typed into the launch panel/palette does nothing
            // global; their own Escape/typing still work.
            if (launchOpen || paletteOpen || shortcutsOpen || cloneOpen) {
                return;
            }
            e.preventDefault();
            setLaunchOpen(true);
        };
        document.addEventListener("keydown", handler, true);
        return () => document.removeEventListener("keydown", handler, true);
    }, [launchOpen, paletteOpen, shortcutsOpen, cloneOpen, setLaunchOpen]);

    // A SINGLE interactive launch drops the user straight into the session. Guard
    // on the workspace id so a re-render / poll can never reopen it, and never
    // auto-open parallel launches (that would spawn N terminals at once).
    const lastAutoOpenedRef = useRef<string>("");
    const messageRef = useRef<HTMLTextAreaElement>(null);
    const folderBtnRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!launchResult?.ok || !launchResult.workspaceId || !launchResult.interactive) {
            return;
        }
        if ((launchResult.parallelCount ?? 0) != 0) {
            return;
        }
        if (lastAutoOpenedRef.current == launchResult.workspaceId) {
            return;
        }
        lastAutoOpenedRef.current = launchResult.workspaceId;
        openSession(launchResult.workspaceId);
    }, [launchResult]);

    // Land focus on the most-actionable field when the panel opens: the first
    // message for returning users (repo already seeded), else the folder picker
    // for first-run. Keyed on launchOpen only so typing the path never steals focus.
    useEffect(() => {
        if (!launchOpen) {
            return;
        }
        if (repoPath.trim() != "") {
            messageRef.current?.focus();
            return;
        }
        folderBtnRef.current?.focus();
    }, [launchOpen]);

    const readyAgents = setup.agents.filter((a) => a.available);
    const readyAgentIds = readyAgents.map((a) => a.runtimeId);
    const readyAgentKey = readyAgentIds.join(",");

    // Seed the agent multi-select once per panel open: the ctor primes the atoms
    // from the dev's last remembered selection; if that leaves nothing usable, every
    // detected agent is pre-selected so "fan one task across agents" is the
    // zero-config default. Seeding only when the current selection is empty means a
    // deliberate later de-selection is never re-filled — "Select at least one agent"
    // stays reachable.
    const agentSeededRef = useRef(false);
    useEffect(() => {
        if (!launchOpen) {
            agentSeededRef.current = false;
            return;
        }
        if (agentSeededRef.current || readyAgentIds.length == 0) {
            return;
        }
        agentSeededRef.current = true;
        const seed = seedAgentSelection(readyAgentIds, selectedAgentIds(runtimeId, alsoRun));
        setRuntimeId(seed[0] ?? "");
        setAlsoRun(seed.slice(1));
    }, [launchOpen, readyAgentKey]);

    // Drop any now-uninstalled agent from the selection when the setup probe changes
    // (never re-adds, so a deliberate de-selection survives a re-scan). Keeps the
    // primary anchored to a still-detected agent without forcing a fresh pick.
    // Gated behind the seed: if the first probe lands in the SAME commit as the
    // open-seed, reconcile must not clobber the just-computed zero-config default
    // to empty (both effects would otherwise read the stale ctor selection).
    useEffect(() => {
        if (readyAgentIds.length == 0 || !agentSeededRef.current) {
            return;
        }
        const current = selectedAgentIds(runtimeId, alsoRun);
        const next = reconcileSelection(readyAgentIds, runtimeId, alsoRun);
        const nextIds = selectedAgentIds(next.primary, next.also);
        if (nextIds.length == current.length && nextIds.every((id, i) => id == current[i])) {
            return;
        }
        setRuntimeId(next.primary);
        setAlsoRun(next.also);
    }, [readyAgentKey]);

    // Flat, render-order list of the visible board rows (lifecycle columns, then
    // singleton + parallel-group rows) so keyboard nav walks the FILTERED board
    // exactly as it reads.
    const boardRows = columns.flatMap((c) => c.groups.flatMap((g) => g.workspaces));
    const orderedIds = boardRows.map((w) => w.workspaceId);

    // Ad-hoc converge selection reads (PW1 #1): the locked repo (so cross-repo cards
    // disable) + the action decision (2+ same-repo picks ⇒ converge is callable).
    const selectedRepo = convergeSelectionRepo(allWorkspaces, selectedForConverge);
    const adHocDecision = deriveAdHocConverge(allWorkspaces, selectedForConverge);

    // One board row, optionally prefixed with an ad-hoc converge checkbox while select
    // mode is on. A cross-repo card's checkbox is disabled with a truthful reason so a
    // pick that couldn't converge is never offered (the model fail-closes too).
    const renderBoardRow = (ws: RecoderWorkspace, onConverge?: () => void) => {
        const row = (
            <WorkspaceRow
                key={ws.workspaceId}
                model={model}
                ws={ws}
                summary={diffSummaries[ws.workspaceId]}
                pr={prStatuses[ws.workspaceId]}
                status={rowStatus[ws.workspaceId]}
                busy={busyRow == ws.workspaceId}
                tmuxBin={setup.tmuxBin}
                selected={selectedId == ws.workspaceId}
                onSelect={() => setSelectedId(ws.workspaceId)}
                onConverge={onConverge}
            />
        );
        if (!selectMode) {
            return row;
        }
        const checked = selectedForConverge.has(ws.workspaceId);
        const disabled = !checked && convergeSelectDisabled(ws, selectedRepo);
        return (
            <div key={ws.workspaceId} className="flex items-start gap-2">
                <input
                    type="checkbox"
                    className="mt-2 cursor-pointer disabled:cursor-default"
                    checked={checked}
                    disabled={disabled}
                    title={disabled ? "Different repo — converge needs one repo" : "Select to converge"}
                    onChange={() => model.toggleSelectForConverge(ws.workspaceId)}
                />
                <div className="min-w-0 flex-1">{row}</div>
            </div>
        );
    };

    // Keep the selection anchored to a live row: seed the first row when nothing is
    // selected, and re-seed if a refresh dropped the previously-selected workspace.
    useEffect(() => {
        if (orderedIds.length == 0) {
            return;
        }
        if (!orderedIds.includes(selectedId)) {
            setSelectedId(orderedIds[0] ?? "");
        }
    }, [orderedIds.join(",")]);

    const onBoardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const tag = target?.tagName;
        // Skip when focus is on a field OR an inner row control: a bubbled Enter on a
        // row button (Merge, Archive, ...) must activate that button, not also openSession.
        if (tag == "INPUT" || tag == "TEXTAREA" || tag == "SELECT" || tag == "BUTTON" || target?.isContentEditable) {
            return;
        }
        if (e.key == "Escape") {
            if (launchOpen) {
                setLaunchOpen(false);
                e.preventDefault();
            }
            return;
        }
        if (orderedIds.length == 0) {
            return;
        }
        if (e.key == "j" || e.key == "ArrowDown") {
            const idx = orderedIds.indexOf(selectedId);
            setSelectedId(orderedIds[Math.min(idx + 1, orderedIds.length - 1)]);
            e.preventDefault();
            return;
        }
        if (e.key == "k" || e.key == "ArrowUp") {
            const idx = orderedIds.indexOf(selectedId);
            setSelectedId(orderedIds[Math.max(idx - 1, 0)]);
            e.preventDefault();
            return;
        }
        if (e.key == "Enter" && selectedId != "") {
            const selectedWs = boardRows.find((w) => w.workspaceId == selectedId);
            if (selectedWs != null && isTerminalWorkspaceState(selectedWs.state)) {
                openReview(selectedId);
            } else {
                openSession(selectedId);
            }
            e.preventDefault();
            return;
        }
    };

    // First launch: the embedded backend on :3100 may not be up yet, so refresh()
    // surfaces a raw transport error on an empty board. Treat that as the calm
    // still-starting state rather than an alarming failure row.
    const coldStart = allWorkspaces.length == 0 && isConnectivityError(error);
    const showGettingStarted = shouldShowGettingStarted(loading, allWorkspaces.length, error, launchOpen);
    const needsPrompt = !interactive && prompt.trim() == "";
    // Block launch into a confirmed non-git folder — the worktree add would fail. The
    // inline "Not a git repository" warning below explains it; repoIsGit is optimistic
    // (true until the async check confirms otherwise) so this never blocks prematurely.
    const selectedAgents = selectedAgentIds(runtimeId, alsoRun);
    const selectedCount = selectedAgents.length;
    const canLaunch = !posting && repoPath.trim() != "" && selectedCount >= 1 && !needsPrompt && repoIsGit;
    const disabledReason = launchDisabledReason(repoPath, selectedCount, needsPrompt, setup.probed, readyAgents.length);
    const parallelHint = parallelSelectionHint(selectedCount);
    const orderedRecents = orderedRecentRepos(recentRepos, repoPath);
    const allAgentsSelected = readyAgents.length > 0 && readyAgents.every((a) => selectedAgents.includes(a.runtimeId));
    const isGitError = /git|worktree|repositor/i.test(launchResult?.error ?? "");
    const quickStartRepo = recentRepos.find((r) => r.trim() != "") ?? "";
    // GitHub auto-detect (/github/status + /github/repos): the account's repos
    // become clone-on-pick chips in the Folder picker; repos already cloned into
    // a recent local folder are hidden (their recents chip opens the local copy).
    const githubIdentity = githubIdentityLabel(githubStatus);
    const clonableRepos = filterClonableRepos(githubRepos, recentRepos);
    const matchingClonableRepos = filterReposByQuery(clonableRepos, repoQuery);
    const clonableHint = repoPickerHint(matchingClonableRepos.length, githubRepos.length);
    const firstRunChips = firstRunAgentChips(environment, setup.agents, agentAuth, githubStatus);
    // The first-run HERO: with 2+ agents the parallel run is the star (preselect +
    // open ready); with one, honest "install a second"; with none, the setup panel.
    const hero = firstRunHero(setup.agents, recentRepos);
    const signIn = firstRunSignIn(signingIn, signInPrompt);
    // The archived-history truth chip (recoder-oe8i): shown only on the history
    // Show views and only when the backend reported more history than is loaded.
    const archivedNotice = boardShow != "active" ? archivedHistoryNotice(archivedMeta, archivedWorkspaces.length) : "";

    // Auth read for the currently-selected agent: `/runtimes` proves it's installed
    // but never that it's logged in, so the picker offers an "authenticate" path
    // whenever login is unverified. Never hard-blocks launch — an unverified login
    // still launches (labelled honestly), so a keychain-authed agent isn't gated.
    const selectedAgent = setup.agents.find((a) => a.runtimeId == runtimeId);
    const selectedAuthPres =
        selectedAgent != null && selectedAgent.available
            ? agentAuthPresentation(true, agentAuth[selectedAgent.runtimeId] ?? "unknown")
            : null;

    const toggleAgent = (id: string, on: boolean) => {
        const next = toggleAgentSelection(runtimeId, alsoRun, id, on);
        setRuntimeId(next.primary);
        setAlsoRun(next.also);
    };
    const selectAllAgents = () => {
        const next = allAgentsSelected ? [] : readyAgentIds;
        setRuntimeId(next[0] ?? "");
        setAlsoRun(next.slice(1));
    };

    // Read-only, non-blocking pre-launch check: warn inline the moment a folder is
    // chosen if it isn't a git repo, instead of after a failed worktree add. Fails
    // open (assumes ok) so we never false-warn when git is absent or unreachable.
    const checkRepo = async (path: string) => {
        setLaunchRepoIsGit(true);
        try {
            const ok = await getApi().isGitRepo(path);
            setLaunchRepoIsGit(ok);
        } catch {
            setLaunchRepoIsGit(true);
        }
    };

    // `git init` the chosen folder via the main-process bridge, then RE-VERIFY with
    // the same isGitRepo probe checkRepo uses — launch only re-enables if the folder
    // is genuinely a repo afterwards, so a failed init never fakes readiness.
    const initGit = async () => {
        const path = repoPath.trim();
        if (path == "") {
            return;
        }
        setGitIniting(true);
        try {
            await getApi().gitInit(path);
        } catch {
            // swallow — the re-check below is the source of truth for readiness
        }
        await checkRepo(path);
        setGitIniting(false);
    };

    const browseFolder = async () => {
        const picked = await getApi().selectDirectory();
        if (picked == null || picked == "") {
            return;
        }
        setRepoPath(picked);
        checkRepo(picked);
    };

    // Live command list for ⌘P: primary hub actions first, then a dynamic row per
    // running workspace and per parallel group, then an optional sign-in when
    // signed out. Every agent/workspace name routes through agentLabel — no raw
    // runtime ids reach the palette.
    const commands = useMemo<RecoderCommand[]>(() => {
        const list: RecoderCommand[] = [
            { id: "launch", title: "Launch a coding agent", shortcut: "N", run: () => setLaunchOpen(true) },
            {
                id: "browse",
                title: "Browse folder…",
                run: () => {
                    setLaunchOpen(true);
                    browseFolder();
                },
            },
            { id: "clone-github", title: "Open GitHub project (clone)", run: () => setCloneOpen(true) },
            { id: "review", title: "Review workspace diff", run: openReview },
            { id: "shortcuts", title: "Show keyboard shortcuts", shortcut: "⌘/", run: () => setShortcutsOpen(true) },
            {
                id: "notify-toggle",
                title: notifyOnAttention ? "Turn off attention notifications" : "Turn on attention notifications",
                run: () => model.setNotifyOnAttention(!notifyOnAttention),
            },
            ...navigationCommands(openView),
        ];
        for (const ws of workspaces) {
            const wsLabel = `${agentLabel(ws.runtimeId)} · ${ws.branch}`;
            // Every command for this workspace carries the same search keywords so
            // ⌘K finds it by branch / project / agent / state / task title.
            const keywords = workspaceSearchKeywords(ws);
            list.push({
                id: `session-${ws.workspaceId}`,
                title: `Open session — ${wsLabel}`,
                keywords,
                run: () => openSession(ws.workspaceId),
            });
            list.push({
                id: `review-${ws.workspaceId}`,
                title: `Review — ${wsLabel}`,
                keywords,
                run: () => openReview(ws.workspaceId),
            });
            if (ws.sessionName) {
                list.push({
                    id: `terminal-${ws.workspaceId}`,
                    title: `Open terminal — ${wsLabel}`,
                    keywords,
                    run: () => openTerminal(ws, setup.tmuxBin),
                });
            }
            if (ws.state == "awaiting_review") {
                list.push({
                    id: `merge-${ws.workspaceId}`,
                    title: `Merge — ${wsLabel}`,
                    keywords,
                    run: () => model.mergeWorkspace(ws.workspaceId),
                });
            }
            list.push({
                id: `archive-${ws.workspaceId}`,
                title: `Archive — ${wsLabel}`,
                keywords,
                run: () => model.archiveWorkspace(ws.workspaceId),
            });
        }
        for (const group of groups) {
            if (group.workspaces.length <= 1) {
                continue;
            }
            list.push({
                id: `compare-${group.taskGroup}`,
                title: `Compare parallel group — ${group.workspaces.length} agents`,
                run: () => model.toggleCompare(group.taskGroup ?? "", group.workspaces),
            });
        }
        if (identity == null) {
            list.push({
                id: "signin",
                title: "Sign in with Recoder",
                run: () => RecoderIdentityModel.getInstance().signIn(),
            });
        }
        return list;
    }, [
        workspaces,
        groups,
        identity,
        model,
        setup.tmuxBin,
        notifyOnAttention,
        setLaunchOpen,
        setShortcutsOpen,
        setCloneOpen,
    ]);

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2" onKeyDown={onBoardKeyDown}>
            <div className="flex items-center gap-2">
                <span
                    className="flex h-[18px] items-center [&>svg]:h-full [&>svg]:w-auto opacity-90"
                    aria-hidden="true"
                    title="Recoder"
                >
                    <RecoderCubeLogo />
                </span>
                <span className={PAGE_TITLE}>Workspaces</span>
                <RecoderHealthDot />
                <RecoderConnectionBadge />
                <div className="flex-1" />
                <RecoderIdentityAffordance onOpenSettings={() => openView("recoder-settings")} />
                <button className={PRIMARY_BTN} onClick={() => setLaunchOpen(!launchOpen)}>
                    New agent
                    <span className="ml-1.5 text-xs text-meta font-mono">N</span>
                </button>
            </div>

            <RecoderWhatsNew />

            <RecoderErrorRow message={coldStart ? "" : error} />
            {loading && workspaces.length == 0 && error == "" && <RecoderSkeleton rows={3} />}

            {launchOpen && (
                <div className="fixed inset-0 z-[var(--zindex-typeahead-modal)]">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setLaunchOpen(false)} />
                    <div
                        className="absolute left-1/2 top-[10%] flex max-h-[80vh] w-[560px] max-w-[90vw] -translate-x-1/2 flex-col gap-3 overflow-y-auto rounded-md border border-white/8 bg-modalbg p-4 shadow-lg recoder-enter"
                        onKeyDown={(e) => {
                            // launch chord lives here (not on a single field) so keydown bubbling from
                            // any inner select/input/textarea fires it - one owner avoids a double-launch
                            if (e.key == "Escape") {
                                setLaunchOpen(false);
                                e.stopPropagation();
                                return;
                            }
                            if ((e.metaKey || e.ctrlKey) && e.key == "Enter" && canLaunch) {
                                e.preventDefault();
                                model.launch();
                            }
                        }}
                    >
                        <div className={SECTION_TITLE}>Launch a coding agent</div>

                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                                <span className={FIELD_LABEL}>Agents</span>
                                {readyAgents.length > 1 && (
                                    <button className={QUIET_BTN} onClick={selectAllAgents}>
                                        {allAgentsSelected ? "Clear" : "Select all"}
                                    </button>
                                )}
                            </div>
                            {/* One task, N agents: ticked chips fan the task across every
                                selected agent as parallel siblings in one taskGroup; a
                                single ticked chip is the trivial solo launch. */}
                            <div className="flex flex-wrap gap-1.5">
                                {setup.agents.map((a) => {
                                    const on = selectedAgents.includes(a.runtimeId);
                                    return (
                                        <button
                                            key={a.runtimeId}
                                            className={`${on ? PICK_BTN_ON : CHIP} ${a.available ? "" : "opacity-50 cursor-default"}`}
                                            disabled={!a.available}
                                            aria-pressed={on}
                                            title={
                                                a.available
                                                    ? `${on ? "Running" : "Add"} ${agentLabel(a.runtimeId)} on this task`
                                                    : `${agentLabel(a.runtimeId)} not detected on PATH`
                                            }
                                            onClick={() => toggleAgent(a.runtimeId, !on)}
                                        >
                                            {agentLabel(a.runtimeId)}
                                            {agentAuthOptionSuffix(a.available, agentAuth[a.runtimeId] ?? "unknown")}
                                        </button>
                                    );
                                })}
                            </div>
                            {selectedAuthPres?.needsAuth && (
                                <AgentAuthAffordance runtimeId={runtimeId} badge={selectedAuthPres.badge} />
                            )}
                            {setup.probed && readyAgents.length == 0 && (
                                <div className="flex items-center gap-2">
                                    <span className={META}>
                                        No agent detected on PATH. Install one, then re-scan — no restart needed.
                                    </span>
                                    <button
                                        className={QUIET_BTN}
                                        disabled={setupProbing}
                                        onClick={() => model.rescanAgents()}
                                    >
                                        {setupProbing ? "Scanning…" : "Re-scan"}
                                    </button>
                                </div>
                            )}
                        </div>

                        <label className="flex flex-col gap-1">
                            <span className={FIELD_LABEL}>Folder</span>
                            {repoPath.trim() == "" ? (
                                <button ref={folderBtnRef} className={`${PRIMARY_BTN} w-full`} onClick={browseFolder}>
                                    Choose folder...
                                </button>
                            ) : (
                                <div className="flex items-center gap-2" title={repoPath}>
                                    <div className="flex min-w-0 flex-1 flex-col">
                                        <span className={`${ROW_TITLE} truncate`}>{folderName(repoPath)}</span>
                                        <span className={`${META} truncate font-mono`}>{repoPath}</span>
                                    </div>
                                    <button className={QUIET_BTN} onClick={browseFolder}>
                                        Change
                                    </button>
                                </div>
                            )}
                            {orderedRecents.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {orderedRecents.map((r) => (
                                        <button
                                            key={r}
                                            className={CHIP}
                                            title={r}
                                            onClick={() => {
                                                setRepoPath(r);
                                                checkRepo(r);
                                            }}
                                        >
                                            {folderName(r)}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {clonableRepos.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <span className={META}>
                                        From your GitHub{githubIdentity != "" ? ` (${githubIdentity})` : ""} — pick to
                                        clone:
                                    </span>
                                    {clonableRepos.length > RepoChipDisplayLimit && (
                                        <input
                                            className={`${INPUT} font-mono`}
                                            placeholder="Type to filter repos…"
                                            value={repoQuery}
                                            onChange={(e) => setRepoQuery(e.target.value)}
                                        />
                                    )}
                                    <div className="flex flex-wrap gap-1.5">
                                        {matchingClonableRepos.slice(0, RepoChipDisplayLimit).map((r) => (
                                            <button
                                                key={r.nameWithOwner}
                                                className={CHIP}
                                                title={r.url}
                                                disabled={cloning}
                                                onClick={() => model.cloneRepo(r.url)}
                                            >
                                                {r.nameWithOwner}
                                            </button>
                                        ))}
                                    </div>
                                    {matchingClonableRepos.length == 0 && repoQuery.trim() != "" && (
                                        <span className={META}>No listed repos match.</span>
                                    )}
                                    {clonableHint != "" && <span className={META}>{clonableHint}</span>}
                                    {cloning && <span className={META}>Cloning…</span>}
                                    {!cloning && cloneError != "" && <div className={ERROR_ROW}>{cloneError}</div>}
                                </div>
                            )}
                            {repoPath.trim() != "" && !repoIsGit && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={META}>
                                        Not a git repository — Recoder needs one to create isolated worktrees.
                                    </span>
                                    <button className={QUIET_BTN} disabled={gitIniting} onClick={initGit}>
                                        {gitIniting ? "Initializing…" : "Initialize git repository"}
                                    </button>
                                </div>
                            )}
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className={FIELD_LABEL}>
                                First message{interactive ? " (optional)" : " (required)"}
                            </span>
                            <textarea
                                ref={messageRef}
                                className={`${INPUT} min-h-16 resize-y`}
                                placeholder={
                                    interactive
                                        ? "Optionally start the agent with a message - or leave empty and chat once it's running..."
                                        : "Describe the task - required for a non-interactive run."
                                }
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                            />
                        </label>

                        {selectedCount <= 1 && (
                            <label className="flex flex-col gap-1">
                                <span className={FIELD_LABEL}>Branch (optional)</span>
                                <input
                                    className={INPUT}
                                    placeholder="auto-named if empty"
                                    value={branch}
                                    onChange={(e) => setBranch(e.target.value)}
                                />
                            </label>
                        )}

                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                className="cursor-pointer"
                                checked={interactive}
                                onChange={(e) => setInteractive(e.target.checked)}
                            />
                            <span>Interactive session - run the real agent TUI</span>
                        </label>

                        <div className="flex items-center gap-2">
                            <button className={PRIMARY_BTN} disabled={!canLaunch} onClick={() => model.launch()}>
                                {posting ? "Launching..." : "Launch"}
                                {!posting && <span className="ml-1.5 text-xs text-meta font-mono">⌘↵</span>}
                            </button>
                            <button className={QUIET_BTN} onClick={() => setLaunchOpen(false)}>
                                Cancel
                            </button>
                            {parallelHint != "" && <span className="text-xs text-secondary">{parallelHint}</span>}
                            {posting && launchProgress != "" && <span className={META}>{launchProgress}</span>}
                        </div>

                        {!canLaunch && disabledReason != "" && <div className={META}>{disabledReason}</div>}

                        {launchResult != null && !launchResult.ok && (
                            <div className="flex flex-col gap-1">
                                <div className={ERROR_ROW}>{launchResult.error || "Launch failed"}</div>
                                {isGitError && (
                                    <div className={META}>
                                        Recoder needs a git repository here. Run `git init` in this folder, or choose a
                                        repo folder.
                                    </div>
                                )}
                                <button className={QUIET_BTN} onClick={browseFolder}>
                                    Choose another folder
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {launchResult != null && launchResult.ok && !launchOpen && (
                <div className="flex flex-wrap items-center gap-2 text-secondary text-sm">
                    <span>{launchResult.message}</span>
                    {launchResult.workspaceId && (
                        <>
                            <button className={QUIET_BTN} onClick={() => openSession(launchResult.workspaceId)}>
                                Open session
                            </button>
                            {launchResult.sessionName && (
                                <button
                                    className={QUIET_BTN}
                                    onClick={() =>
                                        openWorkspaceTerminal(
                                            { sessionName: launchResult.sessionName, cwd: launchResult.worktreePath },
                                            setup.tmuxBin || undefined
                                        )
                                    }
                                >
                                    Terminal
                                </button>
                            )}
                            <button className={QUIET_BTN} onClick={() => openReview(launchResult.workspaceId)}>
                                Review
                            </button>
                        </>
                    )}
                </div>
            )}

            {showGettingStarted && (
                <div className="flex flex-col gap-3 rounded border border-white/8 p-4 mt-1 recoder-enter">
                    <div className="flex flex-col gap-1">
                        <h2 className={SECTION_TITLE}>Welcome to Recoder</h2>
                        <div className={META}>
                            Run your coding agents in parallel isolated worktrees, then review and merge.
                        </div>
                        <EnvironmentImportSummary env={environment} />
                    </div>
                    {identity == null && (
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    className={QUIET_BTN}
                                    disabled={signIn.waiting}
                                    onClick={() => identityModel.signIn()}
                                >
                                    {signIn.label}
                                </button>
                                <span className={META}>
                                    Optional — syncs memory and PRs. Local agents run without it.
                                </span>
                            </div>
                            {signIn.showCode && (
                                <div className={`${META} flex flex-wrap items-center gap-2`} aria-live="polite">
                                    <span>Enter code</span>
                                    <code className="rounded border border-white/8 bg-white/[0.04] px-2 py-0.5 font-mono text-sm text-primary">
                                        {signIn.code}
                                    </code>
                                    <span>at {signIn.verificationUri}</span>
                                </div>
                            )}
                        </div>
                    )}
                    {/* The hero: with 2+ agents, "one task → N agents → merge the best" IS
                        the star (preselect the detected agents, open launch ready to go). With
                        exactly one, say so truthfully and point at installing a second — the
                        core value genuinely needs 2+. Terminal-plain: copy + one action. */}
                    {hero.mode == "parallel" && (
                        <div className="flex flex-col gap-2 rounded border border-white/8 bg-white/[0.04] p-3">
                            <div className="flex flex-col gap-1">
                                <span className={ROW_TITLE}>Give one task to {hero.agentSummary} at once</span>
                                <span className={META}>
                                    Each agent works in its own isolated worktree — then you compare and merge
                                    the best result. That’s the whole point of Recoder.
                                </span>
                            </div>
                            <div>
                                <button
                                    className={PRIMARY_BTN}
                                    onClick={() => {
                                        setRuntimeId(hero.primary);
                                        setAlsoRun(hero.also);
                                        // One-click when a recent repo exists: prefill the repo +
                                        // an editable starter prompt so launch opens ready to go.
                                        // Truthful — never a fabricated repo (canOneClick gates it).
                                        if (hero.firstTask.canOneClick) {
                                            setRepoPath(hero.firstTask.repoPath);
                                            if (prompt.trim() == "") {
                                                setPrompt(hero.firstTask.prompt);
                                            }
                                        }
                                        setLaunchOpen(true);
                                    }}
                                >
                                    {hero.firstTask.canOneClick
                                        ? `Run your first task on ${hero.firstTask.repoName}`
                                        : "Run your first parallel task"}
                                </button>
                            </div>
                        </div>
                    )}
                    {hero.mode == "install-second" && (
                        <div className="flex flex-col gap-2 rounded border border-white/8 bg-white/[0.04] p-3">
                            <div className="flex flex-col gap-1">
                                <span className={ROW_TITLE}>Install a second agent to unlock parallel runs</span>
                                <span className={META}>
                                    You have {hero.agentLabel}. Recoder’s edge is giving ONE task to two agents at
                                    once and merging the best — that needs a second agent. Open a project to run{" "}
                                    {hero.agentLabel} solo, or install another below.
                                </span>
                            </div>
                            <div>
                                <button className={QUIET_BTN} onClick={() => setAgentSetupOpen((open) => !open)}>
                                    Show install steps
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button
                            className={ENTRY_CARD}
                            onClick={() => {
                                setLaunchOpen(true);
                                browseFolder();
                            }}
                        >
                            <span className={ROW_TITLE}>Open project</span>
                            <span className={META}>
                                Pick a git repo folder and launch a coding agent in a fresh worktree.
                            </span>
                        </button>
                        <button className={ENTRY_CARD} onClick={() => setCloneOpen(true)}>
                            <span className={ROW_TITLE}>Open GitHub project</span>
                            <span className={META}>
                                Clone a repository from GitHub, then launch a coding agent into it.
                            </span>
                        </button>
                        {quickStartRepo != "" && (
                            <button
                                className={ENTRY_CARD}
                                title={quickStartRepo}
                                onClick={() => {
                                    setRepoPath(quickStartRepo);
                                    checkRepo(quickStartRepo);
                                    setLaunchOpen(true);
                                }}
                            >
                                <span className={ROW_TITLE}>Quick start</span>
                                <span className={META}>
                                    Launch into {folderName(quickStartRepo)} with your last agent.
                                </span>
                            </button>
                        )}
                    </div>
                    <div className={META}>
                        Press <span className="font-mono">⌘P</span> for commands · <span className="font-mono">N</span>{" "}
                        for a new agent
                    </div>
                    {setup.loaded ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`${META} ${setup.git ? "" : "opacity-60"}`}>
                                {setup.git ? "✓" : "✗"} git
                            </span>
                            {firstRunChips.map((chip) =>
                                chip.present ? (
                                    <span
                                        key={chip.id}
                                        className="rounded border border-white/8 px-2 py-0.5 text-xs text-secondary"
                                        title={
                                            chip.kind == "github"
                                                ? "GitHub connected"
                                                : chip.authed
                                                  ? `${chip.label} detected and signed in`
                                                  : `${chip.label} detected — sign-in not verified`
                                        }
                                    >
                                        ✓ {chip.label}
                                    </span>
                                ) : chip.kind == "agent" ? (
                                    <button
                                        key={chip.id}
                                        className={`${CHIP} opacity-60`}
                                        title={`${chip.label} not detected — show install steps`}
                                        onClick={() => setAgentSetupOpen((open) => !open)}
                                    >
                                        {chip.label} · install
                                    </button>
                                ) : (
                                    <span
                                        key={chip.id}
                                        className="rounded border border-white/8 px-2 py-0.5 text-xs text-secondary opacity-60"
                                        title="GitHub not connected — run `gh auth login` to pick repos here"
                                    >
                                        {chip.label}
                                    </span>
                                )
                            )}
                        </div>
                    ) : setup.probed ? (
                        <div className={META}>Couldn’t reach Recoder yet - it may still be starting.</div>
                    ) : (
                        <div className={META}>Checking local setup...</div>
                    )}
                    {setup.loaded && (readyAgents.length == 0 || agentSetupOpen) && (
                        <RecoderAgentSetup model={model} probing={setupProbing} />
                    )}
                </div>
            )}

            {allWorkspaces.length > 0 && (
                <div className="flex items-center gap-2">
                    <input
                        className={`${INPUT} min-w-0 flex-1`}
                        placeholder="Filter by task, branch, or agent..."
                        value={boardFilter}
                        onChange={(e) => setBoardFilter(e.target.value)}
                    />
                    {projects.length > 1 && (
                        <label className="flex items-center gap-1.5">
                            <span className={FIELD_LABEL}>Project</span>
                            <select
                                className={`${INPUT} cursor-pointer max-w-[12rem]`}
                                value={boardProject}
                                onChange={(e) => setBoardProject(e.target.value)}
                            >
                                <option value="">All projects</option>
                                {projects.map((p) => (
                                    <option key={p.projectId} value={p.projectId}>
                                        {p.projectId} ({p.count})
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    <label className="flex items-center gap-1.5">
                        <span className={FIELD_LABEL}>Show</span>
                        <select
                            className={`${INPUT} cursor-pointer`}
                            value={boardShow}
                            onChange={(e) => model.setBoardShow(e.target.value as RecoderBoardShow)}
                        >
                            <option value="active">Active</option>
                            <option value="all">All</option>
                            <option value="archived">Archived</option>
                        </select>
                    </label>
                    <label
                        className="flex items-center gap-1.5 text-sm text-secondary cursor-pointer whitespace-nowrap"
                        title="Show an OS notification when an agent needs your input"
                    >
                        <input
                            type="checkbox"
                            className="cursor-pointer"
                            checked={notifyOnAttention}
                            onChange={(e) => model.setNotifyOnAttention(e.target.checked)}
                        />
                        <span>Notify</span>
                    </label>
                    <button
                        className={selectMode ? PICK_BTN_ON : QUIET_BTN}
                        onClick={() => model.toggleSelectMode()}
                        title="Tick 2+ workspaces from separate runs to compare and converge them"
                    >
                        {selectMode ? "Selecting…" : "Select to converge"}
                    </button>
                    <button className={QUIET_BTN} onClick={() => setCloneOpen(true)}>
                        Clone repo
                    </button>
                </div>
            )}
            {selectMode && (
                <div className={`${META} flex flex-wrap items-center gap-2`}>
                    <span>
                        {adHocDecision.count} selected
                        {adHocDecision.repo != null && adHocDecision.count > 0 ? ` · ${adHocDecision.repo}` : ""}
                    </span>
                    <button
                        className={adHocDecision.canConverge ? PRIMARY_BTN : QUIET_BTN}
                        disabled={!adHocDecision.canConverge}
                        title={adHocDecision.reason || "Compare the selected workspaces side-by-side and converge"}
                        onClick={() => model.loadAdHocCompare(adHocDecision.ids)}
                    >
                        Converge {adHocDecision.count} selected
                    </button>
                    <button className={QUIET_BTN} onClick={() => model.setSelectMode(false)}>
                        Cancel
                    </button>
                    {adHocConvergeError != "" && <span className="text-error">{adHocConvergeError}</span>}
                </div>
            )}
            {allWorkspaces.length > 0 && (
                <div className={META}>
                    <span className="font-mono">N</span> new · <span className="font-mono">⌘P</span>/
                    <span className="font-mono">⌘K</span> commands · <span className="font-mono">j</span>/
                    <span className="font-mono">k</span> select · <span className="font-mono">↵</span> open ·{" "}
                    <span className="font-mono">⌘/</span> shortcuts
                </div>
            )}
            {allWorkspaces.length > 0 && boardRows.length == 0 && !loading && (
                <div className={META}>No workspaces match this filter.</div>
            )}
            {archivedNotice != "" && (
                <div className={`${META} flex items-center gap-2`}>
                    <span
                        className="rounded border border-white/8 px-1.5 py-0.5"
                        title="The archive holds more history than is loaded"
                    >
                        {archivedNotice}
                    </span>
                    <button
                        className={QUIET_BTN}
                        disabled={loadingOlderArchived}
                        onClick={() => model.loadOlderArchived()}
                    >
                        {loadingOlderArchived ? "Loading…" : "Show older"}
                    </button>
                </div>
            )}
            <div className="flex flex-col gap-2">
                {columns.map((column) => (
                    <div key={column.id} className="flex flex-col gap-1">
                        <div className={FIELD_LABEL}>
                            {column.label} · {column.groups.reduce((n, g) => n + g.workspaces.length, 0)}
                        </div>
                        {column.groups.map((group) => {
                            if (group.workspaces.length <= 1) {
                                return renderBoardRow(group.workspaces[0]);
                            }
                            const taskGroup = group.taskGroup ?? "";
                            const compareView = compare[taskGroup];
                            const isCompareOpen = compareOpen == taskGroup;
                            // The cluster's convergence phase — the board's entry
                            // point into compare/converge. Non-null here (2+ siblings).
                            const cluster = deriveClusterState(group.workspaces, compareView);
                            // Converge is the cluster's PRIMARY next step only when the
                            // fan-out has finished with real divergence to reconcile —
                            // and only while the panel (which carries its own accent) is
                            // closed, so a cluster never shows two accents at once.
                            const convergeReady = cluster?.convergePrimary && !isCompareOpen;
                            // Open-only (never a toggle): the per-card affordance
                            // must always land on the open panel.
                            const onConverge = showConvergeAffordance(taskGroup, group.workspaces.length)
                                ? () => {
                                      if (compareOpen != taskGroup) {
                                          model.toggleCompare(taskGroup, group.workspaces);
                                      }
                                  }
                                : undefined;
                            return (
                                <div key={taskGroup} className="flex flex-col gap-1 rounded border border-white/8 p-2">
                                    <div className="flex items-center gap-2">
                                        <span className={ROW_TITLE}>{group.workspaces.length} agents</span>
                                        {cluster != null && (
                                            <span className={META} title={cluster.reason || undefined}>
                                                · {cluster.detail}
                                            </span>
                                        )}
                                        {/* Early collision heads-up: while the fan-out is
                                            still running the detail carries only "M of N
                                            done", so surface the overlap read BEFORE converge.
                                            Once settled the detail itself tells the divergence
                                            story, so this stays running-only to avoid echoing
                                            it. Empty when the contested set isn't loaded. */}
                                        {cluster != null &&
                                            cluster.phase == "running" &&
                                            cluster.overlap != "" && (
                                                <span className={META}>· {cluster.overlap}</span>
                                            )}
                                        <span className={`${META} font-mono`} title={taskGroup}>
                                            {shortTaskGroup(taskGroup)}
                                        </span>
                                        <div className="flex-1" />
                                        {/* explicit click, not an auto-open — parallel launches never AUTO-open */}
                                        <button
                                            className={QUIET_BTN}
                                            onClick={() =>
                                                group.workspaces.forEach((ws) => openSession(ws.workspaceId))
                                            }
                                            title={`Open a session for each of the ${group.workspaces.length} agents`}
                                        >
                                            Open all
                                        </button>
                                        {convergeReady ? (
                                            <button
                                                className={PRIMARY_BTN}
                                                onClick={() => model.toggleCompare(taskGroup, group.workspaces)}
                                                title="Compare all agents side-by-side and converge on one branch"
                                            >
                                                Compare &amp; Converge
                                            </button>
                                        ) : (
                                            <button
                                                className={QUIET_BTN}
                                                onClick={() => model.toggleCompare(taskGroup, group.workspaces)}
                                                title={
                                                    !isCompareOpen && cluster != null && cluster.reason != ""
                                                        ? cluster.reason
                                                        : undefined
                                                }
                                            >
                                                {isCompareOpen ? "Hide compare" : "Compare"}
                                            </button>
                                        )}
                                    </div>
                                    {group.workspaces.map((ws) => renderBoardRow(ws, onConverge))}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Compare & Converge lives here as a full-view overlay (not inside the
                board row) so it gets real room. Rendered before the palette/shortcuts
                so those paint above it and its own Escape stands down while they're open. */}
            {compareOpen != "" && (
                <RecoderCompareOverlay
                    model={model}
                    taskGroup={compareOpen}
                    compareView={compare[compareOpen]}
                    onClose={() => model.toggleCompare(compareOpen, [])}
                />
            )}
            {/* Rendered before the palette/shortcuts so those paint above it; its
                Escape handler stands down while either of them is open. */}
            {cloneOpen && <RecoderCloneModal model={model} onClose={() => setCloneOpen(false)} />}
            {paletteOpen && (
                <RecoderCommandPalette
                    commands={commands}
                    onClose={() => setPaletteOpen(false)}
                    sessionSearch={paletteSessionSearch}
                />
            )}
            {shortcutsOpen && <RecoderShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
        </div>
    );
}

RecoderConductorView.displayName = "RecoderConductorView";

export { HealthDotTone, healthDotToneClass, RecoderConductorView };
