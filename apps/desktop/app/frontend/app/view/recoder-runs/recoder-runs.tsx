// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderRun, RecoderRunEvent, RecoderRunsViewModel } from "./recoder-runs-model";

const REFRESH_MS = 6000;

// Terminal (settled) states render muted; active states get the accent tint so a
// live run is obvious at a glance. Unknown states fall back to neutral.
const TERMINAL_STATES = new Set(["completed", "failed", "cancelled", "rejected"]);
const ERROR_STATES = new Set(["failed", "rejected"]);

function stateBadgeClass(state: string): string {
    if (ERROR_STATES.has(state)) {
        return "text-error border-error/40";
    }
    if (TERMINAL_STATES.has(state)) {
        return "text-secondary border-border";
    }
    return "text-primary border-accent/50 bg-accent/20";
}

function runLabel(run: RecoderRun): string {
    return run.taskId || run.runId;
}

function shortTime(iso?: string): string {
    if (!iso) {
        return "";
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        return "";
    }
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function RunRow({ run }: { run: RecoderRun }) {
    return (
        <div
            className="flex items-center gap-2 rounded border border-border px-2 py-1"
            title={`${run.runId} Â· ${run.taskId}`}
        >
            <span
                className={cn(
                    "rounded border px-1.5 py-0.5 text-xs whitespace-nowrap",
                    stateBadgeClass(run.state),
                )}
            >
                {run.state}
            </span>
            <span className="text-sm truncate">{runLabel(run)}</span>
            {run.assigneeAgentId && (
                <span className="text-xs text-secondary truncate">{run.assigneeAgentId}</span>
            )}
            <span className="text-xs text-secondary ml-auto whitespace-nowrap">{shortTime(run.updatedAt)}</span>
        </div>
    );
}

function EventLine({ event }: { event: RecoderRunEvent }) {
    return (
        <div className="flex items-baseline gap-2 text-xs" title={event.eventId}>
            <span className="text-secondary font-mono whitespace-nowrap">{shortTime(event.createdAt)}</span>
            <span className="rounded bg-border/60 px-1.5 py-0.5 font-mono whitespace-nowrap">{event.type}</span>
            <span className="text-primary truncate">{event.message || event.state || event.taskId}</span>
        </div>
    );
}

function RecoderRunsView({ model }: ViewComponentProps<RecoderRunsViewModel>) {
    const runs = useAtomValue(model.runsAtom);
    const events = useAtomValue(model.eventsAtom);
    const loading = useAtomValue(model.loadingAtom);
    const error = useAtomValue(model.errorAtom);
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showDisconnected = !connected && !loading;
    const showEmptyRuns = connected && !loading && runs.length == 0;

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-3">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Recoder â Runs</span>
            </div>
            {error != "" && <div className="text-error text-sm">{error}</div>}
            {loading && runs.length == 0 && events.length == 0 && (
                <div className="text-secondary text-sm">Loadingâ¦</div>
            )}
            {showDisconnected && (
                <div className="text-secondary text-sm">
                    Not connected â Recoder is starting…
                </div>
            )}
            {connected && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs uppercase tracking-wide text-secondary">Runs</div>
                    {showEmptyRuns && <div className="text-secondary text-sm">No runs yet.</div>}
                    {runs.map((run) => (
                        <RunRow key={run.runId} run={run} />
                    ))}
                </div>
            )}
            {connected && events.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs uppercase tracking-wide text-secondary">Recent events</div>
                    <div className="flex flex-col gap-0.5">
                        {events.map((event) => (
                            <EventLine key={event.eventId} event={event} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

RecoderRunsView.displayName = "RecoderRunsView";

export { RecoderRunsView };
