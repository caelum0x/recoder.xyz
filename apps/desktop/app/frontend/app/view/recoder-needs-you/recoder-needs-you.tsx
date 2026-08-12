// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, INPUT, META, PAGE_TITLE, QUIET_BTN_XS, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { NeedsYouEntry, RecoderNeedsYouViewModel } from "./recoder-needs-you-model";

const REFRESH_MS = 6000;

// One crimson accent, reserved for the two load-bearing "act now" signals: the degraded
// banner (a dead stream, surfaced not masked) and the top-priority awaiting_approval chip.
// Everything else stays graphite so the panel reads as a terminal, not a stoplight.
const CRIMSON_BANNER = "rounded border border-red-500/40 bg-red-500/10 text-red-300 px-2 py-1 text-xs";
const CRIMSON_CHIP = "rounded border border-red-500/40 bg-red-500/10 text-red-300 px-1.5 py-0.5 text-xs whitespace-nowrap";

const ROW =
    "flex w-full items-center gap-2 rounded border border-white/8 p-2 text-left hover:border-white/12 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-white/50 recoder-transition cursor-pointer";

function NeedsYouRow({ model, entry }: { model: RecoderNeedsYouViewModel; entry: NeedsYouEntry }) {
    const topPriority = entry.state == model.topPriorityState;
    return (
        <button className={ROW} title={entry.workspaceId} onClick={() => model.focusWorkspace(entry.workspaceId)}>
            <span className="text-sm font-medium truncate">{entry.agentKind || entry.workspaceId}</span>
            <span className={`${topPriority ? CRIMSON_CHIP : STATE_CHIP} ml-auto`}>{entry.state}</span>
            {entry.nativeStatus == "unknown" && <span className={STATE_CHIP}>no native status</span>}
        </button>
    );
}

NeedsYouRow.displayName = "NeedsYouRow";

function RecoderNeedsYouView({ model }: ViewComponentProps<RecoderNeedsYouViewModel>) {
    const taskGroup = useAtomValue(model.taskGroupAtom);
    const snapshot = useAtomValue(model.snapshotAtom);
    const notice = useAtomValue(model.noticeAtom);
    const error = useAtomValue(model.errorAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        model.load();
        const id = setInterval(() => model.load(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showDisconnected = !connected && !loading && error == "";
    const entries = snapshot?.entries ?? [];
    const showAllClear = snapshot != null && !snapshot.degraded && entries.length == 0 && notice == "" && !loading;

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Needs You</span>
                {snapshot != null && (
                    <span className={`${META} ml-auto`}>
                        {snapshot.count} need you / {snapshot.total} total
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2">
                <input
                    className={`${INPUT} flex-1`}
                    placeholder="taskGroup — filter to one parallel run (optional)…"
                    value={taskGroup}
                    onChange={(e) => model.setTaskGroup(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key == "Enter") {
                            model.load();
                        }
                    }}
                />
                <button disabled={loading} className={QUIET_BTN_XS} onClick={() => model.load()}>
                    {loading ? "…" : "Refresh"}
                </button>
            </div>

            <RecoderErrorRow message={error} />
            {loading && snapshot == null && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="The Needs-You queue loads once the backend is ready." />
            )}

            {snapshot != null && snapshot.degraded && notice != "" && (
                <div className={CRIMSON_BANNER}>Live queue degraded — showing last-known. {notice}</div>
            )}
            {snapshot != null && !snapshot.degraded && notice != "" && (
                <div className="text-secondary text-sm">{notice}</div>
            )}

            {snapshot != null && entries.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className={FIELD_LABEL}>Ranked queue</div>
                    {entries.map((e) => (
                        <NeedsYouRow key={e.workspaceId || e.agentKind} model={model} entry={e} />
                    ))}
                </div>
            )}

            {showAllClear && (
                <RecoderEmpty title="Nothing needs you." hint="Every agent in scope is running or settled." />
            )}
        </div>
    );
}

RecoderNeedsYouView.displayName = "RecoderNeedsYouView";

export { RecoderNeedsYouView };
