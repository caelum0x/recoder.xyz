// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderHandsView } from "./recoder-hands";

// A bundled Hand definition (the catalog you can activate). Surfaced from the
// openfang engine compiled into the backend (NAPI) — no daemon, no HTTP hop.
type Hand = {
    id: string;
    name: string;
    status: string;
    description: string;
};

// A live Hand instance running in the booted kernel.
type ActiveHand = {
    instanceId: string;
    handId: string;
    name: string;
    status: string;
};

// not-running = engine not booted (503); not-connected = backend unreachable.
type HandsStatus = "loading" | "ok" | "empty" | "not-running" | "not-connected";

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v != null && !Array.isArray(v);
}

function firstString(...vals: unknown[]): string {
    for (const v of vals) {
        if (typeof v === "string" && v.trim() != "") return v.trim();
    }
    return "";
}

function normalizeHands(raw: unknown): Hand[] {
    let list: unknown[] = [];
    if (Array.isArray(raw)) list = raw;
    else if (isRecord(raw) && Array.isArray(raw.hands)) list = raw.hands;
    else if (isRecord(raw) && Array.isArray(raw.data)) list = raw.data;
    return list
        .map((h) => {
            if (!isRecord(h)) return { id: "", name: "", status: "", description: "" };
            const id = firstString(h.id, h.hand_id, h.name, h.slug);
            return {
                id,
                name: firstString(h.name, h.title, id),
                status: firstString(h.status, h.state) || "inactive",
                description: firstString(h.description, h.summary),
            };
        })
        .filter((h) => h.id != "" || h.name != "");
}

// The active-hands endpoint returns full HandInstance objects; pull the fields the
// UI needs, defending against schema drift.
function normalizeActive(raw: unknown): ActiveHand[] {
    let list: unknown[] = [];
    if (isRecord(raw) && Array.isArray(raw.hands)) list = raw.hands;
    else if (Array.isArray(raw)) list = raw;
    return list
        .map((h) => {
            if (!isRecord(h)) return { instanceId: "", handId: "", name: "", status: "" };
            const instanceId = firstString(h.instance_id, h.instanceId, h.id);
            const handId = firstString(h.hand_id, h.handId, h.definition_id, h.hand);
            return {
                instanceId,
                handId,
                name: firstString(h.instance_name, h.name, handId),
                status: firstString(h.status, h.state) || "active",
            };
        })
        .filter((h) => h.instanceId != "");
}

class RecoderHandsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    handsAtom: PrimitiveAtom<Hand[]>;
    activeAtom: PrimitiveAtom<ActiveHand[]>;
    statusAtom: PrimitiveAtom<HandsStatus>;
    loadingAtom: PrimitiveAtom<boolean>;
    actionStatusAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-hands";
        this.viewIcon = atom("hand");
        this.viewName = atom("Hands");
        this.handsAtom = atom([]) as PrimitiveAtom<Hand[]>;
        this.activeAtom = atom([]) as PrimitiveAtom<ActiveHand[]>;
        this.statusAtom = atom("loading") as PrimitiveAtom<HandsStatus>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.actionStatusAtom = atom("") as PrimitiveAtom<string>;
    }

    get viewComponent(): ViewComponent {
        return RecoderHandsView;
    }

    // Load the bundled Hand catalog (works without a booted kernel) and the live
    // active instances (requires a booted engine; absent → just empty). All from
    // the in-process engine at /api/agents/openfang/*. Degrade-safe throughout.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.statusAtom, "loading");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agents/openfang/hands`);
            if (res.status == 503) {
                globalStore.set(this.handsAtom, []);
                globalStore.set(this.activeAtom, []);
                globalStore.set(this.statusAtom, "not-running");
                return;
            }
            if (!res.ok) {
                globalStore.set(this.handsAtom, []);
                globalStore.set(this.activeAtom, []);
                globalStore.set(this.statusAtom, "not-connected");
                return;
            }
            const list = normalizeHands(await res.json());
            globalStore.set(this.handsAtom, list);
            globalStore.set(this.statusAtom, list.length == 0 ? "empty" : "ok");
            await this.refreshActive();
        } catch {
            globalStore.set(this.handsAtom, []);
            globalStore.set(this.activeAtom, []);
            globalStore.set(this.statusAtom, "not-connected");
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    // Active instances need a booted engine; a 503 just means "none yet", not an error.
    async refreshActive() {
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agents/openfang/hands/active`);
            if (!res.ok) {
                globalStore.set(this.activeAtom, []);
                return;
            }
            globalStore.set(this.activeAtom, normalizeActive(await res.json()));
        } catch {
            globalStore.set(this.activeAtom, []);
        }
    }

    async activate(handId: string) {
        await this.action(`hands/${encodeURIComponent(handId)}/activate`, `Activated ${handId}`);
    }

    async pause(instanceId: string) {
        await this.action(`hands/${encodeURIComponent(instanceId)}/pause`, "Paused");
    }

    async resume(instanceId: string) {
        await this.action(`hands/${encodeURIComponent(instanceId)}/resume`, "Resumed");
    }

    async deactivate(instanceId: string) {
        await this.action(`hands/${encodeURIComponent(instanceId)}/deactivate`, "Deactivated");
    }

    // Shared POST helper for every Hand action. Truthful status, never faked.
    private async action(pathSuffix: string, okLabel: string) {
        globalStore.set(this.actionStatusAtom, "");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agents/openfang/${pathSuffix}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
            });
            if (res.status == 503) {
                globalStore.set(this.actionStatusAtom, "OpenFang engine not booted (needs config).");
                return;
            }
            if (!res.ok) {
                globalStore.set(this.actionStatusAtom, `Failed (${res.status}).`);
                return;
            }
            const body = await res.json().catch(() => ({}));
            if (isRecord(body) && body.ok === false) {
                globalStore.set(this.actionStatusAtom, firstString(body.error) || "Action rejected by engine.");
                return;
            }
            globalStore.set(this.actionStatusAtom, `${okLabel}.`);
            await this.refresh();
        } catch {
            globalStore.set(this.actionStatusAtom, "Unavailable — backend not reachable.");
        }
    }
}

export { RecoderHandsViewModel, type Hand, type ActiveHand, type HandsStatus };
