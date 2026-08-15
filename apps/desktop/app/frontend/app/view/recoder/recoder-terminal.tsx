// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock } from "@/app/store/global";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { agentLabel } from "./recoder-agent-labels";
import { decideApproval } from "./recoder-approval-action";
import {
    deriveTranscript,
    messagesToTurns,
    type HydratedMessage,
    type Turn,
    type TurnLine,
} from "./recoder-conversation-logic";
import { RecoderDetailHeader, workspaceOptionLabel, type RecoderStateTone } from "./recoder-detail-header";
import { useRecoderDetailNavigation } from "./recoder-detail-navigation";
import { openWorkspaceDetail } from "./recoder-detail-open";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { type MeteringDisplay } from "./recoder-metering";
import { openWorkspaceTerminal } from "./recoder-open-terminal";
import { type RunEventSeverity } from "./recoder-run-event";
import { PRIMARY_BTN, QUIET_BTN } from "./recoder-styles";
import { RecoderTerminalStatus, RecoderTerminalViewModel, type UsageStripStatus } from "./recoder-terminal-model";

const UsageRefreshMs = 15_000;

// Hydrate this workspace's prior Claude transcript (the durable per-workspace read
// edge) so the Session seeds history before live replay. Degrade-truthful: a
// non-2xx, an available:false, or any parse/network failure yields [] — the view
// then shows its calm empty/live state, NEVER a fabricated history.
async function fetchWorkspaceHistory(workspaceId: string): Promise<Turn[]> {
    if (workspaceId == "") return [];
    try {
        const url = `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/transcript`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const body = await res.json();
        const data = body?.data;
        if (data?.available != true || !Array.isArray(data.messages)) return [];
        return messagesToTurns(data.messages as HydratedMessage[]);
    } catch {
        return [];
    }
}

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

