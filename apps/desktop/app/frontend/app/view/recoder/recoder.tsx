// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock, getApi } from "@/app/store/global";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { agentAuthOptionSuffix, agentAuthPresentation } from "./recoder-agent-auth";
import { agentLabel } from "./recoder-agent-labels";
import { AgentAuthAffordance, RecoderAgentSetup } from "./recoder-agent-setup";
import { RecoderCloneModal } from "./recoder-clone";
import { RecoderCommandPalette, type RecoderCommand } from "./recoder-command-palette";
import { RecoderComparePanel } from "./recoder-compare";
import { RecoderConnectionModel } from "./recoder-connection-model";
import { isConnectivityError } from "./recoder-errors";
import { RecoderIdentityAffordance } from "./recoder-identity";
import { RecoderIdentityModel } from "./recoder-identity-model";
import {
    attentionBadgeLabel,
    formatRelativeAge,
    isTerminalWorkspaceState,
    RecoderViewModel,
    suggestNextAction,
    workspaceSearchKeywords,
    type RecoderBoardShow,
    type RecoderDiffSummary,
    type RecoderEnvironment,
    type RecoderRowActionId,
    type RecoderRowSuggestion,
    type RecoderWorkspace,
} from "./recoder-model";
import { navigationCommands } from "./recoder-nav-commands";
import { openWorkspaceTerminal } from "./recoder-open-terminal";
import { RecoderShortcutsOverlay } from "./recoder-shortcuts";
import { RecoderWhatsNew } from "./recoder-whats-new-panel";
import { RecoderErrorRow, RecoderSkeleton } from "./recoder-states";
import {
    fetchTranscriptSearch,
    projectTranscriptSearchResult,
    transcriptCommands,
} from "./recoder-transcript-search";
import {
    ATTN_BADGE,
    CHIP,
    ENTRY_CARD,
    ERROR_ROW,
    FIELD_LABEL,
    INPUT,
    META,
    PAGE_TITLE,
    PRIMARY_BTN,
    QUIET_BTN,
    ROW_TITLE,
    SECTION_TITLE,
} from "./recoder-styles";

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

