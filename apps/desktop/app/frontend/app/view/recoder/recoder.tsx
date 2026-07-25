// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock, getApi } from "@/app/store/global";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { agentLabel } from "./recoder-agent-labels";
import { RecoderComparePanel } from "./recoder-compare";
import { RecoderIdentityAffordance } from "./recoder-identity";
import {
    RecoderViewModel,
    type RecoderDiffSummary,
    type RecoderWorkspace,
} from "./recoder-model";
import { openWorkspaceTerminal } from "./recoder-open-terminal";
import {
    FIELD_LABEL,
    INPUT,
    META,
    PAGE_TITLE,
    PRIMARY_BTN,
    QUIET_BTN,
    QUIET_BTN_XS,
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
};

function WorkspaceRow({ model, ws, summary, status, busy, tmuxBin }: WorkspaceRowProps) {
    return (
        <div
            className="flex flex-col gap-1 rounded border border-border px-2.5 py-1.5 transition-colors duration-150 ease-out"
            title={`${ws.workspaceId} · ${ws.branch}`}
        >
            <div className="flex items-center gap-2">
                <span className={`${ROW_TITLE} truncate`}>{ws.branch}</span>
                <span className={META}>{ws.state}</span>
                {summary != null && summary.files > 0 && (
                    <span className={META}>
                        +{summary.additions} −{summary.deletions}
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
                    {busy ? "…" : "Merge"}
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
    const [repoPath, setRepoPath] = useAtom(model.launchRepoPathAtom);
    const recentRepos = useAtomValue(model.recentReposAtom);
    const [prompt, setPrompt] = useAtom(model.launchPromptAtom);
    const [runtimeId, setRuntimeId] = useAtom(model.launchRuntimeIdAtom);
    const [alsoRun, setAlsoRun] = useAtom(model.launchAlsoRunAtom);
    const [branch, setBranch] = useAtom(model.launchBranchAtom);
    const [interactive, setInteractive] = useAtom(model.launchInteractiveAtom);
    const posting = useAtomValue(model.postingAtom);
    const launchResult = useAtomValue(model.launchResultAtom);

    useEffect(() => {
        model.refresh();
        // Auto-poll (replaces the removed manual Refresh button).
        const id = setInterval(() => model.refresh(), 6000);
        return () => clearInterval(id);
    }, [model]);

    const readyAgents = setup.agents.filter((a) => a.available);

    // Zero-config: preselect the first installed agent so the launch panel opens
    // ready to submit. Only fills an untouched field — a deliberate choice stays.
    useEffect(() => {
        if (runtimeId == "" && readyAgents.length > 0) {
            setRuntimeId(readyAgents[0].runtimeId);
        }
    }, [readyAgents.length]);

    const showGettingStarted = !loading && workspaces.length == 0 && error == "" && !launchOpen;
    const canLaunch = !posting && repoPath.trim() != "" && runtimeId != "";
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
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Recoder — Workspaces</span>
                <div className="flex-1" />
                <RecoderIdentityAffordance />
                <button className={PRIMARY_BTN} onClick={() => setLaunchOpen(!launchOpen)}>
                    {launchOpen ? "Close" : "New agent"}
                </button>
            </div>

            {error != "" && <div className="text-error text-sm">{error}</div>}
            {loading && workspaces.length == 0 && <div className="text-secondary text-sm">Loading…</div>}

            {launchOpen && (
                <div className="flex flex-col gap-3 rounded border border-border p-3 mt-1">
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
                        <div className="flex items-center gap-2">
                            <input
                                className={`${INPUT} flex-1`}
                                placeholder="/path/to/your/repo"
                                value={repoPath}
                                onChange={(e) => setRepoPath(e.target.value)}
                            />
                            <button className={QUIET_BTN} onClick={browseFolder}>
                                Browse…
                            </button>
                        </div>
                        {recentRepos.filter((r) => r != repoPath).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {recentRepos
                                    .filter((r) => r != repoPath)
                                    .map((r) => (
                                        <button
                                            key={r}
                                            className={`${QUIET_BTN_XS} truncate max-w-[16rem]`}
                                            title={r}
                                            onClick={() => setRepoPath(r)}
                                        >
                                            {r}
                                        </button>
                                    ))}
                            </div>
                        )}
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className={FIELD_LABEL}>First message (optional)</span>
                        <textarea
                            className={`${INPUT} min-h-16 resize-y`}
                            placeholder="Optionally start the agent with a message — or leave empty and chat once it's running…"
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
                        <span>Interactive session — run the real agent TUI</span>
                    </label>

                    <div className="flex items-center gap-2">
                        <button className={PRIMARY_BTN} disabled={!canLaunch} onClick={() => model.launch()}>
                            {posting ? "Launching…" : "Launch"}
                        </button>
                        {parallelCount > 0 && (
                            <span className="text-xs text-secondary">
                                Launches {1 + parallelCount} agents, each in its own worktree.
                            </span>
                        )}
                    </div>

                    {launchResult != null && !launchResult.ok && (
                        <div className="text-error text-sm">{launchResult.error || "Launch failed"}</div>
                    )}
                </div>
            )}

            {launchResult != null && launchResult.ok && !launchOpen && (
                <div className="text-secondary text-sm">{launchResult.message}</div>
            )}

            {showGettingStarted && (
                <div className="flex flex-col gap-3 rounded border border-border p-4 mt-1">
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
                                <span>{setup.git ? "✓" : "—"}</span>
                                <span className={setup.git ? "" : "text-secondary"}>git</span>
                            </div>
                            {setup.agents.length == 0 && (
                                <div className={META}>
                                    No coding agents detected on PATH — install Claude Code (or Codex / opencode) to
                                    launch a workspace.
                                </div>
                            )}
                            {setup.agents.map((a) => (
                                <div key={a.runtimeId} className="flex items-center gap-2 text-sm">
                                    <span>{a.available ? "✓" : "—"}</span>
                                    <span className={a.available ? "" : "text-secondary"}>{agentLabel(a.runtimeId)}</span>
                                </div>
                            ))}
                        </div>
                    ) : setup.probed ? (
                        <div className={META}>
                            Couldn't reach the local Recoder backend yet — it may still be starting.
                        </div>
                    ) : (
                        <div className={META}>Checking local setup…</div>
                    )}
                    {setup.loaded && readyAgents.length > 0 && (
                        <div className={META}>
                            You're set up —{" "}
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
                            />
                        );
                    }
                    const taskGroup = group.taskGroup ?? "";
                    const compareView = compare[taskGroup];
                    const isCompareOpen = compareOpen == taskGroup;
                    return (
                        <div key={taskGroup} className="flex flex-col gap-1 rounded border border-border p-2">
                            <div className="flex items-center gap-2">
                                <span className={ROW_TITLE}>{group.workspaces.length} agents</span>
                                <span className={META} title={taskGroup}>
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
                            {isCompareOpen && compareView != null && (
                                <RecoderComparePanel model={model} compareView={compareView} />
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
