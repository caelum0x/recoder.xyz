// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, INPUT, PAGE_TITLE, PRIMARY_BTN, QUIET_BTN_XS, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { BlockedAgent, RecoderSwarmViewModel, UnblockOutcome } from "./recoder-swarm-model";

const REFRESH_MS = 6000;

// One crimson accent, reserved for the single load-bearing "answered in place" signal;
// everything else stays graphite so the panel reads as a terminal, not a stoplight.
const CRIMSON_CHIP = "rounded border border-red-500/40 bg-red-500/10 text-red-300 px-1.5 py-0.5 text-xs whitespace-nowrap";

function OutcomeRow({ outcome }: { outcome: UnblockOutcome }) {
    if (outcome.result == null) {
        if (outcome.notice == "") {
            return null;
        }
        return <div className="text-secondary text-xs">{outcome.notice}</div>;
    }
    if (outcome.result.action == "answered") {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <span className={CRIMSON_CHIP}>answered</span>
                {outcome.result.source != "" && (
                    <span className={STATE_CHIP}>via {outcome.result.source}</span>
                )}
                <span className="text-secondary text-xs truncate" title={outcome.result.answer}>
                    {outcome.result.answer}
                </span>
            </div>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className={STATE_CHIP}>escalated</span>
            <span className={STATE_CHIP} title={outcome.result.requestId}>
                {outcome.result.requestId}
            </span>
            <span className="text-secondary text-xs">awaiting approval</span>
        </div>
    );
}

OutcomeRow.displayName = "OutcomeRow";

function BlockedRow({ model, agent }: { model: RecoderSwarmViewModel; agent: BlockedAgent }) {
    const autoAnswer = useAtomValue(model.autoAnswerAtom);
    const unblocking = useAtomValue(model.unblockingAtom);
    const outcomes = useAtomValue(model.outcomeAtom);
    const busy = unblocking[agent.workspaceId] === true;
    const outcome = outcomes[agent.workspaceId];

    return (
        <div className="flex flex-col gap-1 rounded border border-border p-2" title={agent.workspaceId}>
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{agent.agentKind || agent.workspaceId}</span>
                <span className={`${STATE_CHIP} ml-auto`}>{agent.status}</span>
                {!agent.nativeStatus && <span className={STATE_CHIP}>raw pane</span>}
                <button
                    disabled={busy}
                    className={PRIMARY_BTN}
                    onClick={() => model.unblock(agent.workspaceId)}
                >
                    {busy ? "…" : autoAnswer ? "Auto-answer" : "Escalate"}
                </button>
            </div>
            {agent.question != null && agent.question != "" && (
                <div className="text-secondary text-xs truncate" title={agent.question}>
                    {agent.question}
                </div>
            )}
            {outcome != null && <OutcomeRow outcome={outcome} />}
        </div>
    );
}

BlockedRow.displayName = "BlockedRow";

function RecoderSwarmView({ model }: ViewComponentProps<RecoderSwarmViewModel>) {
    const taskGroup = useAtomValue(model.taskGroupAtom);
    const blocked = useAtomValue(model.blockedAtom);
    const notice = useAtomValue(model.noticeAtom);
    const error = useAtomValue(model.errorAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);
    const autoAnswer = useAtomValue(model.autoAnswerAtom);

    useEffect(() => {
        model.loadBlocked();
        const id = setInterval(() => model.loadBlocked(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const hasGroup = taskGroup.trim() != "";
    const showDisconnected = !connected && !loading && error == "";

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Swarm Unblock</span>
                <button
                    className={autoAnswer ? `${STATE_CHIP} ml-auto border-red-500/40 text-red-300` : `${QUIET_BTN_XS} ml-auto`}
                    onClick={() => model.toggleAutoAnswer()}
                    title="Escalate by default; opt in to auto-answer from Recoder-only sources."
                >
                    {autoAnswer ? "Auto-answer: on" : "Auto-answer: off"}
                </button>
            </div>

            <div className="flex items-center gap-2">
                <input
                    className={`${INPUT} flex-1`}
                    placeholder="taskGroup — list the blocked panes…"
                    value={taskGroup}
                    onChange={(e) => model.setTaskGroup(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key == "Enter") {
                            model.loadBlocked();
                        }
                    }}
                />
                <button disabled={loading} className={QUIET_BTN_XS} onClick={() => model.loadBlocked()}>
                    {loading ? "…" : "Open"}
                </button>
            </div>

            <RecoderErrorRow message={error} />
            {loading && blocked == null && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="The blocked panes load once the backend is ready." />
            )}

            {hasGroup && notice != "" && <div className="text-secondary text-sm">{notice}</div>}

            {blocked != null && blocked.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className={FIELD_LABEL}>Blocked panes</div>
                    {blocked.map((a) => (
                        <BlockedRow key={a.workspaceId || a.agentKind} model={model} agent={a} />
                    ))}
                </div>
            )}
        </div>
    );
}

RecoderSwarmView.displayName = "RecoderSwarmView";

export { RecoderSwarmView };
