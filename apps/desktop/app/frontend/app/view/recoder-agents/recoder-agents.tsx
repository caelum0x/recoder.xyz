// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { META, PAGE_TITLE, ROW_TITLE, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderAgent, RecoderAgentLiveness, RecoderAgentsViewModel } from "./recoder-agents-model";

const REFRESH_MS = 6000;

// Quiet graphite dot for every liveness EXCEPT a real `offline` — the one crimson
// on the surface. `unknown` is a hollow ring (no proof of life, never a stoplight
// green); `online`/`stale` differ only in graphite weight, not colour.
function livenessDot(liveness: RecoderAgentLiveness): string {
    if (liveness === "offline") {
        return "bg-red-400/70";
    }
    if (liveness === "online") {
        return "bg-white/55";
    }
    if (liveness === "stale") {
        return "bg-white/25";
    }
    return "border border-white/30";
}

function livenessLabel(liveness: RecoderAgentLiveness): string {
    if (liveness === "online") {
        return "online";
    }
    if (liveness === "stale") {
        return "stale";
    }
    if (liveness === "offline") {
        return "offline";
    }
    return "unknown";
}

function AgentRow({ agent }: { agent: RecoderAgent }) {
    return (
        <div className="flex flex-col gap-1 rounded border border-border p-2" title={agent.id}>
            <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", livenessDot(agent.liveness))} />
                <span className={`${ROW_TITLE} truncate`}>{agent.name}</span>
                <span className={`${STATE_CHIP} ml-auto`}>{livenessLabel(agent.liveness)}</span>
            </div>
            {agent.capabilities.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1">
                    {agent.capabilities.map((cap) => (
                        <span key={cap} className={STATE_CHIP}>
                            {cap}
                        </span>
                    ))}
                </div>
            ) : (
                <span className={META}>no advertised capabilities</span>
            )}
        </div>
    );
}

function RecoderAgentsView({ model }: ViewComponentProps<RecoderAgentsViewModel>) {
    const agents = useAtomValue(model.agentsAtom);
    const error = useAtomValue(model.errorAtom);
    const notice = useAtomValue(model.noticeAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showSkeleton = loading && agents.length == 0 && error == "" && notice == "";
    const showDisconnected = !connected && !loading && error == "";

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Agents</span>
                {agents.length > 0 && <span className={`${STATE_CHIP} ml-auto`}>{agents.length} registered</span>}
            </div>
            <RecoderErrorRow message={error} />
            {showSkeleton && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="The agent roster loads once it is ready." />
            )}
            {notice != "" && (
                <RecoderEmpty
                    title={notice}
                    hint="No A2A agent or runtime has registered with this node yet."
                />
            )}
            {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
            ))}
        </div>
    );
}

RecoderAgentsView.displayName = "RecoderAgentsView";

export { RecoderAgentsView };
