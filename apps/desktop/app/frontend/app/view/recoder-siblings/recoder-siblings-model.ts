// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderSiblingsView } from "./recoder-siblings";

// One cross-pollination delivery projected from a `sibling_context_delivered`
// RunEvent on the RECEIVING workspace's events edge. `note` is the durable
// delivery-evidence line the backend persists on `message` — the FULL steered
// note text is intentionally never persisted (it only lands in the receiver's
// live session, to keep the prompt-injection surface minimal), so the feed shows
// the evidence line truthfully rather than fabricating the steered prose.
type SiblingContextDelivery = {
    fromWorkspaceId: string;
    toWorkspaceId: string;
    milestone: string;
    note: string;
    at: string;
};

// The `data.kind` discriminator the conductor sink stamps on every delivered
// evidence event (backend sibling-awareness.adapter.ts SIBLING_CONTEXT_DELIVERED).
const SiblingContextDeliveredKind = "sibling_context_delivered";

// Terminal deliveries (a sibling that completed/failed) carry no mid-run
// `milestone` marker — labelling them "finished" keeps the feed truthful without
// inventing a mid-run step.
const FinishedMilestone = "finished";

// Truthful empty state: the workspace has no siblings, or none has crossed a
// milestone yet — never a fabricated row.
const EmptyFeedNotice = "No sibling cross-pollination yet";

// Raw transport failure (backend still starting / unreachable on loopback).
const NotConnectedNotice = "Not connected.";

class RecoderSiblingsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    workspaceIdAtom: PrimitiveAtom<string>;
    feedAtom: PrimitiveAtom<SiblingContextDelivery[]>;
    noticeAtom: PrimitiveAtom<string>;
    errorAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-siblings";
        this.viewIcon = atom("share-nodes");
        this.viewName = atom("Siblings");
        this.workspaceIdAtom = atom("") as PrimitiveAtom<string>;
        this.feedAtom = atom([]) as PrimitiveAtom<SiblingContextDelivery[]>;
        this.noticeAtom = atom("") as PrimitiveAtom<string>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderSiblingsView;
    }

    // Read the receiving workspace's events edge (the SAME edge the Conversation
    // view replays), filter to sibling cross-pollination evidence, and project the
    // chronological feed. Degrade-truthful: an empty feed shows a calm notice, a
    // non-2xx surfaces the backend reason, and a transport throw shows
    // "Not connected." — none of them ever fabricates a delivery.
    async load(workspaceId: string) {
        const id = (workspaceId ?? "").trim();
        globalStore.set(this.workspaceIdAtom, id);
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        if (id == "") {
            globalStore.set(this.feedAtom, []);
            globalStore.set(this.noticeAtom, EmptyFeedNotice);
            globalStore.set(this.connectedAtom, false);
            globalStore.set(this.loadingAtom, false);
            return;
        }
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(id)}/events`);
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.feedAtom, []);
                globalStore.set(this.errorAtom, readErrorReason(body) || `Sibling feed unavailable (${res.status})`);
                globalStore.set(this.noticeAtom, "");
                globalStore.set(this.connectedAtom, false);
                RecoderConnectionModel.getInstance().noteRefresh(false);
                return;
            }
            const feed = projectSiblingDeliveries((body as { data?: { events?: unknown } } | null)?.data?.events);
            globalStore.set(this.feedAtom, feed);
            globalStore.set(this.noticeAtom, feed.length == 0 ? EmptyFeedNotice : "");
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.feedAtom, []);
            globalStore.set(this.errorAtom, NotConnectedNotice);
            globalStore.set(this.noticeAtom, "");
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }
}

// Project the events edge payload into the chronological cross-pollination feed.
// Only `sibling_context_delivered` evidence events survive the filter; the events
// edge already returns its append log in chronological order, so array order is
// preserved (never re-sorted into a fabricated sequence). An unreadable/missing
// event, or one missing its provenance, is DROPPED rather than shown as a blank row.
function projectSiblingDeliveries(value: unknown): SiblingContextDelivery[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: SiblingContextDelivery[] = [];
    for (const raw of value) {
        const ev = raw != null && typeof raw == "object" ? (raw as Record<string, unknown>) : {};
        const data = ev.data != null && typeof ev.data == "object" ? (ev.data as Record<string, unknown>) : {};
        if (data.kind != SiblingContextDeliveredKind) {
            continue;
        }
        const fromWorkspaceId = typeof data.fromWorkspaceId == "string" ? data.fromWorkspaceId : "";
        const toWorkspaceId = typeof data.workspaceId == "string" ? data.workspaceId : "";
        const milestone = typeof data.milestone == "string" && data.milestone != "" ? data.milestone : FinishedMilestone;
        const note = typeof ev.message == "string" ? ev.message : "";
        const at = typeof ev.createdAt == "string" ? ev.createdAt : "";
        out.push({ fromWorkspaceId, toWorkspaceId, milestone, note, at });
    }
    return out;
}

export { RecoderSiblingsViewModel, type SiblingContextDelivery };