// One salient line inside a turn: a short lifecycle label ("Verified") and/or the
// agent's prose, rendered calmly. When the line carries a decidable approval it
// grows inline approve/deny right where it happened in the conversation — no
// hunting a side list. Truthful: a failed decide surfaces its reason, never a
// silent green.
function TurnLineRow({ line }: { line: TurnLine }) {
    const [approval, setApproval] = useState<ApprovalUiState>({ phase: "idle" });
    const approvalId = line.approvalId;

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
                {line.label != "" && (
                    <span className={cn("shrink-0 font-medium", severityColor(line.severity))}>{line.label}</span>
                )}
                {line.text != "" && <span className="min-w-0 break-words">{line.text}</span>}
            </div>
            {approvalId != null && (
                <div className="flex items-center gap-2">
                    {approval.phase == "done" ? (
                        <span className="text-xs text-accent">{approval.label}</span>
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

TurnLineRow.displayName = "TurnLineRow";

// One turn of the clean conversation (design 3B): who spoke (you vs the agent —
// never the engine name), when, the salient lines they produced, and a quiet
// collapsed <details> holding the raw plumbing (tool frames, ANSI paint, transport
// frames) so the reader sees what the agent DID and SAID, not a log.
function TurnBlock({ turn }: { turn: Turn }) {
    const who = turn.speaker == "you" ? "You" : "Agent";
    const noiseCount = turn.noise.length;
    return (
        <div className="flex flex-col gap-1 py-1.5">
            <div className="flex items-baseline gap-2">
                <span className="shrink-0 font-medium text-primary">{who}</span>
                {turn.time != "" && <span className="shrink-0 text-[11px] text-meta">{turn.time}</span>}
            </div>
            <div className="flex flex-col gap-0.5 border-l border-border pl-3">
                {turn.lines.map((line, i) => (
                    <TurnLineRow key={i} line={line} />
                ))}
                {noiseCount > 0 && (
                    <details className="mt-0.5">
                        <summary className="cursor-pointer text-[11px] text-meta hover:text-secondary">
                            {noiseCount} more line{noiseCount == 1 ? "" : "s"} of output
                        </summary>
                        <div className="mt-1 whitespace-pre-wrap break-words text-[11px] text-meta">
                            {turn.noise.join("\n")}
                        </div>
                    </details>
                )}
            </div>
        </div>
    );
}

TurnBlock.displayName = "TurnBlock";

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
                    <span className="ml-auto font-medium text-primary whitespace-nowrap">{display.totals.cost}</span>
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

function statusTone(status: RecoderTerminalStatus): RecoderStateTone {
    // Graphite-only per the design system: connected is a real positive → accent;
    // error keeps the one reserved crimson; everything else stays neutral.
    if (status == "connected") return "accent";
    if (status == "error") return "error";
    return "neutral";
}

function RecoderTerminalView({ model }: ViewComponentProps<RecoderTerminalViewModel>) {
    const detailNavigate = useRecoderDetailNavigation();
    const entries = useAtomValue(model.entriesAtom);
    const status = useAtomValue(model.statusAtom);
    const error = useAtomValue(model.errorAtom);
    const workspaceId = useAtomValue(model.workspaceIdAtom);
    const sending = useAtomValue(model.sendingAtom);
    const sendStatus = useAtomValue(model.sendStatusAtom);
    const usage = useAtomValue(model.usageAtom);
    const usageStatus = useAtomValue(model.usageStatusAtom);
    const workspaces = useAtomValue(model.workspacesAtom);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [draft, setDraft] = useState("");
    const [history, setHistory] = useState<Turn[]>([]);

    useEffect(() => {
        model.connect();
        void model.refreshWorkspaces();
        return () => model.dispose();
    }, [model]);

    // Seed prior turns on Session-view attach (and on every rebind, keyed on
    // workspaceId). Clear first so a switch can't show the previous workspace's
    // history; the live socket then replays fresh frames on top.
    useEffect(() => {
        let cancelled = false;
        setHistory([]);
        void fetchWorkspaceHistory(workspaceId).then((turns) => {
            if (!cancelled) setHistory(turns);
        });
        return () => {
            cancelled = true;
        };
    }, [workspaceId]);

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
    }, [entries, history]);

    // Seeded history (durable per-workspace read) followed by the live stream
    // folded to clean turns — both projected through the same Turn shape so
    // hydrated and live turns render identically. The waiting states only show
    // when there is truly nothing (no history AND no live output).
    const turns = [...history, ...deriveTranscript(entries)];
    const empty = turns.length == 0;
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

    // The SHARED detail frame (identity + switcher + Session·Review·Terminal
    // segments) so Session reads as one face of the same workspace-detail Review
    // shows. Identity is resolved from the SAME list edge Review uses; the state
    // chip is this Session's live connection status; the raw-terminal segment is
    // wired only when the bound record carries a tmux session (truthful degrade).
    const boundSummary = workspaces.find((w) => w.workspaceId == workspaceId) ?? null;
    const detailIdentity = {
        branch: boundSummary?.branch ?? "",
        repo: boundSummary?.projectId,
        agent: boundSummary?.runtimeId ? agentLabel(boundSummary.runtimeId) : undefined,
        stateChip: { label: statusText(status), tone: statusTone(status) },
    };
    const detailSwitcher =
        workspaces.length > 0
            ? {
                  options: workspaces.map((w) => ({
                      id: w.workspaceId,
                      label: workspaceOptionLabel(w.branch, w.state),
                  })),
                  selectedId: workspaceId,
                  onSelect: (id: string) => {
                      if (detailNavigate != null) {
                          detailNavigate("session", id);
                      } else {
                          model.switchWorkspace(id);
                      }
                  },
              }
            : undefined;
    const onOpenTerminal = boundSummary?.sessionName
        ? () => openWorkspaceTerminal({ sessionName: boundSummary.sessionName, cwd: boundSummary.worktreePath })
        : undefined;
    // Reconnect only exists when there's a bound session to reconnect to — an
    // unbound Session (pick a workspace from the switcher first) shows no action.
    const reconnectBtn =
        workspaceId != "" ? (
            <button className={QUIET_BTN} onClick={() => model.connect()}>
                Reconnect
            </button>
        ) : undefined;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <RecoderDetailHeader
                workspaceId={workspaceId}
                view="session"
                identity={detailIdentity}
                switcher={detailSwitcher}
                onNavigate={(target) => {
                    if (target != "review") return;
                    if (detailNavigate != null) {
                        detailNavigate(target, workspaceId);
                    } else {
                        void openWorkspaceDetail(target, workspaceId);
                    }
                }}
                onOpenTerminal={onOpenTerminal}
                primaryAction={reconnectBtn}
            />
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
                {turns.map((turn, i) => (
                    <TurnBlock key={i} turn={turn} />
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
