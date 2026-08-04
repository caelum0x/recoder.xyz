// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom } from "jotai";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { deriveHealthDot, type HealthDotState, type HealthInput } from "./recoder-health-logic";

// Single source for the navbar health dot. Polls GET /health/full (the aggregated
// worst-of report + per-domain `sources`) and folds the outcome through the pure
// deriveHealthDot. Kept SEPARATE from RecoderConnectionModel (which tracks poll
// FRESHNESS — "is our shown data stale") because "is the backend healthy" is a
// different axis; this model owns the /health/full read and answers the latter.

class RecoderHealthModel {
    private static instance: RecoderHealthModel | null = null;

    inputAtom = atom<HealthInput>({ kind: "loading" });
    healthDotAtom!: Atom<HealthDotState>;

    // Once we have reached the backend at least once, a later unreachable poll is
    // a real outage (red "unreachable"), not a cold boot ("Starting…", amber).
    everConnected = false;

    private constructor() {
        this.healthDotAtom = atom((get): HealthDotState => deriveHealthDot(get(this.inputAtom)));
    }

    static getInstance(): RecoderHealthModel {
        if (!RecoderHealthModel.instance) {
            RecoderHealthModel.instance = new RecoderHealthModel();
        }
        return RecoderHealthModel.instance;
    }

    static resetInstance(): void {
        RecoderHealthModel.instance = null;
    }

    // One poll cycle. A thrown fetch (no HTTP answer) is truthfully "unreachable"
    // — never silently healthy. Any HTTP response (even a 503 down-report, or a
    // 401) counts as "connected": /health/full carries the report body on 503, so
    // we parse regardless of res.ok, and an unparseable body derives to a neutral
    // "unknown" rather than a fabricated "up".
    async refresh(): Promise<void> {
        let res: Response;
        try {
            res = await fetch(`${getRecoderBackendUrl()}/health/full`);
        } catch (e) {
            globalStore.set(this.inputAtom, {
                kind: "unreachable",
                everConnected: this.everConnected,
                reason: e instanceof Error ? e.message : "",
            });
            return;
        }
        this.everConnected = true;
        let body: unknown = null;
        try {
            body = await res.json();
        } catch {
            body = null;
        }
        globalStore.set(this.inputAtom, { kind: "payload", body });
    }
}

export { RecoderHealthModel };
