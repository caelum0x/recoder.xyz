// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, PAGE_TITLE, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { CapabilityRisk, CapabilityServer, CapabilityTool, RecoderCapabilitiesViewModel } from "./recoder-capabilities-model";

const REFRESH_MS = 6000;

// Graphite everywhere, with a single crimson reserved for high-risk tools. No
// stoplight: low/medium share the neutral chip so the one dangerous band reads.
const RISK_CHIP: Record<CapabilityRisk, string> = {
    low: STATE_CHIP,
    medium: STATE_CHIP,
    high: "rounded border border-red-500/40 bg-red-500/10 text-red-300 px-1.5 py-0.5 text-xs whitespace-nowrap",
};

function ToolRow({ tool }: { tool: CapabilityTool }) {
    return (
        <div className="flex items-center gap-2 rounded border border-border p-2" title={tool.name}>
            <span className="text-sm font-mono truncate">{tool.name}</span>
            {tool.risk == "high" && <span className={`${RISK_CHIP.high} ml-auto`}>high risk</span>}
        </div>
    );
}

function ServerGroup({ server }: { server: CapabilityServer }) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <span className={FIELD_LABEL}>{server.displayName}</span>
                {server.transport != "" && <span className={STATE_CHIP}>{server.transport}</span>}
                <span className={`${STATE_CHIP} ml-auto`}>{server.enabled ? "enabled" : "disabled"}</span>
            </div>
            {server.tools.length == 0 && <div className="text-secondary text-sm">No tools exposed.</div>}
            {server.tools.map((t) => (
                <ToolRow key={t.name} tool={t} />
            ))}
        </div>
    );
}

function RecoderCapabilitiesView({ model }: ViewComponentProps<RecoderCapabilitiesViewModel>) {
    const servers = useAtomValue(model.serversAtom);
    const notice = useAtomValue(model.noticeAtom);
    const error = useAtomValue(model.errorAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showDisconnected = !connected && !loading && error == "";
    const showEmpty = notice != "" && servers.length == 0;

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Capabilities</span>
            </div>
            <RecoderErrorRow message={error} />
            {loading && servers.length == 0 && notice == "" && error == "" && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="The capability catalog loads once it is ready." />
            )}
            {showEmpty && <RecoderEmpty title={notice} hint="No governed MCP tools are registered yet." />}
            {servers.map((s) => (
                <ServerGroup key={s.serverId} server={s} />
            ))}
        </div>
    );
}

RecoderCapabilitiesView.displayName = "RecoderCapabilitiesView";

export { RecoderCapabilitiesView };
