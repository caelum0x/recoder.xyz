// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderDiffViewModel } from "./recoder-diff-model";

const REFRESH_MS = 6000;

const PRIMARY_BTN =
    "bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer disabled:opacity-50";
const QUIET_BTN =
    "border border-border text-secondary rounded px-2 py-0.5 text-sm hover:bg-border/40 transition-colors cursor-pointer disabled:opacity-50";

type DiffLineKind = "add" | "del" | "hunk" | "meta" | "ctx";

// Classify a unified-diff line by change type. File headers ("+++"/"---"/"diff "
// /"index ") are matched before the generic +/- so they read as neutral metadata.
function diffLineKind(line: string): DiffLineKind {
    if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---")) {
        return "meta";
    }
    if (line.startsWith("@@")) {
        return "hunk";
    }
    if (line.startsWith("+")) {
        return "add";
    }
    if (line.startsWith("-")) {
        return "del";
    }
    return "ctx";
}

// Change type is encoded WITHOUT color: a luminance step (bg), an always-visible
// gutter glyph, and a left-border bar. Crimson appears ONLY as the thin del
// left-border marker, never on line text; green is never used.
const AddGutter = "+";
const DelGutter = "-";
const NeutralGutter = " ";

const AddRow = "bg-white/[0.05] text-primary/90 border-l-2 border-white/25";
const DelRow = "bg-black/25 text-primary/50 border-l-2 border-error/50";
const HunkRow = "text-accent";
const MetaRow = "text-secondary";
const CtxRow = "text-primary/70";

function diffRowClass(kind: DiffLineKind): string {
    if (kind == "add") {
        return AddRow;
    }
    if (kind == "del") {
        return DelRow;
    }
    if (kind == "hunk") {
        return HunkRow;
    }
    if (kind == "meta") {
        return MetaRow;
    }
    return CtxRow;
}

function diffGutter(kind: DiffLineKind): string {
    if (kind == "add") {
        return AddGutter;
    }
    if (kind == "del") {
        return DelGutter;
    }
    return NeutralGutter;
}

function DiffBody({ patch }: { patch: string }) {
    const lines = patch.split("\n");
    return (
        <pre className="text-xs leading-5 font-mono whitespace-pre overflow-auto rounded border border-border p-2 bg-panel">
            {lines.map((line, i) => {
                const kind = diffLineKind(line);
                return (
                    <div key={i} className={cn("flex min-h-[1.25rem]", diffRowClass(kind))}>
                        <span className="select-none w-4 text-center opacity-70 font-mono">{diffGutter(kind)}</span>
                        <span className="flex-1 whitespace-pre">{line == "" ? " " : line}</span>
                    </div>
                );
            })}
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
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showNotConnected = !loading && !connected;
    const showNoWorkspaces = !loading && connected && workspaces.length == 0;
    const hasPatch = diff != null && diff.patch != null && diff.patch.trim() != "";

    return (
        <div className="flex flex-col h-full overflow-hidden p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Recoder — Review</span>
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
                    <button className={PRIMARY_BTN} disabled={merging} onClick={() => model.mergeSelected()}>
                        {merging ? "Merging…" : "Merge"}
                    </button>
                )}
                {selectedId != "" && (
                    <button className={QUIET_BTN} disabled={prCreating} onClick={() => model.createPr()}>
                        {prCreating ? "Creating PR…" : "Create PR"}
                    </button>
                )}
            </div>
            {mergeStatus != "" && <div className="text-xs text-secondary">{mergeStatus}</div>}
            {prStatus != "" && <div className="text-xs text-secondary">{prStatus}</div>}

            {showNotConnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="Your workspace diffs load once it is ready." />
            )}
            {showNoWorkspaces && (
                <RecoderEmpty
                    title="No workspaces yet"
                    hint="Press N in Workspaces to launch an agent, then review its diff here."
                />
            )}
            {loading && workspaces.length == 0 && <RecoderSkeleton rows={5} />}

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
                    {diffLoading && <RecoderSkeleton rows={8} />}
                    {!diffLoading && !hasPatch && (
                        <div className="text-secondary text-sm">{diffStatus != "" ? diffStatus : "No diff — the worktree matches its base."}</div>
                    )}
                    {!diffLoading && hasPatch && <DiffBody patch={diff.patch} />}
                    {!diffLoading && diff != null && diff.untracked.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                            <div className="text-xs uppercase tracking-wide text-secondary">Untracked</div>
                            {diff.untracked.map((f) => (
                                <div key={f} className="text-xs font-mono text-secondary">
                                    <span className="select-none opacity-70">+ </span>
                                    {f}
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
