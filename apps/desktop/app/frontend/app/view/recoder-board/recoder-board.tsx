// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, PAGE_TITLE, QUIET_BTN, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { openFanoutFromIssue } from "@/app/view/recoder-fanout/recoder-fanout-open";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { BoardStatus, RecoderBoardViewModel } from "./recoder-board-model";

const REFRESH_MS = 6000;

const STATUS_MESSAGES: Record<BoardStatus, string> = {
    loading: "",
    ok: "",
    empty: "Nothing pending — no ready issues on the board.",
    unavailable: "Issue tracking isn't set up on this machine.",
    unreachable: "Issue tracking isn't reachable from here.",
    "not-available": "Issue tracking isn't available on this backend.",
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
                <span className={PAGE_TITLE}>Board</span>
            </div>
            {loading && issues.length == 0 && <RecoderSkeleton rows={3} />}
            {showNote && <RecoderEmpty title={note} />}
            <div className="flex flex-col gap-1">
                {issues.map((issue) => (
                    <div
                        key={issue.id || issue.title}
                        className="flex items-center gap-2 rounded border border-border px-2 py-1"
                        title={`${issue.id}${issue.priority != "" ? ` · ${issue.priority}` : ""}`}
                    >
                        {issue.priority != "" && <span className={`${STATE_CHIP} shrink-0`}>{issue.priority}</span>}
                        <span className="text-sm truncate">{issue.title}</span>
                        {issue.id != "" && (
                            <span className="text-xs text-secondary font-mono ml-auto shrink-0">{issue.id}</span>
                        )}
                        <button className={`${QUIET_BTN} shrink-0`} onClick={() => openFanoutFromIssue(issue.id)}>
                            Fan out
                        </button>
                    </div>
                ))}
            </div>
            {signals.length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                    <div className={FIELD_LABEL}>Handed-off work (stuck / blocked)</div>
                    {signals.map((sig, i) => (
                        <div
                            key={`${sig.workspaceId}-${i}`}
                            className="flex items-center gap-2 rounded border border-border px-2 py-1"
                            title={`${sig.workspaceId}${sig.when != "" ? ` · ${sig.when}` : ""}`}
                        >
                            <span className={cn(STATE_CHIP, "shrink-0 text-error")}>{sig.kind}</span>
                            <span className="text-sm truncate">{sig.detail != "" ? sig.detail : sig.workspaceId}</span>
                            <button
                                className={`${QUIET_BTN} shrink-0 ml-auto`}
                                onClick={() => openFanoutFromIssue()}
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
