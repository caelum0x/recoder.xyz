// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
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
    const sending = useAtomValue(model.sendingAtom);
    const sendStatus = useAtomValue(model.sendStatusAtom);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [draft, setDraft] = useState("");

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
                    <button
                        className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:hover:bg-accent/80"
                        onClick={() => void submit()}
                        disabled={!canSend}
                    >
                        {sending ? "Sending…" : "Send"}
                    </button>
                </div>
            </div>
        </div>
    );
}

RecoderTerminalView.displayName = "RecoderTerminalView";

export { RecoderTerminalView };
