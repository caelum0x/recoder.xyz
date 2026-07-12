// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect } from "react";
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
                            You're set up — create a workspace to run {agentLabel(readyAgents[0].runtimeId)} on a task.
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
                    </div>
                ))}
            </div>
        </div>
    );
}

RecoderConductorView.displayName = "RecoderConductorView";

export { RecoderConductorView };
