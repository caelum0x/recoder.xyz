// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderDiffViewModel } from "./recoder-diff-model";

// Classify a single unified-diff line for coloring. File headers ("+++"/"---"
// / "diff "/"index ") are checked before the generic +/- so they render neutral.
function diffLineClass(line: string): string {
    if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---")) {
        return "text-secondary";
    }
    if (line.startsWith("@@")) {
        return "text-accent";
    }
    if (line.startsWith("+")) {
        return "text-success";
    }
    if (line.startsWith("-")) {
        return "text-error";
    }
    return "text-primary/80";
}

function DiffBody({ patch }: { patch: string }) {
    const lines = patch.split("\n");
    return (
        <pre className="text-xs leading-5 font-mono whitespace-pre overflow-auto rounded border border-border p-2 bg-panel">
            {lines.map((line, i) => (
                <div key={i} className={cn(diffLineClass(line), "min-h-[1.25rem]")}>
                    {line == "" ? " " : line}
                </div>
            ))}
        </pre>
    );
}

function RecoderDiffView({ model }: ViewComponentProps<RecoderDiffViewModel>) {
    const workspaces = useAtomValue(model.workspacesAtom);
    const selectedId = useAtomValue(model.selectedIdAtom);
    const diff = useAtomValue(model.diffAtom);
    const connected = useAtomValue(model.connectedAtom);
    const loading = useAtomValue(model.loadingAtom);
    const diffLoading = useAtomValue(model.diffLoadingAtom);
    const diffStatus = useAtomValue(model.diffStatusAtom);
    const merging = useAtomValue(model.mergingAtom);
    const mergeStatus = useAtomValue(model.mergeStatusAtom);
    const prCreating = useAtomValue(model.prCreatingAtom);
    const prStatus = useAtomValue(model.prStatusAtom);

    useEffect(() => {
        model.refresh();
    }, [model]);

    const showNotConnected = !loading && !connected;
    const showNoWorkspaces = !loading && connected && workspaces.length == 0;
    const hasPatch = diff != null && diff.patch != null && diff.patch.trim() != "";

    return (
        <div className="flex flex-col h-full overflow-hidden p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Recoder — Review</span>
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => model.refresh()}
                >
                    Refresh
                </button>
                {workspaces.length > 0 && (
                    <select
                        className="ml-auto bg-panel text-primary border border-border rounded px-2 py-0.5 text-sm cursor-pointer"
                        value={selectedId}
                        onChange={(e) => model.selectWorkspace(e.target.value)}
                    >
                        {workspaces.map((ws) => (
                            <option key={ws.workspaceId} value={ws.workspaceId}>
                                {ws.branch} · {ws.state}
                            </option>
                        ))}
                    </select>
                )}
                {selectedId != "" && (
                    <button
                        className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
                        disabled={merging}
                        onClick={() => model.mergeSelected()}
                    >
                        {merging ? "Merging…" : "Merge"}
                    </button>
                )}
                {selectedId != "" && (
                    <button
                        className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
                        disabled={prCreating}
                        onClick={() => model.createPr()}
                    >
                        {prCreating ? "Creating PR…" : "Create PR"}
                    </button>
                )}
            </div>
            {mergeStatus != "" && <div className="text-xs text-secondary">{mergeStatus}</div>}
            {prStatus != "" && <div className="text-xs text-secondary">{prStatus}</div>}

            {showNotConnected && (
                <div className="text-secondary text-sm">Not connected — start the Recoder backend to review workspace diffs.</div>
            )}
            {showNoWorkspaces && (
                <div className="text-secondary text-sm">No workspaces yet — nothing to review.</div>
            )}
            {loading && workspaces.length == 0 && <div className="text-secondary text-sm">Loading…</div>}

            {selectedId != "" && (
                <div className="flex flex-col gap-2 overflow-hidden">
                    {diff != null && (
                        <div className="flex items-center gap-2 text-xs text-secondary">
                            <span>base {diff.baseRef}</span>
                            <span>·</span>
                            <span>{diff.changedFiles} changed</span>
                            {diff.untracked.length > 0 && (
                                <>
                                    <span>·</span>
                                    <span>{diff.untracked.length} untracked</span>
                                </>
                            )}
                        </div>
                    )}
                    {diffLoading && <div className="text-secondary text-sm">Loading diff…</div>}
                    {!diffLoading && !hasPatch && (
                        <div className="text-secondary text-sm">{diffStatus != "" ? diffStatus : "No diff — the worktree matches its base."}</div>
                    )}
                    {!diffLoading && hasPatch && <DiffBody patch={diff.patch} />}
                    {!diffLoading && diff != null && diff.untracked.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                            <div className="text-xs uppercase tracking-wide text-secondary">Untracked</div>
                            {diff.untracked.map((f) => (
                                <div key={f} className="text-xs font-mono text-success">
                                    + {f}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

RecoderDiffView.displayName = "RecoderDiffView";

export { RecoderDiffView };
