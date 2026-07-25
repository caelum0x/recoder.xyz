// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock, getApi } from "@/app/store/global";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { agentLabel } from "../recoder/recoder-agent-labels";
import { RecoderLaunchViewModel } from "./recoder-launch-model";

const REFRESH_MS = 6000;

const PRIMARY_BTN =
    "bg-accent/80 text-primary rounded px-2 py-1 text-sm hover:bg-accent transition-colors cursor-pointer self-start disabled:opacity-50";
const QUIET_BTN =
    "border border-border text-secondary rounded px-2 py-0.5 text-sm hover:bg-border/40 transition-colors cursor-pointer";

// The picker is the only entry path, so paths are always absolute; show just the
// leaf folder name and keep the full path on hover/title.
function folderName(repoPath: string): string {
    return repoPath.split(/[\\/]/).filter(Boolean).pop() ?? repoPath;
}

function RecoderLaunchView({ model }: ViewComponentProps<RecoderLaunchViewModel>) {
    const runtimes = useAtomValue(model.runtimesAtom);
    const loading = useAtomValue(model.loadingAtom);
    const error = useAtomValue(model.errorAtom);
    const posting = useAtomValue(model.postingAtom);
    const result = useAtomValue(model.resultAtom);
    const [repoPath, setRepoPath] = useAtom(model.repoPathAtom);
    const [runtimeId, setRuntimeId] = useAtom(model.runtimeIdAtom);
    const [prompt, setPrompt] = useAtom(model.promptAtom);
    const [branch, setBranch] = useAtom(model.branchAtom);
    const [interactive, setInteractive] = useAtom(model.interactiveAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const readyRuntimes = runtimes.filter((r) => r.available);
    const notConnected = !loading && runtimes.length == 0;
    const canLaunch = !posting && repoPath.trim() != "" && runtimeId != "";

    const browseFolder = async () => {
        const picked = await getApi().selectDirectory();
        if (picked == null || picked == "") {
            return;
        }
        setRepoPath(picked);
    };

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-3">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Launch a coding agent</span>
            </div>

            {notConnected && (
                <div className="rounded border border-border p-4 text-sm text-secondary">
                    Start the Recoder backend to launch an agent.
                    {error != "" && <div className="text-error mt-1">{error}</div>}
                </div>
            )}

            {!notConnected && (
                <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-secondary">Coding agent</span>
                        <select
                            className="rounded border border-border bg-transparent px-2 py-1 text-sm cursor-pointer"
                            value={runtimeId}
                            onChange={(e) => setRuntimeId(e.target.value)}
                        >
                            {readyRuntimes.length == 0 && <option value="">No agents available</option>}
                            {runtimes.map((r) => (
                                <option key={r.runtimeId} value={r.runtimeId} disabled={!r.available}>
                                    {agentLabel(r.runtimeId)}
                                    {r.available ? "" : " (not installed)"}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-secondary">Folder</span>
                        {repoPath.trim() == "" ? (
                            <button className={`${PRIMARY_BTN} w-full`} onClick={browseFolder}>
                                Choose folder…
                            </button>
                        ) : (
                            <div className="flex items-center gap-2" title={repoPath}>
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-sm text-primary">{folderName(repoPath)}</span>
                                    <span className="truncate text-xs text-secondary">{repoPath}</span>
                                </div>
                                <button className={QUIET_BTN} onClick={browseFolder}>
                                    Change
                                </button>
                            </div>
                        )}
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-secondary">Task</span>
                        <textarea
                            className="rounded border border-border bg-transparent px-2 py-1 text-sm min-h-20 resize-y"
                            placeholder="What should the agent do? (leave empty to start and chat once running)"
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

                    <label className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-secondary">Branch (optional)</span>
                        <input
                            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
                            placeholder="auto-named if empty"
                            value={branch}
                            onChange={(e) => setBranch(e.target.value)}
                        />
                    </label>

                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            className="cursor-pointer"
                            checked={interactive}
                            onChange={(e) => setInteractive(e.target.checked)}
                        />
                        <span>Interactive session</span>
                    </label>

                    <div className="flex items-center gap-2">
                        <button className={PRIMARY_BTN} disabled={!canLaunch} onClick={() => model.launch()}>
                            {posting ? "Launching…" : "Launch"}
                        </button>
                        {canLaunch && <span className="text-xs text-secondary">⌘↵ to launch</span>}
                    </div>
                </div>
            )}

            {result != null && result.ok && (
                <div className="rounded border border-border p-3 text-sm">
                    <div className="font-semibold text-secondary">Workspace created</div>
                    {result.branch != null && (
                        <div className="text-secondary">
                            branch <span className="text-primary">{result.branch}</span>
                        </div>
                    )}
                    {result.workspaceId != null && (
                        <div className="text-xs text-secondary truncate">{result.workspaceId}</div>
                    )}
                    {result.workspaceId != null && (
                        <div className="flex items-center gap-2 mt-2">
                            <button
                                className={QUIET_BTN}
                                onClick={() =>
                                    createBlock({
                                        meta: {
                                            view: "recoder-terminal",
                                            "recoder:workspaceid": result.workspaceId,
                                        } as MetaType,
                                    })
                                }
                            >
                                Open session
                            </button>
                            <button className={QUIET_BTN} onClick={() => createBlock({ meta: { view: "recoder-diff" } })}>
                                Review
                            </button>
                        </div>
                    )}
                </div>
            )}

            {result != null && !result.ok && (
                <div className="rounded border border-border p-3 text-sm text-error">
                    {result.error || "Launch failed"}
                </div>
            )}
        </div>
    );
}

RecoderLaunchView.displayName = "RecoderLaunchView";

export { RecoderLaunchView };
