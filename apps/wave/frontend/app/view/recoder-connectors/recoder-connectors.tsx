// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { ConnectorChannel, ConnectorsStatus, RecoderConnectorsViewModel } from "./recoder-connectors-model";

const STATUS_MESSAGES: Record<ConnectorsStatus, string> = {
    loading: "",
    ok: "",
    empty: "No connector channels known to the backend.",
    "not-connected": "Not connected — start the Recoder backend to reach the connectors bridge.",
};

// Truthful per-channel badge: connected > configured-but-gapped > configured > not configured.
function channelBadge(ch: ConnectorChannel): { label: string; className: string } {
    if (ch.connected) return { label: "connected", className: "bg-success/20 text-success" };
    if (ch.error != "") return { label: "error", className: "bg-error/20 text-error" };
    if (ch.configured && ch.requiresExternal)
        return { label: "needs external", className: "bg-warning/20 text-warning" };
    if (ch.configured) return { label: "configured", className: "bg-border/60 text-primary" };
    return { label: "not configured", className: "bg-border/60 text-secondary" };
}

function ChannelRow({ channel }: { channel: ConnectorChannel }) {
    const badge = channelBadge(channel);
    const detail = channel.error != "" ? channel.error : channel.reason;
    return (
        <div className="flex items-center gap-2 rounded border border-border px-2 py-1" title={detail}>
            <span className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${badge.className}`}>{badge.label}</span>
            <span className="text-sm truncate">{channel.channel}</span>
            {channel.identity != "" && (
                <span className="text-xs text-secondary font-mono truncate hidden sm:inline">{channel.identity}</span>
            )}
            {detail != "" && <span className="text-xs text-secondary truncate hidden md:inline">— {detail}</span>}
            {channel.accountId != "" && channel.accountId != channel.channel && (
                <span className="text-xs text-secondary font-mono ml-auto shrink-0">{channel.accountId}</span>
            )}
        </div>
    );
}

function RecoderConnectorsView({ model }: ViewComponentProps<RecoderConnectorsViewModel>) {
    const channels = useAtomValue(model.channelsAtom);
    const gateway = useAtomValue(model.gatewayAtom);
    const loading = useAtomValue(model.loadingAtom);
    const status = useAtomValue(model.statusAtom);

    useEffect(() => {
        model.refresh();
    }, [model]);

    const note = STATUS_MESSAGES[status];
    const showNote = !loading && status != "ok" && note != "";
    const configured = channels.filter((c) => c.configured);
    const unconfigured = channels.filter((c) => !c.configured);

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Connectors</span>
                {status == "ok" && (
                    <span className="text-xs text-secondary">
                        gateway {gateway.active ? "active" : "inert"}
                        {gateway.dispatchReady ? " · dispatch ready" : ""}
                    </span>
                )}
                <button
                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer ml-auto"
                    onClick={() => model.refresh()}
                >
                    Refresh
                </button>
            </div>
            {loading && channels.length == 0 && <div className="text-secondary text-sm">Loading…</div>}
            {showNote && <div className="text-secondary text-sm">{note}</div>}

            {configured.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs uppercase tracking-wide text-secondary mt-1">Configured</div>
                    {configured.map((channel) => (
                        <ChannelRow key={`${channel.channel}:${channel.accountId}`} channel={channel} />
                    ))}
                </div>
            )}

            {unconfigured.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs uppercase tracking-wide text-secondary mt-1">Not Configured</div>
                    {unconfigured.map((channel) => (
                        <ChannelRow key={`${channel.channel}:${channel.accountId}`} channel={channel} />
                    ))}
                </div>
            )}
        </div>
    );
}

RecoderConnectorsView.displayName = "RecoderConnectorsView";

export { RecoderConnectorsView };
