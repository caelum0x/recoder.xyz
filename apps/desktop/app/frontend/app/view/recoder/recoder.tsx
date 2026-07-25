// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock, getApi } from "@/app/store/global";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { agentLabel } from "./recoder-agent-labels";
import { RecoderComparePanel } from "./recoder-compare";
import { RecoderIdentityAffordance } from "./recoder-identity";
import {
    RecoderViewModel,
    type RecoderDiffSummary,
    type RecoderWorkspace,
} from "./recoder-model";
import { openWorkspaceTerminal } from "./recoder-open-terminal";
import { RecoderErrorRow, RecoderSkeleton } from "./recoder-states";
import {
    CHIP,
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

function openReview() {
    openBlock({ meta: { view: "recoder-diff" } });
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
function launchDisabledReason(repoPath: string, runtimeId: string, needsPrompt: boolean): string {
    if (repoPath.trim() == "") {
        return "Choose a folder to launch.";
    }
    if (runtimeId == "") {
        return "Choose an agent to launch.";
    }
    if (needsPrompt) {
        return "Add a first message, or turn on interactive session.";
    }
    return "";
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
    useEffect(() => {
        if (!selected) {
            return;
        }
        ref.current?.scrollIntoView({ block: "nearest" });
    }, [selected]);
    return (
        <div
            ref={ref}
            tabIndex={0}
            data-selected={selected}
            onClick={onSelect}
            onFocus={onSelect}
            className={`flex flex-col gap-1 rounded border border-white/8 px-3 py-2 recoder-transition hover:bg-white/[0.04] hover:border-white/12 cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-white/50 ${selected ? "bg-accent" : ""}`}
            title={`${ws.workspaceId} - ${ws.branch}`}
        >
            <div className="flex items-center gap-2">
                <span className={`${ROW_TITLE} truncate font-mono`}>{ws.branch}</span>
                <span className={META}>{ws.state}</span>
                {summary != null && summary.files > 0 && (
                    <span className={`${META} font-mono`}>
                        +{summary.additions} -{summary.deletions}
                    </span>
                )}
                <span className={`${META} ml-auto`}>{agentLabel(ws.runtimeId)}</span>
                <button className={QUIET_BTN} onClick={() => openSession(ws.workspaceId)}>
                    Session
                </button>
                {ws.sessionName && (
                    <button className={QUIET_BTN} onClick={() => openTerminal(ws, tmuxBin)}>
                        Terminal
                    </button>
                )}
                <button className={QUIET_BTN} onClick={() => openReview()}>
                    Review
                </button>
                <button className={QUIET_BTN} disabled={busy} onClick={() => model.mergeWorkspace(ws.workspaceId)}>
                    {busy ? "..." : "Merge"}
                </button>
                <button className={QUIET_BTN} disabled={busy} onClick={() => model.archiveWorkspace(ws.workspaceId)}>
                    Archive
                </button>
            </div>
            {status && <div className={META}>{status}</div>}
        </div>
    );
}

WorkspaceRow.displayName = "WorkspaceRow";

function RecoderConductorView({ model }: ViewComponentProps<RecoderViewModel>) {
    const workspaces = useAtomValue(model.workspacesAtom);
    const groups = useAtomValue(model.groupsAtom);
    const compare = useAtomValue(model.compareAtom);
    const compareOpen = useAtomValue(model.compareOpenAtom);
    const loading = useAtomValue(model.loadingAtom);
    const error = useAtomValue(model.errorAtom);
    const setup = useAtomValue(model.setupAtom);
    const diffSummaries = useAtomValue(model.diffSummariesAtom);
    const rowStatus = useAtomValue(model.rowStatusAtom);
    const busyRow = useAtomValue(model.busyRowAtom);
    const [launchOpen, setLaunchOpen] = useAtom(model.launchOpenAtom);
    const [selectedId, setSelectedId] = useAtom(model.selectedWorkspaceIdAtom);
    const [repoPath, setRepoPath] = useAtom(model.launchRepoPathAtom);
    const recentRepos = useAtomValue(model.recentReposAtom);
    const [prompt, setPrompt] = useAtom(model.launchPromptAtom);
    const [runtimeId, setRuntimeId] = useAtom(model.launchRuntimeIdAtom);
    const [alsoRun, setAlsoRun] = useAtom(model.launchAlsoRunAtom);
    const [branch, setBranch] = useAtom(model.launchBranchAtom);
    const [interactive, setInteractive] = useAtom(model.launchInteractiveAtom);
    const posting = useAtomValue(model.postingAtom);
    const launchProgress = useAtomValue(model.launchProgressAtom);
    const launchResult = useAtomValue(model.launchResultAtom);

    useEffect(() => {
        model.refresh();
        // Auto-poll (replaces the removed manual Refresh button).
        const id = setInterval(() => model.refresh(), 6000);
        return () => clearInterval(id);
    }, [model]);

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

    // Flat, render-order list of the visible board rows (singleton + parallel-group
    // rows, top-to-bottom) so keyboard nav walks the board exactly as it reads.
    const orderedIds = groups.flatMap((g) => g.workspaces.map((w) => w.workspaceId));

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
            openSession(selectedId);
            e.preventDefault();
            return;
        }
    };

    const showGettingStarted = !loading && workspaces.length == 0 && error == "" && !launchOpen;
    const needsPrompt = !interactive && prompt.trim() == "";
    const canLaunch = !posting && repoPath.trim() != "" && runtimeId != "" && !needsPrompt;
    const parallelAgents = readyAgents.filter((a) => a.runtimeId != runtimeId);
    const allParallelSelected =
        parallelAgents.length > 0 && parallelAgents.every((a) => alsoRun.includes(a.runtimeId));
    const parallelCount = alsoRun.filter((id) => id != runtimeId && id != "").length;

    const toggleAlso = (id: string, on: boolean) =>
        setAlsoRun(on ? [...alsoRun, id] : alsoRun.filter((x) => x != id));

    const browseFolder = async () => {
        const picked = await getApi().selectDirectory();
        if (picked == null || picked == "") {
            return;
        }
        setRepoPath(picked);
    };

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2" onKeyDown={onBoardKeyDown}>
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Recoder - Workspaces</span>
                <div className="flex-1" />
                <RecoderIdentityAffordance />
                <button className={PRIMARY_BTN} onClick={() => setLaunchOpen(!launchOpen)}>
                    {launchOpen ? "Close" : "New agent"}
                </button>
            </div>

            <RecoderErrorRow message={error} />
            {loading && workspaces.length == 0 && error == "" && <RecoderSkeleton rows={3} />}

            {launchOpen && (
                <div className="flex flex-col gap-3 rounded border border-white/8 p-3 mt-1 recoder-enter">
                    <div className={SECTION_TITLE}>Launch a coding agent</div>

                    <label className="flex flex-col gap-1">
                        <span className={FIELD_LABEL}>Agent</span>
                        <select
                            className={`${INPUT} cursor-pointer`}
                            value={runtimeId}
                            onChange={(e) => setRuntimeId(e.target.value)}
                        >
                            {readyAgents.length == 0 && <option value="">No agents available</option>}
                            {setup.agents.map((a) => (
                                <option key={a.runtimeId} value={a.runtimeId} disabled={!a.available}>
                                    {agentLabel(a.runtimeId)}
                                    {a.available ? "" : " (not installed)"}
                                </option>
                            ))}
                        </select>
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
                                            onClick={() => setRepoPath(r)}
                                        >
                                            {folderName(r)}
                                        </button>
                                    ))}
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
                            onKeyDown={(e) => {
                                if (!((e.metaKey || e.ctrlKey) && e.key == "Enter" && canLaunch)) {
                                    return;
                                }
                                e.preventDefault();
                                model.launch();
                            }}
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
                        {canLaunch && <span className={`${META} ml-auto`}>Cmd+Enter to launch</span>}
                    </div>

                    {!canLaunch && launchDisabledReason(repoPath, runtimeId, needsPrompt) != "" && (
                        <div className={META}>{launchDisabledReason(repoPath, runtimeId, needsPrompt)}</div>
                    )}

                    {launchResult != null && !launchResult.ok && (
                        <div className={ERROR_ROW}>{launchResult.error || "Launch failed"}</div>
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
                            <button className={QUIET_BTN} onClick={() => openReview()}>
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
                    </div>
                    {setup.loaded ? (
                        <div className="flex flex-col gap-1">
                            <div className={FIELD_LABEL}>Ready on this machine</div>
                            <div className="flex items-center gap-2 text-sm">
                                <span>{setup.git ? "✓" : "✗"}</span>
                                <span className={setup.git ? "" : "text-secondary"}>git</span>
                            </div>
                            {setup.agents.length == 0 && (
                                <div className={META}>
                                    No coding agents detected on PATH - install Claude Code (or Codex / opencode) to
                                    launch a workspace.
                                </div>
                            )}
                            {setup.agents.map((a) => (
                                <div key={a.runtimeId} className="flex items-center gap-2 text-sm">
                                    <span>{a.available ? "✓" : "✗"}</span>
                                    <span className={a.available ? "" : "text-secondary"}>{agentLabel(a.runtimeId)}</span>
                                </div>
                            ))}
                        </div>
                    ) : setup.probed ? (
                        <div className={META}>
                            Couldn’t reach Recoder yet - it may still be starting.
                        </div>
                    ) : (
                        <div className={META}>Checking local setup...</div>
                    )}
                    {setup.loaded && readyAgents.length > 0 && (
                        <div className={META}>
                            You're set up -{" "}
                            <button className={PRIMARY_BTN} onClick={() => setLaunchOpen(true)}>
                                create a workspace
                            </button>{" "}
                            to run {agentLabel(readyAgents[0].runtimeId)} on a task.
                        </div>
                    )}
                </div>
            )}

            <div className="flex flex-col gap-1">
                {groups.map((group) => {
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
                                        <RecoderComparePanel model={model} compareView={compareView} />
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
        </div>
    );
}

RecoderConductorView.displayName = "RecoderConductorView";

export { RecoderConductorView };
