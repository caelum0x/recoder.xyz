// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { RecoderTerminalStatus, RecoderTerminalViewModel } from "./recoder-terminal-model";

function statusText(status: RecoderTerminalStatus): string {
    if (status == "no-workspace") return "no workspace";
    if (status == "connecting") return "connecting…";
    if (status == "connected") return "live";
    if (status == "closed") return "disconnected";
    if (status == "error") return "error";
    return "idle";
}

function statusColor(status: RecoderTerminalStatus): string {
    if (status == "connected") return "bg-success/20 text-success";
    if (status == "connecting") return "bg-accent/20 text-accent";
    if (status == "error") return "bg-error/20 text-error";
    return "bg-secondary/20 text-secondary";
}

function RecoderTerminalView({ model }: ViewComponentProps<RecoderTerminalViewModel>) {
    const lines = useAtomValue(model.linesAtom);
    const status = useAtomValue(model.statusAtom);
    const error = useAtomValue(model.errorAtom);
    const workspaceId = useAtomValue(model.workspaceIdAtom);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        model.connect();
        return () => model.dispose();
    }, [model]);

    useEffect(() => {
        const el = scrollRef.current;
        if (el == null) return;
        el.scrollTop = el.scrollHeight;
    }, [lines]);

    const empty = lines.length == 0;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
                <span className="font-semibold text-sm">Recoder Session</span>
                {workspaceId != "" && (
                    <span className="text-xs text-secondary truncate" title={workspaceId}>
                        {workspaceId}
                    </span>
                )}
                <span className={cn("ml-auto rounded px-1.5 py-0.5 text-xs", statusColor(status))}>
                    {statusText(status)}
                </span>
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-xs hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => model.connect()}
                >
                    Reconnect
                </button>
            </div>
            {error != "" && <div className="text-error text-xs px-3 py-1 border-b border-border shrink-0">{error}</div>}
            <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed">
                {empty && status == "no-workspace" && (
                    <div className="text-secondary">
                        No workspace bound. Set block meta <code>recoder:workspaceid</code> to stream a live agent
                        session.
                    </div>
                )}
                {empty && status == "connecting" && <div className="text-secondary">Connecting to session stream…</div>}
                {empty && status == "connected" && <div className="text-secondary">Waiting for session output…</div>}
                {empty && status == "closed" && (
                    <div className="text-secondary">Disconnected — press Reconnect to resume the stream.</div>
                )}
                {empty && status == "error" && (
                    <div className="text-secondary">Not connected. Check that the Recoder backend is reachable.</div>
                )}
                {lines.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-words">
                        {line}
                    </div>
                ))}
            </div>
        </div>
    );
}

RecoderTerminalView.displayName = "RecoderTerminalView";

export { RecoderTerminalView };
