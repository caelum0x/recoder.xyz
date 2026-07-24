// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { Agent, EngineStatus, RecoderOpenfangViewModel } from "./recoder-openfang-model";

const REFRESH_MS = 6000;

// Quiet secondary control (matches recoder-approvals' Reject button).
const QUIET_BTN =
    "border border-border text-primary rounded px-2 py-0.5 text-sm hover:bg-border/40 transition-colors cursor-pointer shrink-0";

const STATUS_MESSAGES: Record<EngineStatus, string> = {
    loading: "",
    ok: "",
    "engine-down": "Engine not available on this backend.",
    "not-available": "Engine not available on this backend.",
    down: "Not connected — start the Recoder backend to reach the engine.",
};

function AgentRow({ agent, model }: { agent: Agent; model: RecoderOpenfangViewModel }) {
    const running = agent.state.toLowerCase() == "running";
    return (
        <div className="flex items-center gap-2 rounded border border-border px-2 py-1" title={agent.id}>
            <span
                className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${
                    running ? "bg-success/20 text-success" : "bg-border/60 text-secondary"
                }`}
            >
                {agent.state}
            </span>
            <span className="text-sm truncate">{agent.name}</span>
            <span className="text-xs text-secondary font-mono ml-auto shrink-0 hidden sm:inline">
                {agent.id.slice(0, 8)}
            </span>
            <button className={QUIET_BTN} onClick={() => model.openChat(agent.id)}>
                Message
            </button>
            <button
                className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer shrink-0"
                onClick={() => model.activateAgent(agent.id)}
            >
                Activate
            </button>
            <button className={QUIET_BTN} onClick={() => model.stopAgent(agent.id)}>
                Stop
            </button>
            <button className={QUIET_BTN} onClick={() => model.killAgent(agent.id)}>
                Kill
            </button>
        </div>
    );
}

function ChatPane({ model }: { model: RecoderOpenfangViewModel }) {
    const agentId = useAtomValue(model.chatAgentAtom);
    const input = useAtomValue(model.chatInputAtom);
    const reply = useAtomValue(model.chatReplyAtom);
    const busy = useAtomValue(model.chatBusyAtom);
    if (agentId == "") return null;
    return (
        <div className="flex flex-col gap-2 rounded border border-border p-3 mt-1">
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Message {agentId.slice(0, 8)}</span>
                <button
                    className="text-xs text-secondary ml-auto cursor-pointer hover:text-primary"
                    onClick={() => model.closeChat()}
                >
                    Close
                </button>
            </div>
            <input
                className="rounded border border-border bg-transparent px-2 py-1 text-sm"
                placeholder="Say something to the agent…"
                value={input}
                onChange={(e) => model.setChatInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key == "Enter" && !busy) model.sendMessage();
                }}
            />
            <button
                className="bg-accent/80 text-primary rounded px-2 py-1 text-sm hover:bg-accent transition-colors cursor-pointer self-start disabled:opacity-50"
                disabled={busy || input.trim() == ""}
                onClick={() => model.sendMessage()}
            >
                {busy ? "Running…" : "Send"}
            </button>
            {reply != "" && <pre className="whitespace-pre-wrap break-words font-mono text-xs m-0">{reply}</pre>}
        </div>
    );
}

function RecoderOpenfangView({ model }: ViewComponentProps<RecoderOpenfangViewModel>) {
    const status = useAtomValue(model.statusAtom);
    const health = useAtomValue(model.healthAtom);
    const agents = useAtomValue(model.agentsAtom);
    const modelCount = useAtomValue(model.modelCountAtom);
    const skills = useAtomValue(model.skillsAtom);
    const usage = useAtomValue(model.usageAtom);
    const loading = useAtomValue(model.loadingAtom);
    const actionStatus = useAtomValue(model.actionStatusAtom);

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
                <span className="font-semibold">Recoder — Engine</span>
            </div>

            {loading && agents.length == 0 && <div className="text-secondary text-sm">Loading…</div>}
            {showNote && <div className="text-secondary text-sm">{note}</div>}
            {actionStatus != "" && <div className="text-secondary text-sm">{actionStatus}</div>}

            {status == "ok" && (
                <div className="flex flex-wrap gap-3 text-xs text-secondary">
                    {health != null && (
                        <span>
                            {health.agents} agent{health.agents == 1 ? "" : "s"} · {health.activeHands} active hand
                            {health.activeHands == 1 ? "" : "s"} · {health.buildMode}
                        </span>
                    )}
                    <span>{modelCount} models</span>
                    <span>{skills.length} skills</span>
                </div>
            )}

            {agents.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs uppercase tracking-wide text-secondary mt-1">Agents</div>
                    {agents.map((agent) => (
                        <AgentRow key={agent.id} agent={agent} model={model} />
                    ))}
                </div>
            )}

            <ChatPane model={model} />

            {skills.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs uppercase tracking-wide text-secondary mt-1">Skills</div>
                    <div className="flex flex-wrap gap-1">
                        {skills.slice(0, 40).map((s) => (
                            <span key={s} className="text-xs rounded bg-border/60 px-1.5 py-0.5">
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {usage != "" && usage != "{}" && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs uppercase tracking-wide text-secondary mt-1">Usage</div>
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs m-0 text-secondary">{usage}</pre>
                </div>
            )}
        </div>
    );
}

RecoderOpenfangView.displayName = "RecoderOpenfangView";

export { RecoderOpenfangView };
