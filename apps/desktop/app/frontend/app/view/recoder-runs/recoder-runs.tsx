// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, PAGE_TITLE } from "@/app/view/recoder/recoder-styles";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { activeDriftFindings, driftForRun, driftLabel, type RunsDriftFinding } from "./recoder-runs-findings";
import { RecoderRun, RecoderRunEvent, RecoderRunsViewModel, SelectedRunStatus } from "./recoder-runs-model";

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

interface RunRowProps {
    run: RecoderRun;
    correlated: boolean;
    selected: boolean;
    drift: RunsDriftFinding[];
    onSelect: () => void;
    onSession: () => void;
    onReview: () => void;
}

function RunRow({ run, correlated, selected, drift, onSelect, onSession, onReview }: RunRowProps) {
    // Session/Review live inside the row; stop propagation so opening a block
    // doesn't also toggle the drilldown selection.
    const openSession = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSession();
    };
    const openReview = (e: React.MouseEvent) => {
        e.stopPropagation();
        onReview();
    };
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.key == "Enter" || e.key == " ") {
                    e.preventDefault();
                    onSelect();
                }
            }}
            className={cn(
                "flex items-center gap-2 rounded border px-2 py-1 cursor-pointer recoder-transition",
                selected ? "border-accent/60 bg-accent/10" : "border-border hover:bg-white/[0.03]"
            )}
            title={`${run.runId} · ${run.taskId}`}
        >
            <span className={cn("rounded border px-1.5 py-0.5 text-xs whitespace-nowrap", stateBadgeClass(run.state))}>
                {run.state}
            </span>
            <span className="text-sm truncate">{runLabel(run)}</span>
            {drift.length > 0 && (
                <span
                    className="flex items-center gap-1 text-xs text-secondary whitespace-nowrap"
                    title={drift.map((f) => driftLabel(f.kind)).join(" · ")}
                >
                    <i className="fa-solid fa-triangle-exclamation" />
                    {driftLabel(drift[0].kind)}
                </span>
            )}
            {run.assigneeAgentId && <span className="text-xs text-secondary truncate">{run.assigneeAgentId}</span>}
            <span className="text-xs text-secondary ml-auto whitespace-nowrap">{shortTime(run.updatedAt)}</span>
            {correlated ? (
                <span className="flex items-center gap-1 whitespace-nowrap">
                    <button
                        type="button"
                        onClick={openSession}
                        className="rounded border border-border px-1.5 py-0.5 text-xs text-secondary hover:text-primary hover:border-accent/50 cursor-pointer recoder-transition"
                    >
                        Session
                    </button>
                    <button
                        type="button"
                        onClick={openReview}
                        className="rounded border border-border px-1.5 py-0.5 text-xs text-secondary hover:text-primary hover:border-accent/50 cursor-pointer recoder-transition"
                    >
                        Review
                    </button>
                </span>
            ) : (
                <span className="text-xs text-meta whitespace-nowrap">no workspace</span>
            )}
        </div>
    );
}

function DriftLine({ finding }: { finding: RunsDriftFinding }) {
    return (
        <div className="flex items-baseline gap-2 text-xs" title={finding.findingId}>
            <span className="text-secondary font-mono whitespace-nowrap">{shortTime(finding.observedAt)}</span>
            <span className="rounded border border-border text-secondary px-1.5 py-0.5 whitespace-nowrap">
                {driftLabel(finding.kind)}
            </span>
            <span className="text-primary truncate">
                {finding.workspaceId || finding.sessionName || finding.worktreePath}
            </span>
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

// Honest empty-reason copy for the drilldown panel. Each state names WHY there's
// no transcript so the view never implies a run has events it can't show.
const SELECTED_EMPTY: Partial<Record<SelectedRunStatus, { title: string; hint: string }>> = {
    "not-correlated": {
        title: "Not linked to a workspace",
        hint: "Per-run events stream from a conductor workspace — this run has none yet.",
    },
    "not-connected": {
        title: "Couldn't load this run's events",
        hint: "The workspace events read didn't connect. It will retry on the next refresh.",
    },
    empty: {
        title: "No events for this run yet",
        hint: "Activity will appear here as the run progresses.",
    },
};

function SelectedRunPanel({
    status,
    events,
    label,
}: {
    status: SelectedRunStatus;
    events: RecoderRunEvent[];
    label: string;
}) {
    if (status == "idle") {
        return null;
    }
    const empty = SELECTED_EMPTY[status];
    return (
        <div className="flex flex-col gap-1">
            <div className={FIELD_LABEL}>Run events · {label}</div>
            {status == "loading" && <RecoderSkeleton rows={3} />}
            {empty != null && <RecoderEmpty title={empty.title} hint={empty.hint} />}
            {status == "ready" && (
                <div className="flex flex-col gap-0.5">
                    {events.map((event) => (
                        <EventLine key={event.eventId} event={event} />
                    ))}
                </div>
            )}
        </div>
    );
}

SelectedRunPanel.displayName = "SelectedRunPanel";

function RecoderRunsView({ model }: ViewComponentProps<RecoderRunsViewModel>) {
    const runs = useAtomValue(model.runsAtom);
    const events = useAtomValue(model.eventsAtom);
    const loading = useAtomValue(model.loadingAtom);
    const error = useAtomValue(model.errorAtom);
    const connected = useAtomValue(model.connectedAtom);
    const correlation = useAtomValue(model.correlationAtom);
    const selectedRunId = useAtomValue(model.selectedRunIdAtom);
    const selectedEvents = useAtomValue(model.selectedEventsAtom);
    const selectedStatus = useAtomValue(model.selectedStatusAtom);
    const findings = useAtomValue(model.findingsAtom);
    const findingsStatus = useAtomValue(model.findingsStatusAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showDisconnected = !connected && !loading;
    const showEmptyRuns = connected && !loading && runs.length == 0;
    const selectedRun = runs.find((r) => r.runId == selectedRunId);
    const drift = activeDriftFindings(findings);

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-3">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Runs</span>
            </div>
            <RecoderErrorRow message={error} />
            {loading && runs.length == 0 && events.length == 0 && <RecoderSkeleton rows={4} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="Runs will appear here once it is ready." />
            )}
            {connected && findingsStatus == "unavailable" && (
                <div className="text-xs text-meta">drift findings unavailable</div>
            )}
            {connected && drift.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className={FIELD_LABEL}>Drift</div>
                    <div className="flex flex-col gap-0.5">
                        {drift.map((finding) => (
                            <DriftLine key={finding.findingId} finding={finding} />
                        ))}
                    </div>
                </div>
            )}
            {connected && (
                <div className="flex flex-col gap-1">
                    <div className={FIELD_LABEL}>Runs</div>
                    {showEmptyRuns && (
                        <RecoderEmpty
                            title="No runs yet"
                            hint="Launch a coding agent to start one — press ⌘P for commands."
                        />
                    )}
                    {runs.map((run) => (
                        <RunRow
                            key={run.runId}
                            run={run}
                            correlated={correlation.has(run.runId)}
                            selected={run.runId == selectedRunId}
                            drift={driftForRun(run.runId, correlation, drift)}
                            onSelect={() => model.selectRun(run.runId)}
                            onSession={() => model.openRunSession(run.runId)}
                            onReview={() => model.openRunReview(run.runId)}
                        />
                    ))}
                </div>
            )}
            {connected && selectedRun != null && (
                <SelectedRunPanel status={selectedStatus} events={selectedEvents} label={runLabel(selectedRun)} />
            )}
            {connected && events.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className={FIELD_LABEL}>Recent events</div>
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
