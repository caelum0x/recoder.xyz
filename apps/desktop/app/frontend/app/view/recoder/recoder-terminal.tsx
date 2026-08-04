// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock } from "@/app/store/global";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { decideApproval } from "./recoder-approval-action";
import { type MeteringDisplay } from "./recoder-metering";
import { type RunEventSeverity } from "./recoder-run-event";
import { PAGE_TITLE, PRIMARY_BTN, QUIET_BTN } from "./recoder-styles";
import {
    RecoderTerminalStatus,
    RecoderTerminalViewModel,
    type RunStreamEntry,
    type UsageStripStatus,
} from "./recoder-terminal-model";

const UsageRefreshMs = 15_000;

async function openWorkspaces() {
    try {
        await createBlock({ meta: { view: "recoder" } });
    } catch {
        // Best-effort escape hatch from an unbound session block; a failure
        // here must not crash the view.
    }
}

// Graphite-only palette: positive/actionable → accent, failure → the one reserved
// crimson, everything else → neutral secondary.
function severityColor(severity: RunEventSeverity): string {
    if (severity == "danger") return "text-error";
    if (severity == "warn" || severity == "success" || severity == "active") return "text-accent";
    return "text-secondary";
}

type ApprovalUiState = { phase: "idle" | "acting" | "done"; label?: string };