// Self-explains the greyed Launch button: empty string means nothing to say
// (either ready to launch, or already posting).
function launchDisabledReason(
    repoPath: string,
    runtimeId: string,
    needsPrompt: boolean,
    probed: boolean,
    readyCount: number
): string {
    if (repoPath.trim() == "") {
        return "Choose a folder to launch.";
    }
    if (runtimeId == "") {
        if (!probed) {
            return "Detecting installed agents…";
        }
        if (readyCount == 0) {
            return "No coding agents found on PATH. Install Claude Code, Codex, or opencode, then reopen.";
        }
        return "Choose an agent to launch.";
    }
    if (needsPrompt) {
        return "Add a first message, or turn on interactive session.";
    }
    return "";
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

type WorkspaceRowProps = {
    model: RecoderViewModel;
    ws: RecoderWorkspace;
    summary: RecoderDiffSummary;
    status: string;
    busy: boolean;
    tmuxBin: string;
    selected: boolean;
    onSelect: () => void;
};

function WorkspaceRow({ model, ws, summary, status, busy, tmuxBin, selected, onSelect }: WorkspaceRowProps) {
    const ref = useRef<HTMLDivElement>(null);
    const usage = useAtomValue(model.usageAtom);
    const usageWorkspaceId = useAtomValue(model.usageWorkspaceIdAtom);
    useEffect(() => {
        if (!selected) {
            return;
        }
        ref.current?.scrollIntoView({ block: "nearest" });
        model.loadUsage(ws.workspaceId);
    }, [selected]);
    // The strip renders ONLY when the loaded display was fetched for THIS row's
    // workspace — a stale fetch for a previously-selected row shows nothing.
    const showUsage = selected && usage != null && usageWorkspaceId == ws.workspaceId;
    const terminal = isTerminalWorkspaceState(ws.state);
    const age = formatRelativeAge(ws.createdAt);
    // "" for any attention the board must NOT badge (absent/unknown/working/…),
    // so a row only ever shows a badge the backend actually reported.
    const attnLabel = attentionBadgeLabel(ws.attention);
    const suggestion = suggestNextAction(ws.state, summary, ws.sessionName != null && ws.sessionName != "");
    // Promote exactly one existing button to primary when it IS the suggested next
    // step; every other button stays quiet. Never invents an action.
    const btnClass = (action: RecoderRowActionId): string =>
        suggestion != null && suggestion.action == action && !busy ? PRIMARY_BTN : QUIET_BTN;
    return (
        <div
            ref={ref}
            tabIndex={0}
            data-selected={selected}
            onClick={onSelect}
            onFocus={onSelect}
            className={`flex flex-col gap-1 rounded border border-white/8 px-3 py-2 recoder-transition hover:border-white/12 cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-white/50 ${selected ? "bg-accent" : "hover:bg-white/[0.04]"} ${terminal ? "opacity-60" : ""}`}
            title={`${ws.workspaceId} - ${ws.branch}`}
        >
            <div className="flex items-center gap-2">
                <span className={`${ROW_TITLE} truncate font-mono`}>{ws.branch}</span>
                <span className={META}>{ws.state}</span>
                {attnLabel != "" && (
                    <span className={ATTN_BADGE} title="This agent stopped mid-run and is waiting on you">
                        {attnLabel}
                    </span>
                )}
                {summary != null && summary.files > 0 && (
                    <span className={`${META} font-mono`}>
                        +{summary.additions} -{summary.deletions}
                    </span>
                )}
                <span className={`${META} ml-auto`}>{agentLabel(ws.runtimeId)}</span>
                {age != "" && <span className={META}>{age}</span>}
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
                    <button className={btnClass("archive")} disabled={busy} onClick={() => model.archiveWorkspace(ws.workspaceId)}>
                        Archive
                    </button>
                )}
            </div>
            {suggestion != null && (
                <div className={`${META} flex items-center gap-1.5`}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent/70 shrink-0" />
                    <span>{suggestion.label}</span>
                </div>
            )}
            {status && <div className={META}>{status}</div>}
            {showUsage && (
                <div className={`${META} font-mono`} title={`Metered inference spend for ${usage.scopeLabel}`}>
                    {usage.totals.calls == "0"
                        ? "No metered usage attributed to this workspace"
                        : `${usage.totals.cost} · ${usage.totals.totalTokens} tok · ${usage.totals.calls} calls`}
                </div>
            )}
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

function RecoderConductorView({ model }: ViewComponentProps<RecoderViewModel>) {
    const workspaces = useAtomValue(model.workspacesAtom);
    const allWorkspaces = useAtomValue(model.allWorkspacesAtom);
    const groups = useAtomValue(model.groupsAtom);
    const buckets = useAtomValue(model.boardBucketsAtom);
    const [boardFilter, setBoardFilter] = useAtom(model.boardFilterAtom);
    const [boardShow, setBoardShow] = useAtom(model.boardShowAtom);
    const [boardProject, setBoardProject] = useAtom(model.boardProjectAtom);
    const projects = useAtomValue(model.projectsAtom);
    const compare = useAtomValue(model.compareAtom);
    const compareOpen = useAtomValue(model.compareOpenAtom);
    const loading = useAtomValue(model.loadingAtom);
    const error = useAtomValue(model.errorAtom);
    const setup = useAtomValue(model.setupAtom);
    const diffSummaries = useAtomValue(model.diffSummariesAtom);
    const rowStatus = useAtomValue(model.rowStatusAtom);
    const busyRow = useAtomValue(model.busyRowAtom);
    const [launchOpen, setLaunchOpen] = useAtom(model.launchOpenAtom);
    const [paletteOpen, setPaletteOpen] = useAtom(model.commandPaletteOpenAtom);
    const [shortcutsOpen, setShortcutsOpen] = useAtom(model.shortcutsOpenAtom);
    const [cloneOpen, setCloneOpen] = useAtom(model.cloneOpenAtom);
    const identity = useAtomValue(RecoderIdentityModel.getInstance().identityAtom);
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
    const setupProbing = useAtomValue(model.setupProbingAtom);
    const agentAuth = useAtomValue(model.agentAuthAtom);
    const [gitIniting, setGitIniting] = useState(false);

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

    // Zero-config: the ctor seeds the last-used agent from localStorage. If none
    // is remembered, preselect the first installed agent. If a remembered agent is
    // no longer installed, fall back to the first ready one rather than leaving an
    // unavailable selection. A live deliberate choice otherwise stays.
    useEffect(() => {
        if (readyAgents.length == 0) {
            return;
        }
        if (runtimeId == "") {
            setRuntimeId(readyAgents[0].runtimeId);
            return;
        }
        if (!readyAgents.some((a) => a.runtimeId == runtimeId)) {
            setRuntimeId(readyAgents[0].runtimeId);
        }
    }, [readyAgents.length, runtimeId]);

    // Flat, render-order list of the visible board rows (recency buckets, then
    // singleton + parallel-group rows) so keyboard nav walks the FILTERED board
    // exactly as it reads.
    const boardRows = buckets.flatMap((b) => b.groups.flatMap((g) => g.workspaces));
    const orderedIds = boardRows.map((w) => w.workspaceId);

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
    const showGettingStarted = !loading && allWorkspaces.length == 0 && (error == "" || coldStart) && !launchOpen;
    const needsPrompt = !interactive && prompt.trim() == "";
    // Block launch into a confirmed non-git folder — the worktree add would fail. The
    // inline "Not a git repository" warning below explains it; repoIsGit is optimistic
    // (true until the async check confirms otherwise) so this never blocks prematurely.
    const canLaunch = !posting && repoPath.trim() != "" && runtimeId != "" && !needsPrompt && repoIsGit;
    const disabledReason = launchDisabledReason(repoPath, runtimeId, needsPrompt, setup.probed, readyAgents.length);
    const parallelAgents = readyAgents.filter((a) => a.runtimeId != runtimeId);
    const allParallelSelected =
        parallelAgents.length > 0 && parallelAgents.every((a) => alsoRun.includes(a.runtimeId));
    const parallelCount = alsoRun.filter((id) => id != runtimeId && id != "").length;
    const isGitError = /git|worktree|repositor/i.test(launchResult?.error ?? "");
    const quickStartRepo = recentRepos.find((r) => r.trim() != "") ?? "";

    // Auth read for the currently-selected agent: `/runtimes` proves it's installed
    // but never that it's logged in, so the picker offers an "authenticate" path
    // whenever login is unverified. Never hard-blocks launch — an unverified login
    // still launches (labelled honestly), so a keychain-authed agent isn't gated.
    const selectedAgent = setup.agents.find((a) => a.runtimeId == runtimeId);
    const selectedAuthPres =
        selectedAgent != null && selectedAgent.available
            ? agentAuthPresentation(true, agentAuth[selectedAgent.runtimeId] ?? "unknown")
            : null;

    const toggleAlso = (id: string, on: boolean) =>
        setAlsoRun(on ? [...alsoRun, id] : alsoRun.filter((x) => x != id));

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
                title: notifyOnAttention
                    ? "Turn off attention notifications"
                    : "Turn on attention notifications",
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
    }, [workspaces, groups, identity, model, setup.tmuxBin, notifyOnAttention, setLaunchOpen, setShortcutsOpen, setCloneOpen]);

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2" onKeyDown={onBoardKeyDown}>
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Recoder - Workspaces</span>
                <RecoderConnectionBadge />
                <div className="flex-1" />
                <RecoderIdentityAffordance />
                <button className={PRIMARY_BTN} onClick={() => setLaunchOpen(!launchOpen)}>
                    {launchOpen ? (
                        "Close"
                    ) : (
                        <>
                            New agent
                            <span className="ml-1.5 text-xs text-meta font-mono">N</span>
                        </>
                    )}
                </button>
            </div>

            <RecoderWhatsNew />

            <RecoderErrorRow message={coldStart ? "" : error} />
            {loading && workspaces.length == 0 && error == "" && <RecoderSkeleton rows={3} />}

            {launchOpen && (
                <div
                    className="flex flex-col gap-3 rounded border border-white/8 p-3 mt-1 recoder-enter"
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

                    <label className="flex flex-col gap-1">
                        <span className={FIELD_LABEL}>Agent</span>
                        <select
                            className={`${INPUT} cursor-pointer`}
                            value={runtimeId}
                            onChange={(e) => setRuntimeId(e.target.value)}
                        >
                            {readyAgents.length == 0 && (
                                <option value="">{setup.probed ? "No agents found on PATH" : "Detecting agents…"}</option>
                            )}
                            {setup.agents.map((a) => (
                                <option key={a.runtimeId} value={a.runtimeId} disabled={!a.available}>
                                    {agentLabel(a.runtimeId)}
                                    {agentAuthOptionSuffix(a.available, agentAuth[a.runtimeId] ?? "unknown")}
                                </option>
                            ))}
                        </select>
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
                    </label>

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
                        {recentRepos.filter((r) => r != repoPath).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {recentRepos
                                    .filter((r) => r != repoPath)
                                    .map((r) => (
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
                        <span className={FIELD_LABEL}>First message{interactive ? " (optional)" : " (required)"}</span>
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

                    {parallelAgents.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <span className={FIELD_LABEL}>Also run in parallel (optional)</span>
                                <button
                                    className={QUIET_BTN}
                                    onClick={() =>
                                        setAlsoRun(
                                            allParallelSelected ? [] : parallelAgents.map((a) => a.runtimeId)
                                        )
                                    }
                                >
                                    {allParallelSelected ? "Clear" : "Select all"}
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {parallelAgents.map((a) => (
                                    <label
                                        key={a.runtimeId}
                                        className="flex items-center gap-1.5 text-sm cursor-pointer"
                                        title={`Also run this task with ${agentLabel(a.runtimeId)} in its own worktree`}
                                    >
                                        <input
                                            type="checkbox"
                                            className="cursor-pointer"
                                            checked={alsoRun.includes(a.runtimeId)}
                                            onChange={(e) => toggleAlso(a.runtimeId, e.target.checked)}
                                        />
                                        <span>{agentLabel(a.runtimeId)}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {alsoRun.filter((id) => id != runtimeId).length == 0 && (
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
                        </button>
                        {parallelCount > 0 && (
                            <span className="text-xs text-secondary">
                                Launches {1 + parallelCount} agents, each in its own worktree.
                            </span>
                        )}
                        {posting && launchProgress != "" && <span className={META}>{launchProgress}</span>}
                        <span className={`${META} ml-auto`}>
                            <span className="font-mono">⌘/Ctrl+Enter</span> to launch
                        </span>
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
                        <div className={SECTION_TITLE}>Welcome to Recoder</div>
                        <div className={META}>
                            Run your coding agents in parallel isolated worktrees, then review and merge.
                        </div>
                        <EnvironmentImportSummary env={environment} />
                    </div>
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
                        Press <span className="font-mono">⌘P</span> for commands ·{" "}
                        <span className="font-mono">N</span> for a new agent
                    </div>
                    {setup.loaded ? (
                        <div className={`${META} flex flex-wrap items-center gap-x-3 gap-y-1`}>
                            <span className={setup.git ? "" : "opacity-60"}>{setup.git ? "✓" : "✗"} git</span>
                            {setup.agents.map((a) => {
                                const pres = agentAuthPresentation(a.available, agentAuth[a.runtimeId] ?? "unknown");
                                const mark = !a.available ? "✗" : pres.badge == "ready" ? "✓" : "•";
                                const note =
                                    pres.badge == "ready" || pres.badge == "not installed" ? "" : ` (${pres.badge})`;
                                return (
                                    <span key={a.runtimeId} className={a.available ? "" : "opacity-60"}>
                                        {mark} {agentLabel(a.runtimeId)}
                                        {note}
                                    </span>
                                );
                            })}
                        </div>
                    ) : setup.probed ? (
                        <div className={META}>
                            Couldn’t reach Recoder yet - it may still be starting.
                        </div>
                    ) : (
                        <div className={META}>Checking local setup...</div>
                    )}
                    {setup.loaded && readyAgents.length == 0 && (
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
                            onChange={(e) => setBoardShow(e.target.value as RecoderBoardShow)}
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
                    <button className={QUIET_BTN} onClick={() => setCloneOpen(true)}>
                        Clone repo
                    </button>
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
            <div className="flex flex-col gap-2">
                {buckets.map((bucket) => (
                    <div key={bucket.id} className="flex flex-col gap-1">
                        <div className={FIELD_LABEL}>
                            {bucket.label} · {bucket.groups.reduce((n, g) => n + g.workspaces.length, 0)}
                        </div>
                        {bucket.groups.map((group) => {
                            if (group.workspaces.length <= 1) {
                                const ws = group.workspaces[0];
                                return (
                                    <WorkspaceRow
                                        key={ws.workspaceId}
                                        model={model}
                                        ws={ws}
                                        summary={diffSummaries[ws.workspaceId]}
                                        status={rowStatus[ws.workspaceId]}
                                        busy={busyRow == ws.workspaceId}
                                        tmuxBin={setup.tmuxBin}
                                        selected={selectedId == ws.workspaceId}
                                        onSelect={() => setSelectedId(ws.workspaceId)}
                                    />
                                );
                            }
                            const taskGroup = group.taskGroup ?? "";
                            const compareView = compare[taskGroup];
                            const isCompareOpen = compareOpen == taskGroup;
                            return (
                                <div key={taskGroup} className="flex flex-col gap-1 rounded border border-white/8 p-2">
                                    <div className="flex items-center gap-2">
                                        <span className={ROW_TITLE}>{group.workspaces.length} agents</span>
                                        <span className={`${META} font-mono`} title={taskGroup}>
                                            {shortTaskGroup(taskGroup)}
                                        </span>
                                        <div className="flex-1" />
                                        {/* explicit click, not an auto-open — parallel launches never AUTO-open */}
                                        <button
                                            className={QUIET_BTN}
                                            onClick={() => group.workspaces.forEach((ws) => openSession(ws.workspaceId))}
                                            title={`Open a session for each of the ${group.workspaces.length} agents`}
                                        >
                                            Open all
                                        </button>
                                        <button
                                            className={QUIET_BTN}
                                            onClick={() => model.toggleCompare(taskGroup, group.workspaces)}
                                        >
                                            {isCompareOpen ? "Hide compare" : "Compare"}
                                        </button>
                                    </div>
                                    {isCompareOpen && (
                                        <div className="recoder-enter">
                                            {compareView != null ? (
                                                <RecoderComparePanel
                                                    model={model}
                                                    compareView={compareView}
                                                    onReview={openReview}
                                                />
                                            ) : (
                                                <div className="rounded border border-white/8 p-2">
                                                    <RecoderSkeleton rows={2} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {group.workspaces.map((ws) => (
                                        <WorkspaceRow
                                            key={ws.workspaceId}
                                            model={model}
                                            ws={ws}
                                            summary={diffSummaries[ws.workspaceId]}
                                            status={rowStatus[ws.workspaceId]}
                                            busy={busyRow == ws.workspaceId}
                                            tmuxBin={setup.tmuxBin}
                                            selected={selectedId == ws.workspaceId}
                                            onSelect={() => setSelectedId(ws.workspaceId)}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

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

export { RecoderConductorView };
