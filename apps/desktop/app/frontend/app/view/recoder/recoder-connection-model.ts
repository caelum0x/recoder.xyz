// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom } from "jotai";
import { deriveConnectionState, type RecoderConnectionState } from "./recoder-connection";

// Every recoder view polls the SAME embedded backend, so one shared last-success
// timestamp is a coherent liveness signal for the whole surface. Views record
// their poll outcome via noteRefresh; consumers read the derived verdict instead
// of trusting a per-view binary flag that keeps showing stale data as if live.
// Stale after ~2.5 poll cycles (the Hub polls every 6s).
const DefaultStaleAfterMs = 15000;

class RecoderConnectionModel {
    private static instance: RecoderConnectionModel | null = null;

    lastOkAtom = atom(0);
    lastFailedAtom = atom(false);
    nowAtom = atom(0);
    connectionStateAtom!: Atom<RecoderConnectionState>;

    nowSource: () => number;
    staleAfterMs: number;

    private constructor(nowSource: () => number = Date.now, staleAfterMs: number = DefaultStaleAfterMs) {
        this.nowSource = nowSource;
        this.staleAfterMs = staleAfterMs;
        this.connectionStateAtom = atom((get): RecoderConnectionState => {
            const lastOk = get(this.lastOkAtom);
            const now = get(this.nowAtom);
            if (lastOk == 0) {
                return deriveConnectionState(null, now, this.staleAfterMs);
            }
            // A failed poll while a prior success is still on screen is stale, not
            // live — surface it immediately rather than waiting out the time window.
            if (get(this.lastFailedAtom)) {
                return "stale";
            }
            return deriveConnectionState(lastOk, now, this.staleAfterMs);
        });
    }

    static getInstance(): RecoderConnectionModel {
        if (!RecoderConnectionModel.instance) {
            RecoderConnectionModel.instance = new RecoderConnectionModel();
        }
        return RecoderConnectionModel.instance;
    }

    static resetInstance(): void {
        RecoderConnectionModel.instance = null;
    }

    noteRefresh(ok: boolean, nowMs?: number): void {
        const t = nowMs == null ? this.nowSource() : nowMs;
        globalStore.set(this.nowAtom, t);
        if (!ok) {
            globalStore.set(this.lastFailedAtom, true);
            return;
        }
        globalStore.set(this.lastOkAtom, t);
        globalStore.set(this.lastFailedAtom, false);
    }
}

export { DefaultStaleAfterMs, RecoderConnectionModel };
