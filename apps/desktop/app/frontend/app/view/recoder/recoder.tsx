// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock } from "@/app/store/global";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { RecoderViewModel } from "./recoder-model";

const AGENT_LABELS: Record<string, string> = {
    "claude-code": "Claude Code",
    codex: "Codex",
    opencode: "opencode",
    pi: "pi",
    "recoder-code": "Recoder Code",
    cursor: "Cursor",
};

function agentLabel(runtimeId: string): string {
    return AGENT_LABELS[runtimeId] ?? runtimeId;
}

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

function openLaunch() {
    openBlock({ meta: { view: "recoder-launch" } });
}

// Archive a finished workspace: POST to the conductor, then refresh so the row
// drops out of the list. Degrade-safe: a non-2xx response or a thrown fetch is
// swallowed and the list is left untouched — archiving must never crash the hub.
async function archiveWorkspace(model: RecoderViewModel, workspaceId: string) {
    try {
        const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces/${workspaceId}/archive`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        if (!res.ok) {
            return;
        }
        model.refresh();
    } catch {
        // degrade-safe: a failed archive leaves the list as-is
    }
}

function RecoderConductorView({ model }: ViewComponentProps<RecoderViewModel>) {
    const workspaces = useAtomValue(model.workspacesAtom);
    const loading = useAtomValue(model.loadingAtom);
    const error = useAtomValue(model.errorAtom);
    const setup = useAtomValue(model.setupAtom);

    useEffect(() => {
        model.refresh();
    }, [model]);

    const showGettingStarted = !loading && workspaces.length == 0 && error == "";
    const readyAgents = setup.agents.filter((a) => a.available);

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Recoder — Workspaces</span>
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => model.refresh()}
                >
                    Refresh
                </button>
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => openLaunch()}
                >
                    New agent
                </button>
            </div>
            {error != "" && <div className="text-error text-sm">{error}</div>}
            {loading && workspaces.length == 0 && <div className="text-secondary text-sm">Loading…</div>}
            {showGettingStarted && (
                <div className="flex flex-col gap-3 rounded border border-border p-4 mt-1">
                    <div>
                        <div className="text-base font-semibold">Welcome to Recoder</div>
                        <div className="text-sm text-secondary">
                            Run your coding agents in parallel isolated worktrees, then review and merge.
                        </div>
                    </div>
                    {setup.loaded ? (
                        <div className="flex flex-col gap-1">
                            <div className="text-xs uppercase tracking-wide text-secondary">Ready on this machine</div>
                            <div className="flex items-center gap-2 text-sm">
                                <span>{setup.git ? "✓" : "—"}</span>
                                <span className={setup.git ? "" : "text-secondary"}>git</span>
                            </div>
                            {setup.agents.length == 0 && (
                                <div className="text-sm text-secondary">
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
                    ) : (
                        <div className="text-sm text-secondary">
                            No workspaces yet. Start the Recoder backend to see agent readiness and launch a workspace.
                        </div>
                    )}
                    {setup.loaded && readyAgents.length > 0 && (
                        <div className="text-sm text-secondary">
                            You're set up —{" "}
                            <button
                                className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer"
                                onClick={() => openLaunch()}
                            >
                                create a workspace
                            </button>{" "}
                            to run {agentLabel(readyAgents[0].runtimeId)} on a task.
                        </div>
                    )}
                </div>
            )}
            <div className="flex flex-col gap-1">
                {workspaces.map((ws) => (
                    <div
                        key={ws.workspaceId}
                        className="flex items-center gap-2 rounded border border-border px-2 py-1"
                        title={`${ws.workspaceId} · ${ws.branch}`}
                    >
                        <span className="text-sm truncate">{ws.branch}</span>
                        <span className="text-xs text-secondary">{ws.state}</span>
                        <span className="text-xs text-secondary ml-auto">{ws.runtimeId}</span>
                        <button
                            className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer"
                            onClick={() => openSession(ws.workspaceId)}
                        >
                            Session
                        </button>
                        <button
                            className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer"
                            onClick={() => openReview()}
                        >
                            Review
                        </button>
                        <button
                            className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer"
                            onClick={() => archiveWorkspace(model, ws.workspaceId)}
                        >
                            Archive
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

RecoderConductorView.displayName = "RecoderConductorView";

export { RecoderConductorView };
