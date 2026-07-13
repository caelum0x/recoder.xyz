// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderConnectorsView } from "./recoder-connectors";

// Per-channel health from GET /api/connectors (docker-backend connectors bridge).
// Fields are allowlisted during normalization — anything token-like the API might
// ever grow is never carried into the UI model.
type ConnectorChannel = {
    channel: string;
    accountId: string;
    configured: boolean;
    available: boolean;
    connected: boolean;
    requiresExternal: boolean;
    identity: string;
    reason: string;
    error: string;
};

type ConnectorsGatewayState = {
    active: boolean;
    dispatchReady: boolean;
};

// empty = backend answered but reports zero channels; not-connected = backend unreachable.
type ConnectorsStatus = "loading" | "ok" | "empty" | "not-connected";

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v != null && !Array.isArray(v);
}

function firstString(...vals: unknown[]): string {
    for (const v of vals) {
        if (typeof v === "string" && v.trim() != "") return v.trim();
    }
    return "";
}

function asBool(v: unknown): boolean {
    return v === true;
}

// Unwraps the { success, data } envelope and rebuilds each channel from an explicit
// field allowlist (no spread of the raw object), defending against schema drift and
// guaranteeing no credential-shaped field ever reaches the view.
function normalizeChannels(raw: unknown): ConnectorChannel[] {
    const data = isRecord(raw) && isRecord(raw.data) ? raw.data : raw;
    let list: unknown[] = [];
    if (isRecord(data) && Array.isArray(data.channels)) list = data.channels;
    else if (Array.isArray(data)) list = data;
    return list
        .map((c) => {
            if (!isRecord(c)) {
                return {
                    channel: "",
                    accountId: "",
                    configured: false,
                    available: false,
                    connected: false,
                    requiresExternal: false,
                    identity: "",
                    reason: "",
                    error: "",
                };
            }
            const channel = firstString(c.channel);
            return {
                channel,
                accountId: firstString(c.accountId, c.account_id),
                configured: asBool(c.configured),
                available: asBool(c.available),
                connected: asBool(c.connected),
                requiresExternal: asBool(c.requiresExternal) || asBool(c.requires_external),
                identity: firstString(c.identity),
                reason: firstString(c.reason),
                error: firstString(c.error),
            };
        })
        .filter((c) => c.channel != "");
}

function normalizeGateway(raw: unknown): ConnectorsGatewayState {
    const data = isRecord(raw) && isRecord(raw.data) ? raw.data : raw;
    if (!isRecord(data)) return { active: false, dispatchReady: false };
    return {
        active: asBool(data.active),
        dispatchReady: asBool(data.dispatchReady) || asBool(data.dispatch_ready),
    };
}

class RecoderConnectorsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    channelsAtom: PrimitiveAtom<ConnectorChannel[]>;
    gatewayAtom: PrimitiveAtom<ConnectorsGatewayState>;
    statusAtom: PrimitiveAtom<ConnectorsStatus>;
    loadingAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-connectors";
        this.viewIcon = atom("plug");
        this.viewName = atom("Connectors");
        this.channelsAtom = atom([]) as PrimitiveAtom<ConnectorChannel[]>;
        this.gatewayAtom = atom({ active: false, dispatchReady: false }) as PrimitiveAtom<ConnectorsGatewayState>;
        this.statusAtom = atom("loading") as PrimitiveAtom<ConnectorsStatus>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderConnectorsView;
    }

    // Read-only per-channel health from GET /api/connectors. The endpoint is
    // truthful even when the gateway is inert (config-derived snapshot), so any
    // non-OK response means the backend itself is unreachable. Degrade-safe.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.statusAtom, "loading");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/connectors`);
            if (!res.ok) {
                globalStore.set(this.channelsAtom, []);
                globalStore.set(this.gatewayAtom, { active: false, dispatchReady: false });
                globalStore.set(this.statusAtom, "not-connected");
                return;
            }
            const body: unknown = await res.json();
            const channels = normalizeChannels(body);
            globalStore.set(this.channelsAtom, channels);
            globalStore.set(this.gatewayAtom, normalizeGateway(body));
            globalStore.set(this.statusAtom, channels.length == 0 ? "empty" : "ok");
        } catch {
            globalStore.set(this.channelsAtom, []);
            globalStore.set(this.gatewayAtom, { active: false, dispatchReady: false });
            globalStore.set(this.statusAtom, "not-connected");
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }
}

export { RecoderConnectorsViewModel, type ConnectorChannel, type ConnectorsGatewayState, type ConnectorsStatus };
