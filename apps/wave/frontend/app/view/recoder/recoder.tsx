// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderViewModel } from "./recoder-model";

function RecoderConductorView({ model }: ViewComponentProps<RecoderViewModel>) {
    const workspaces = useAtomValue(model.workspacesAtom);
    const loading = useAtomValue(model.loadingAtom);
    const error = useAtomValue(model.errorAtom);

    useEffect(() => {
        model.refresh();
    }, [model]);

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
            {!loading && workspaces.length == 0 && error == "" && (
                <div className="text-secondary text-sm">No workspaces yet — create one in the Recoder app.</div>
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
