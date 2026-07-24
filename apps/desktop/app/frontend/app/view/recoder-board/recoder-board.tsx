// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock } from "@/app/store/global";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { BoardStatus, RecoderBoardViewModel } from "./recoder-board-model";

const REFRESH_MS = 6000;

async function pickUpIssue(title: string) {
    const meta: Record<string, unknown> = { view: "recoder-launch" };
    if (title != "") {
        meta["recoder:prefilltask"] = title;
    }
    try {
        await createBlock({ meta });
    } catch {
        // Opening the launch form is best-effort; a failure here must not crash the board.
    }
}

const STATUS_MESSAGES: Record<BoardStatus, string> = {
    loading: "",
    ok: "",
    empty: "Nothing pending — no ready issues on the board.",
    unavailable: "Issue board not available — the `bd` CLI is not installed on this machine.",
    unreachable: "Issue board not available — the ready-issue bridge is not reachable from here.",
    "not-available": "Issue board not available on this backend.",
    "not-connected": "Not connected — start the Recoder backend to see ready work.",
};

function RecoderBoardView({ model }: ViewComponentProps<RecoderBoardViewModel>) {
    const issues = useAtomValue(model.issuesAtom);
    const loading = useAtomValue(model.loadingAtom);
    const status = useAtomValue(model.statusAtom);
    const signals = useAtomValue(model.signalsAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const note = STATUS_MESSAGES[status];
    const showNote = !loading && status != "ok" && note != "";

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Recoder — Board</span>
            </div>
            {loading && issues.length == 0 && <div className="text-secondary text-sm">Loading…</div>}
            {showNote && <div className="text-secondary text-sm">{note}</div>}
            <div className="flex flex-col gap-1">
                {issues.map((issue) => (
                    <div
                        key={issue.id || issue.title}
                        className="flex items-center gap-2 rounded border border-border px-2 py-1"
                        title={`${issue.id}${issue.priority != "" ? ` · ${issue.priority}` : ""}`}
                    >
                        {issue.priority != "" && (
                            <span className="text-xs text-secondary rounded bg-border/60 px-1.5 py-0.5 shrink-0">
                                {issue.priority}
                            </span>
                        )}
                        <span className="text-sm truncate">{issue.title}</span>
                        {issue.id != "" && (
                            <span className="text-xs text-secondary font-mono ml-auto shrink-0">{issue.id}</span>
                        )}
                        <button
                            className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer shrink-0"
                            onClick={() => pickUpIssue(issue.title)}
                        >
                            Pick up
                        </button>
                    </div>
                ))}
            </div>
            {signals.length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                    <div className="text-xs uppercase tracking-wide text-secondary">Handed-off work (stuck / blocked)</div>
                    {signals.map((sig, i) => (
                        <div
                            key={`${sig.workspaceId}-${i}`}
                            className="flex items-center gap-2 rounded border border-border px-2 py-1"
                            title={`${sig.workspaceId}${sig.when != "" ? ` · ${sig.when}` : ""}`}
                        >
                            <span className="text-xs text-error rounded bg-border/60 px-1.5 py-0.5 shrink-0">{sig.kind}</span>
                            <span className="text-sm truncate">{sig.detail != "" ? sig.detail : sig.workspaceId}</span>
                            <button
                                className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer shrink-0 ml-auto"
                                onClick={() => pickUpIssue(sig.detail != "" ? sig.detail : `Pick up stuck work from ${sig.workspaceId}`)}
                            >
                                Pick up
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

RecoderBoardView.displayName = "RecoderBoardView";

export { RecoderBoardView };
