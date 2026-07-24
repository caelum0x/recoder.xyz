// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderToolsView } from "./recoder-tools";

// A governed read-only capability the terminal can invoke directly through the
// Recoder MCP host. `serverId`/`toolName` map to
// POST /api/mcp/tools/:serverId/:toolName/call. These four are the known
// high-value read-only engines; the list is static so the palette still renders
// when GET /api/mcp/servers is unavailable (fallback to known list).
type RecoderCapability = {
    id: string;
    label: string;
    serverId: string;
    toolName: string;
    inputLabel: string;
    inputPlaceholder: string;
    argKey: string;
    hasTopK: boolean;
};

const Capabilities: RecoderCapability[] = [
    {
        id: "retrieval.search",
        label: "Retrieval — search",
        serverId: "recoder.retrieval",
        toolName: "retrieval.search",
        inputLabel: "Query",
        inputPlaceholder: "search your indexed knowledge…",
        argKey: "query",
        hasTopK: true,
    },
    {
        id: "pal.plan",
        label: "PAL — plan",
        serverId: "recoder.pal-plan",
        toolName: "pal.plan",
        inputLabel: "Goal",
        inputPlaceholder: "describe the goal to plan…",
        argKey: "goal",
        hasTopK: false,
    },
    {
        id: "coordination.detect_conflict",
        label: "Coordination — detect conflict",
        serverId: "recoder.coordination",
        toolName: "coordination.detect_conflict",
        inputLabel: "Resource",
        inputPlaceholder: "resource path or id…",
        argKey: "resource",
        hasTopK: false,
    },
    {
        id: "browser.extract",
        label: "Browser — extract",
        serverId: "recoder.browser-use",
        toolName: "browser.extract",
        inputLabel: "URL",
        inputPlaceholder: "https://…",
        argKey: "url",
        hasTopK: false,
    },
    {
        id: "notify.send",
        label: "Notify — send",
        serverId: "recoder.notify",
        toolName: "notify.send",
        inputLabel: "Message",
        inputPlaceholder: "notify a human channel…",
        argKey: "message",
        hasTopK: false,
    },
];

// Outcome of a capability call, normalized so the UI never fabricates a win.
// `ok` marks a truthful completion; `notConfigured` surfaces the backend's
// verbatim reason; `unavailable` covers 403/non-2xx/transport failures.
type RecoderToolResult = {
    ok: boolean;
    status: string;
    reason?: string;
    result?: unknown;
    unavailable?: boolean;
};

const TerminalActor = "recoder-terminal";

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v != null && !Array.isArray(v);
}

class RecoderToolsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    capabilityIdAtom: PrimitiveAtom<string>;
    inputAtom: PrimitiveAtom<string>;
    topKAtom: PrimitiveAtom<string>;
    runningAtom: PrimitiveAtom<boolean>;
    resultAtom: PrimitiveAtom<RecoderToolResult>;
    serverIdsAtom: PrimitiveAtom<string[]>;
    serversLoadedAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-tools";
        this.viewIcon = atom("toolbox");
        this.viewName = atom("Capabilities");
        this.capabilityIdAtom = atom(Capabilities[0].id) as PrimitiveAtom<string>;
        this.inputAtom = atom("") as PrimitiveAtom<string>;
        this.topKAtom = atom("") as PrimitiveAtom<string>;
        this.runningAtom = atom(false) as PrimitiveAtom<boolean>;
        this.resultAtom = atom(null) as PrimitiveAtom<RecoderToolResult>;
        this.serverIdsAtom = atom([]) as PrimitiveAtom<string[]>;
        this.serversLoadedAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderToolsView;
    }

    currentCapability(): RecoderCapability {
        const id = globalStore.get(this.capabilityIdAtom);
        return Capabilities.find((c) => c.id === id) ?? Capabilities[0];
    }

    // Degrade-safe: a failed/404 server probe just leaves availability unloaded so
    // the palette renders the full known list without greying anything.
    async refresh() {
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/mcp/servers`);
            if (!res.ok) {
                globalStore.set(this.serverIdsAtom, []);
                globalStore.set(this.serversLoadedAtom, false);
                return;
            }
            const body = await res.json();
            const list = Array.isArray(body?.data?.servers) ? body.data.servers : [];
            const ids = list
                .map((s: { serverId?: unknown }) => String(s?.serverId ?? ""))
                .filter((x: string) => x !== "");
            globalStore.set(this.serverIdsAtom, ids);
            globalStore.set(this.serversLoadedAtom, true);
        } catch {
            globalStore.set(this.serverIdsAtom, []);
            globalStore.set(this.serversLoadedAtom, false);
        }
    }

    // Invoke the selected read-only engine through the governed MCP host. Every
    // branch is truthful: completed → result; not_configured → verbatim reason;
    // denied/failed/403/non-2xx/transport error → "not available in this run".
    async run() {
        const cap = this.currentCapability();
        const primary = globalStore.get(this.inputAtom).trim();
        if (primary === "") {
            return;
        }
        const args: Record<string, unknown> = { [cap.argKey]: primary };
        if (cap.hasTopK) {
            const topK = parseInt(globalStore.get(this.topKAtom), 10);
            if (!Number.isNaN(topK) && topK > 0) {
                args.topK = topK;
            }
        }
        globalStore.set(this.runningAtom, true);
        globalStore.set(this.resultAtom, null);
        try {
            const url = `${getRecoderBackendUrl()}/api/mcp/tools/${encodeURIComponent(cap.serverId)}/${encodeURIComponent(cap.toolName)}/call`;
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ actor: { agentId: TerminalActor }, args }),
            });
            const body = await res.json().catch(() => ({}));
            const data = isRecord(body?.data) ? body.data : {};
            const dStatus = typeof data.status === "string" ? data.status : res.ok ? "completed" : "error";
            const reason =
                typeof data.reason === "string"
                    ? data.reason
                    : typeof data.error === "string"
                      ? data.error
                      : "";
            if (dStatus === "not_configured") {
                globalStore.set(this.resultAtom, { ok: false, status: "not_configured", reason });
                return;
            }
            if (res.ok && (dStatus === "completed" || dStatus === "sent")) {
                globalStore.set(this.resultAtom, { ok: true, status: dStatus, result: data.result ?? data });
                return;
            }
            globalStore.set(this.resultAtom, { ok: false, status: dStatus, unavailable: true, reason });
        } catch (e) {
            globalStore.set(this.resultAtom, {
                ok: false,
                status: "error",
                unavailable: true,
                reason: e instanceof Error ? e.message : String(e),
            });
        } finally {
            globalStore.set(this.runningAtom, false);
        }
    }
}

export { RecoderToolsViewModel, Capabilities, type RecoderCapability, type RecoderToolResult };
