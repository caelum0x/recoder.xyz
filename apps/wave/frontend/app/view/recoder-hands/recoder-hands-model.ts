// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderHandsView } from "./recoder-hands";

// An OpenFang "Hand": a pre-built autonomous capability that runs on a schedule
// (researcher, lead, collector, …). Surfaced through Recoder's governed proxy at
// /api/openfang/api/hands. Only the fields the block renders are declared.
type Hand = {
    id: string;
    name: string;
    status: string;
    description: string;
};

// not-running = openfang daemon absent (503 from the proxy); not-connected =
// Recoder backend unreachable. Both are truthful neutral states, never faked.
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

// Defensively pull a hands array out of the openfang response (bare array or
// {hands:[...]} / {data:[...]}). Always returns an array — never throws.
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

class RecoderHandsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    handsAtom: PrimitiveAtom<Hand[]>;
    statusAtom: PrimitiveAtom<HandsStatus>;
    loadingAtom: PrimitiveAtom<boolean>;
    actionStatusAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-hands";
        this.viewIcon = atom("hand");
        this.viewName = atom("Hands");
        this.handsAtom = atom([]) as PrimitiveAtom<Hand[]>;
        this.statusAtom = atom("loading") as PrimitiveAtom<HandsStatus>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.actionStatusAtom = atom("") as PrimitiveAtom<string>;
    }

    get viewComponent(): ViewComponent {
        return RecoderHandsView;
    }

    // List openfang's Hands through the governed proxy. Degrade-safe: 503 →
    // "OpenFang not running"; other non-2xx / thrown → "not connected".
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.statusAtom, "loading");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/openfang/api/hands`);
            if (res.status == 503) {
                globalStore.set(this.handsAtom, []);
                globalStore.set(this.statusAtom, "not-running");
                return;
            }
            if (!res.ok) {
                globalStore.set(this.handsAtom, []);
                globalStore.set(this.statusAtom, "not-connected");
                return;
            }
            const list = normalizeHands(await res.json());
            globalStore.set(this.handsAtom, list);
            globalStore.set(this.statusAtom, list.length == 0 ? "empty" : "ok");
        } catch {
            globalStore.set(this.handsAtom, []);
            globalStore.set(this.statusAtom, "not-connected");
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    // Activate a Hand (POST /api/openfang/api/hands/:id/activate). It starts working
    // immediately on its schedule. Degrade-safe: truthful status, never faked.
    async activate(id: string) {
        if (!id) return;
        globalStore.set(this.actionStatusAtom, "");
        try {
            const res = await fetch(
                `${getRecoderBackendUrl()}/api/openfang/api/hands/${encodeURIComponent(id)}/activate`,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
            );
            if (res.status == 503) {
                globalStore.set(this.actionStatusAtom, "OpenFang not running.");
                return;
            }
            if (!res.ok) {
                globalStore.set(this.actionStatusAtom, `Activate failed (${res.status}).`);
                return;
            }
            globalStore.set(this.actionStatusAtom, `Activated ${id}.`);
            await this.refresh();
        } catch {
            globalStore.set(this.actionStatusAtom, "Activate unavailable — backend not reachable.");
        }
    }
}

export { RecoderHandsViewModel, type Hand, type HandsStatus };
