// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock } from "@/app/store/global";
import { WaveAIModel } from "@/app/aipanel/waveai-model";
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
import {
    describeRunEvent,
    type RunEventDescriptor,
    type RunEventLike,
    type RunEventSeverity,
} from "./recoder-run-event";
import { PRIMARY_BTN, QUIET_BTN } from "./recoder-styles";
import { RecoderSkills } from "./recoder-skills";
import { RecoderRemoteAccess } from "./recoder-remote-access";
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

// Coordination deliveries are already durable RunEvents. Read only those from
// the canonical event edge so the teamwork ledger survives closing/reopening the
// Session; ordinary run events continue to arrive through the live stream.
async function fetchCoordinationHistory(workspaceId: string): Promise<RunEventDescriptor[]> {
    if (workspaceId == "") return [];
    try {
        const url = `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/events`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const body = await res.json();
        const events = Array.isArray(body?.data?.events) ? body.data.events : [];
        return events
            .map((event: unknown) => describeRunEvent(event as RunEventLike))
            .filter((descriptor: RunEventDescriptor) => descriptor.coordination != null);
    } catch {
        return [];
    }
}

function mergeCoordinationUpdates(
    history: readonly RunEventDescriptor[],
    live: readonly RunEventDescriptor[]
): RunEventDescriptor[] {
    const merged = new Map<string, RunEventDescriptor>();
    for (const descriptor of [...history, ...live]) {
        const coordination = descriptor.coordination;
        if (coordination == null) continue;
        const key =
            descriptor.eventId ??
            `${descriptor.time}:${coordination.fromWorkspaceId}:${coordination.milestone ?? "completed"}`;
        merged.set(key, descriptor);
    }
    return [...merged.values()];
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
function TurnBlock({ turn, agentName }: { turn: Turn; agentName: string }) {
    const who = turn.speaker == "you" ? "You" : agentName;
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 border-b border-border text-xs shrink-0">
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

function CoordinationStrip({ updates }: { updates: readonly RunEventDescriptor[] }) {
    if (updates.length == 0) return null;
    const latest = updates[updates.length - 1];
    return (
        <details className="shrink-0 border-b border-border px-3 py-1 text-xs">
            <summary className="cursor-pointer text-secondary hover:text-primary">
                <span className="font-medium text-primary">Agent coordination</span>
                <span className="ml-2">
                    {updates.length} context update{updates.length == 1 ? "" : "s"}
                </span>
                {latest?.detail != null && <span className="ml-2 text-meta">Latest: {latest.detail}</span>}
            </summary>
            <div className="mt-1 flex flex-col gap-1 border-l border-border pl-3">
                {updates.map((update, index) => (
                    <div key={update.eventId ?? `${update.time}-${index}`} className="flex items-baseline gap-2">
                        <span className="shrink-0 text-meta">{update.time}</span>
                        <span className="text-secondary">{update.detail}</span>
                    </div>
                ))}
            </div>
        </details>
    );
}

CoordinationStrip.displayName = "CoordinationStrip";

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
    const [coordinationHistory, setCoordinationHistory] = useState<RunEventDescriptor[]>([]);
    const [activePanel, setActivePanel] = useState<"skills" | "remote" | null>(null);

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
        setCoordinationHistory([]);
        void Promise.all([fetchWorkspaceHistory(workspaceId), fetchCoordinationHistory(workspaceId)]).then(
            ([turns, coordination]) => {
                if (cancelled) return;
                setHistory(turns);
                setCoordinationHistory(coordination);
            }
        );
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
    const coordinationUpdates = mergeCoordinationUpdates(
        coordinationHistory,
        entries.flatMap((entry) =>
            entry.kind == "event" && entry.descriptor.coordination != null ? [entry.descriptor] : []
        )
    );
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
    // chip is this Session's live connection status; the terminal segment is
    // wired only when the bound record carries a substrate session (truthful degrade).
    const boundSummary = workspaces.find((w) => w.workspaceId == workspaceId) ?? null;
    const boundAgentName = boundSummary?.runtimeId ? agentLabel(boundSummary.runtimeId) : "Agent";
    const detailIdentity = {
        branch: boundSummary?.branch ?? "",
        repo: boundSummary?.projectId,
        agent: boundSummary?.runtimeId ? boundAgentName : undefined,
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
        ? () =>
              openWorkspaceTerminal({
                  sessionName: boundSummary.sessionName,
                  cwd: boundSummary.worktreePath,
                  workspaceId: boundSummary.workspaceId,
                  substrate: boundSummary.substrate,
              })
        : undefined;
    // Workspace actions stay quiet beside the shared navigation. Ask AI opens
    // Wave's native panel; its focus resolver binds this exact detail workspace.
    const sessionActions =
        workspaceId != "" ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
                <button className={QUIET_BTN} onClick={() => WaveAIModel.getInstance().focusInput()}>
                    Ask AI
                </button>
                <button
                    className={QUIET_BTN}
                    onClick={() => setActivePanel((panel) => (panel == "skills" ? null : "skills"))}
                    aria-expanded={activePanel == "skills"}
                >
                    Skills
                </button>
                <button
                    className={QUIET_BTN}
                    onClick={() => setActivePanel((panel) => (panel == "remote" ? null : "remote"))}
                    aria-expanded={activePanel == "remote"}
                >
                    Remote
                </button>
                <button className={QUIET_BTN} onClick={() => model.connect()}>
                    Reconnect
                </button>
            </div>
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
                primaryAction={sessionActions}
            />
            {activePanel == "skills" && workspaceId != "" && (
                <RecoderSkills workspaceId={workspaceId} onClose={() => setActivePanel(null)} />
            )}
            {activePanel == "remote" && workspaceId != "" && (
                <RecoderRemoteAccess workspaceId={workspaceId} onClose={() => setActivePanel(null)} />
            )}
            <UsageStrip display={usage} status={usageStatus} />
            <CoordinationStrip updates={coordinationUpdates} />
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
                {empty && status == "connected" && (
                    <div className="text-secondary">Waiting for {boundAgentName} to produce its first update…</div>
                )}
                {empty && status == "closed" && (
                    <div className="text-secondary">Disconnected — press Reconnect to resume the stream.</div>
                )}
                {empty && status == "error" && (
                    <div className="text-secondary">Not connected. Check that Recoder is running.</div>
                )}
                {turns.map((turn, i) => (
                    <TurnBlock key={i} turn={turn} agentName={boundAgentName} />
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
                        placeholder={noWorkspace ? "no workspace bound" : `Direct ${boundAgentName} — press Enter to send`}
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