function RunEntryRow({ entry }: { entry: RunStreamEntry }) {
    const [approval, setApproval] = useState<ApprovalUiState>({ phase: "idle" });

    if (entry.kind == "system") {
        return (
            <div className={cn("whitespace-pre-wrap break-words", entry.tone == "error" ? "text-error" : "text-secondary")}>
                {entry.text}
            </div>
        );
    }

    const d = entry.descriptor;
    const approvalId = d.approvalId;

    const act = async (action: "approve" | "reject") => {
        if (approvalId == null || approval.phase == "acting") return;
        setApproval({ phase: "acting" });
        const result = await decideApproval(approvalId, action);
        if (result.ok) {
            setApproval({ phase: "done", label: action == "approve" ? "approved" : "rejected" });
        } else {
            setApproval({ phase: "idle", label: result.error });
        }
    };

    return (
        <div className="flex flex-col gap-1 py-0.5">
            <div className="flex items-baseline gap-2 whitespace-pre-wrap break-words">
                <span className="text-secondary shrink-0">{d.time}</span>
                <span className={cn("shrink-0 font-semibold", severityColor(d.severity))}>{d.label}</span>
                {d.detail != "" && <span className="min-w-0 break-words">{d.detail}</span>}
            </div>
            {approvalId != null && (
                <div className="flex items-center gap-2 pl-14">
                    {approval.phase == "done" ? (
                        <span className="text-xs text-accent">✓ {approval.label}</span>
                    ) : (
                        <>
                            <button
                                className={PRIMARY_BTN}
                                onClick={() => void act("approve")}
                                disabled={approval.phase == "acting"}
                            >
                                {approval.phase == "acting" ? "…" : "Approve"}
                            </button>
                            <button
                                className={QUIET_BTN}
                                onClick={() => void act("reject")}
                                disabled={approval.phase == "acting"}
                            >
                                Reject
                            </button>
                            {approval.label != null && <span className="text-xs text-error">{approval.label}</span>}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

RunEntryRow.displayName = "RunEntryRow";

// The per-workspace cost/token strip. Numbers come from the scoped
// GET /inference/usage?workspaceId read folded through summarizeUsage; a failed
// read renders "usage unavailable" — the missing source, never a faked $0.00.
function UsageStrip({ display, status }: { display: MeteringDisplay; status: UsageStripStatus }) {
    if (status == "idle") return null;
    // The tooltip carries the scope the backend ECHOED (e.g. "workspace ws-1"),
    // so the strip states exactly what its numbers describe.
    const scopeTitle = status == "ready" ? display.scopeLabel : undefined;
    return (
        <div className="flex items-center gap-3 px-3 py-1 border-b border-border text-xs shrink-0">
            <span className="uppercase tracking-wide text-secondary shrink-0" title={scopeTitle}>
                Workspace usage
            </span>
            {status == "unavailable" ? (
                <span className="text-secondary">usage unavailable</span>
            ) : (
                <>
                    <span className="text-secondary whitespace-nowrap" title="input · output tokens">
                        {display.totals.inputTokens} in · {display.totals.outputTokens} out
                    </span>
                    <span className="text-secondary whitespace-nowrap">{display.totals.totalTokens} tokens</span>
                    <span className="text-secondary whitespace-nowrap">{display.totals.calls} calls</span>
                    <span className="ml-auto font-semibold text-primary whitespace-nowrap">{display.totals.cost}</span>
                </>
            )}
        </div>
    );
}

UsageStrip.displayName = "UsageStrip";

function statusText(status: RecoderTerminalStatus): string {
    if (status == "no-workspace") return "no workspace";
    if (status == "connecting") return "connecting…";
    if (status == "connected") return "live";
    if (status == "closed") return "disconnected";
    if (status == "error") return "error";
    return "idle";
}

function statusColor(status: RecoderTerminalStatus): string {
    // Graphite-only per the design system: connected is a real positive → accent;
    // connecting is a neutral pending state; error keeps the one reserved crimson.
    if (status == "connected") return "bg-accent/20 text-accent";
    if (status == "connecting") return "border border-white/8 text-secondary";
    if (status == "error") return "bg-error/20 text-error";
    return "bg-secondary/20 text-secondary";
}

function RecoderTerminalView({ model }: ViewComponentProps<RecoderTerminalViewModel>) {
    const entries = useAtomValue(model.entriesAtom);
    const status = useAtomValue(model.statusAtom);
    const error = useAtomValue(model.errorAtom);
    const workspaceId = useAtomValue(model.workspaceIdAtom);
    const sending = useAtomValue(model.sendingAtom);
    const sendStatus = useAtomValue(model.sendStatusAtom);
    const usage = useAtomValue(model.usageAtom);
    const usageStatus = useAtomValue(model.usageStatusAtom);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [draft, setDraft] = useState("");

    useEffect(() => {
        model.connect();
        return () => model.dispose();
    }, [model]);

    // Keyed on workspaceId so a rebind refetches the strip immediately; the
    // interval keeps cost/tokens current while runs stream through the socket.
    useEffect(() => {
        void model.refreshUsage();
        const id = setInterval(() => void model.refreshUsage(), UsageRefreshMs);
        return () => clearInterval(id);
    }, [model, workspaceId]);

    useEffect(() => {
        const el = scrollRef.current;
        if (el == null) return;
        el.scrollTop = el.scrollHeight;
    }, [entries]);

    const empty = entries.length == 0;
    const noWorkspace = workspaceId == "";
    const canSend = !noWorkspace && !sending && draft.trim() != "";

    const submit = async () => {
        if (!canSend) return;
        const ok = await model.sendMessage(draft);
        if (ok) setDraft("");
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key != "Enter" || e.shiftKey) return;
        e.preventDefault();
        void submit();
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
                <span className={PAGE_TITLE}>Session</span>
                {workspaceId != "" && (
                    <span className="text-xs text-secondary truncate" title={workspaceId}>
                        {workspaceId}
                    </span>
                )}
                <span className={cn("ml-auto rounded px-1.5 py-0.5 text-xs", statusColor(status))}>
                    {statusText(status)}
                </span>
                <button className={PRIMARY_BTN} onClick={() => model.connect()}>
                    Reconnect
                </button>
            </div>
            <UsageStrip display={usage} status={usageStatus} />
            {error != "" && <div className="text-error text-xs px-3 py-1 border-b border-border shrink-0">{error}</div>}
            <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed">
                {empty && status == "no-workspace" && (
                    <div className="flex flex-col items-start gap-2 text-secondary">
                        <div>This session isn't attached to a workspace yet.</div>
                        <button className={PRIMARY_BTN} onClick={() => void openWorkspaces()}>
                            Open Workspaces
                        </button>
                    </div>
                )}
                {empty && status == "connecting" && <div className="text-secondary">Connecting to session stream…</div>}
                {empty && status == "connected" && <div className="text-secondary">Waiting for session output…</div>}
                {empty && status == "closed" && (
                    <div className="text-secondary">Disconnected — press Reconnect to resume the stream.</div>
                )}
                {empty && status == "error" && (
                    <div className="text-secondary">Not connected. Check that Recoder is running.</div>
                )}
                {entries.map((entry, i) => (
                    <RunEntryRow key={i} entry={entry} />
                ))}
            </div>
            <div className="flex flex-col gap-1 px-3 py-2 border-t border-border shrink-0">
                {sendStatus != "" && (
                    <div
                        className={cn(
                            "text-xs",
                            sendStatus.startsWith("send failed") ? "text-error" : "text-secondary"
                        )}
                    >
                        {sendStatus}
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        disabled={noWorkspace}
                        placeholder={noWorkspace ? "no workspace bound" : "Direct the agent — press Enter to send"}
                        className="flex-1 min-w-0 rounded border border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-accent disabled:opacity-50"
                    />
                    <button className={PRIMARY_BTN} onClick={() => void submit()} disabled={!canSend}>
                        {sending ? "Sending…" : "Send"}
                    </button>
                </div>
            </div>
        </div>
    );
}

RecoderTerminalView.displayName = "RecoderTerminalView";

export { RecoderTerminalView };
