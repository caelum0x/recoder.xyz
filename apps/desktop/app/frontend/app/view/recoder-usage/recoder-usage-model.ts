// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import {
    buildUsagePath,
    summarizeUsage,
    type MeteringDisplay,
    type UsagePayloadLike,
} from "../recoder/recoder-metering";
import { RecoderUsageView } from "./recoder-usage";

// Per-call inference activity: which delivery rung served each call (napi /
// loopback / BYOK-router) plus its token + cost breakdown. This is NON-billing
// TRANSPARENCY — the strip surfaces what the gateway metered, never a pricing
// policy. The projection is handled verbatim by summarizeUsage() so the number
// formatting matches the workspace cost strip exactly (see recoder-metering.ts).

// Truthful empty state: the caller has routed no inference yet.
const EmptyNotice = "No inference calls yet";

// Raw transport failure (embedded backend still starting / unreachable on loopback).
const NotConnectedNotice = "Not connected.";

// The all-zero display an empty/failed read renders — never a fabricated row.
const EmptyDisplay: MeteringDisplay = summarizeUsage(undefined);

class RecoderUsageViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    displayAtom: PrimitiveAtom<MeteringDisplay>;
    noticeAtom: PrimitiveAtom<string>;
    errorAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-usage";
        this.viewIcon = atom("gauge-high");
        this.viewName = atom("Usage");
        this.displayAtom = atom(EmptyDisplay) as PrimitiveAtom<MeteringDisplay>;
        this.noticeAtom = atom("") as PrimitiveAtom<string>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderUsageView;
    }

    // GET /api/gateway/inference/usage → { totals, recent[] }. summarizeUsage folds
    // the per-user ledger into totals + per-call rows (each carrying model/provider/
    // tier + token counts + micro-USD cost). The backend serves `recent`
    // most-recent-first, so the projection is already reverse-chronological — the
    // strip preserves that order rather than re-sorting. Degrade-truthful: an empty
    // ledger shows a calm notice, a non-2xx surfaces the backend reason, and a
    // transport throw shows "Not connected." — none fabricate a call or a cost.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}${buildUsagePath()}`);
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.displayAtom, EmptyDisplay);
                globalStore.set(this.errorAtom, readErrorReason(body) || `Usage unavailable (${res.status})`);
                globalStore.set(this.noticeAtom, "");
                globalStore.set(this.connectedAtom, false);
                RecoderConnectionModel.getInstance().noteRefresh(false);
                return;
            }
            const data = (body as { data?: UsagePayloadLike } | null)?.data;
            const display = summarizeUsage(data ?? undefined);
            globalStore.set(this.displayAtom, display);
            globalStore.set(this.noticeAtom, display.recent.length == 0 ? EmptyNotice : "");
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.displayAtom, EmptyDisplay);
            globalStore.set(this.errorAtom, NotConnectedNotice);
            globalStore.set(this.noticeAtom, "");
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }
}

export { EmptyNotice, NotConnectedNotice, RecoderUsageViewModel };
