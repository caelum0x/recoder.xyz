// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderCapabilitiesView } from "./recoder-capabilities";

// The three-band verdict a tool's name earns, mirroring the backend's own
// McpToolRisk union so the badge language matches the governed gate exactly.
type CapabilityRisk = "low" | "medium" | "high";

// One governed MCP tool projected for the badge grid: the wire toolName plus the
// risk band the ported regex assigns it.
type CapabilityTool = {
    name: string;
    risk: CapabilityRisk;
};

// One registered MCP server (a governed capability group) projected from
// McpServerRegistration. Only the fields the catalog renders are carried; the
// enabled flag is preserved so a disabled group is shown truthfully, never dropped.
type CapabilityServer = {
    serverId: string;
    displayName: string;
    kind: string;
    transport: string;
    enabled: boolean;
    tools: CapabilityTool[];
};

// Truthful line when the governed registry answers with zero registered servers.
const EmptyRegistryNotice = "No tools registered";

// Ported verbatim from the backend risk classifier so a tool's badge on the
// terminal matches the decision the gate will actually make on it. Keep these two
// regexes in lockstep with the source of truth:
//   packages/agent-mcp/src/policy/tool-risk.ts:4 (estimateMcpToolRisk).
function estimateToolRisk(toolName: string): CapabilityRisk {
    if (/secret|billing|deploy|production|delete|write|push|pr\.create|merge|clink/.test(toolName)) {
        return "high";
    }
    if (/command|browser|preview|artifact|memory|approval|repo\.diff|workspace\.diff|workspace\.create/.test(toolName)) {
        return "medium";
    }
    return "low";
}

class RecoderCapabilitiesViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    serversAtom: PrimitiveAtom<CapabilityServer[]>;
    noticeAtom: PrimitiveAtom<string>;
    errorAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-capabilities";
        this.viewIcon = atom("toolbox");
        this.viewName = atom("Capabilities");
        this.serversAtom = atom([]) as PrimitiveAtom<CapabilityServer[]>;
        this.noticeAtom = atom("") as PrimitiveAtom<string>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderCapabilitiesView;
    }

    // Capability catalog: GET /api/mcp/servers → { count, servers }. Degrade-safe
    // and honest at every leg — an empty registry, a non-2xx reason, or a transport
    // failure each renders an explicit state and NEVER a fabricated capability row.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/mcp/servers`);
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.serversAtom, []);
                globalStore.set(this.noticeAtom, readErrorReason(body) || `Capability registry unavailable (${res.status})`);
                globalStore.set(this.errorAtom, "");
                globalStore.set(this.connectedAtom, true);
                RecoderConnectionModel.getInstance().noteRefresh(false);
                return;
            }
            const servers = projectServers(body?.data?.servers);
            globalStore.set(this.serversAtom, servers);
            globalStore.set(this.noticeAtom, servers.length === 0 ? EmptyRegistryNotice : "");
            globalStore.set(this.errorAtom, "");
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.serversAtom, []);
            globalStore.set(this.errorAtom, "Not connected.");
            globalStore.set(this.noticeAtom, "");
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }
}

// Project the registry array into terminal-renderable capability groups. A raw
// entry without a serverId is dropped rather than shown as a fabricated "" group;
// everything else is read defensively (the wire is untrusted external data).
function projectServers(value: unknown): CapabilityServer[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: CapabilityServer[] = [];
    for (const raw of value) {
        const s = raw != null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const serverId = typeof s.serverId === "string" ? s.serverId.trim() : "";
        if (serverId === "") {
            continue;
        }
        const displayName = typeof s.displayName === "string" && s.displayName.trim() !== "" ? s.displayName.trim() : serverId;
        const kind = typeof s.kind === "string" ? s.kind : "";
        const transport = typeof s.transport === "string" ? s.transport : "";
        const enabled = s.enabled === true;
        out.push({ serverId, displayName, kind, transport, enabled, tools: projectTools(s.toolNames) });
    }
    return out;
}

function projectTools(value: unknown): CapabilityTool[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: CapabilityTool[] = [];
    for (const raw of value) {
        if (typeof raw !== "string" || raw.trim() === "") {
            continue;
        }
        const name = raw.trim();
        out.push({ name, risk: estimateToolRisk(name) });
    }
    return out;
}

export {
    RecoderCapabilitiesViewModel,
    estimateToolRisk,
    type CapabilityRisk,
    type CapabilityServer,
    type CapabilityTool,
};
