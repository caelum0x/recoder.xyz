// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderHealthView } from "./recoder-health";

// Mirrors the conductor /api/conductor/health/full response (see
// backend/src/conductor/conductor-health.ts). Only the fields the
// terminal renders are declared; everything is optional/degrade-safe.
type HealthStatus = "healthy" | "degraded" | "unhealthy";

type FleetService = {
    id: string;
    available: boolean;
    source: string;
    reason: string;
    degradeTo: string;
};

type RecoderHealth = {
    status: HealthStatus;
    substrate: { available: boolean; git: boolean; tmux: boolean };
    runtimes: { runtimeId: string; available: boolean }[];
    services: { beads: boolean; colbertRerank: boolean };
    fleet: {
        services: FleetService[];
        summary: { total: number; available: number; degraded: number };
    };
    loaded: boolean;
};

const EmptyHealth: RecoderHealth = {
    status: "unhealthy",
    substrate: { available: false, git: false, tmux: false },
    runtimes: [],
    services: { beads: false, colbertRerank: false },
    fleet: { services: [], summary: { total: 0, available: 0, degraded: 0 } },
    loaded: false,
};

function parseHealth(data: unknown): RecoderHealth {
    const h = (data ?? {}) as Record<string, any>;
    const substrate = (h.substrate ?? {}) as Record<string, unknown>;
    const runtimes = Array.isArray(h.runtimes)
        ? h.runtimes
              .map((r: { runtimeId: string; available: boolean }) => ({
                  runtimeId: String(r?.runtimeId ?? ""),
                  available: Boolean(r?.available),
              }))
              .filter((r: { runtimeId: string }) => r.runtimeId !== "openfang")
        : [];
    const svc = (h.services ?? {}) as Record<string, any>;
    const fleet = (h.fleet ?? {}) as Record<string, any>;
    const fleetServices: FleetService[] = Array.isArray(fleet.services)
        ? fleet.services.map((s: Record<string, unknown>) => ({
              id: String(s?.id ?? ""),
              available: Boolean(s?.available),
              source: String(s?.source ?? ""),
              reason: String(s?.reason ?? ""),
              degradeTo: String(s?.degradeTo ?? ""),
          }))
        : [];
    const summary = (fleet.summary ?? {}) as Record<string, unknown>;
    const status: HealthStatus =
        h.status === "healthy" || h.status === "degraded" || h.status === "unhealthy" ? h.status : "unhealthy";
    return {
        status,
        substrate: {
            available: Boolean(substrate.available),
            git: Boolean(substrate.git),
            tmux: Boolean(substrate.tmux),
        },
        runtimes,
        services: {
            beads: Boolean(svc?.beads?.available),
            colbertRerank: Boolean(svc?.colbertRerank?.available),
        },
        fleet: {
            services: fleetServices,
            summary: {
                total: Number(summary.total ?? fleetServices.length),
                available: Number(summary.available ?? 0),
                degraded: Number(summary.degraded ?? 0),
            },
        },
        loaded: true,
    };
}

class RecoderHealthViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    healthAtom: PrimitiveAtom<RecoderHealth>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-health";
        this.viewIcon = atom("heart-pulse");
        this.viewName = atom("Health");
        this.healthAtom = atom(EmptyHealth) as PrimitiveAtom<RecoderHealth>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderHealthView;
    }

    // Degrade-safe: any transport failure or non-2xx leaves connected=false and
    // resets health to the neutral EmptyHealth so the panel shows a clear
    // "Not connected" state rather than crashing or faking green.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/health/full`);
            if (!res.ok) {
                globalStore.set(this.connectedAtom, false);
                globalStore.set(this.healthAtom, EmptyHealth);
                return;
            }
            const body = await res.json();
            globalStore.set(this.healthAtom, parseHealth(body?.data));
            globalStore.set(this.connectedAtom, true);
        } catch {
            globalStore.set(this.connectedAtom, false);
            globalStore.set(this.healthAtom, EmptyHealth);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }
}

export { RecoderHealthViewModel, type RecoderHealth, type FleetService, type HealthStatus };
