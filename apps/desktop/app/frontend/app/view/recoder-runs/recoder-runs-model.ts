// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderRunsView } from "./recoder-runs";

// Mirrors the Agent OS TaskRun domain type (packages/agent-os/src/domain/task-spec.ts).
// GET /api/agent-os/runs → { success, data: TaskRun[] }. Only the fields the
// terminal renders are declared.
type RecoderRun = {
    runId: string;
    taskId: string;
    spaceId: string;
    state: string;
    assigneeAgentId?: string;
    startedAt?: string;
    updatedAt: string;
    completedAt?: string;
};

// Mirrors the Agent OS RunEvent domain type (packages/agent-os/src/domain/event.ts).
// GET /api/agent-os/events → { success, data: RunEvent[] }.
type RecoderRunEvent = {
    eventId: string;
    type: string;
    taskId: string;
    runId?: string;
    agentId?: string;
    state?: string;
    message?: string;
    createdAt: string;
};

// Show the most recent events first, capped so the stream stays readable.
const MaxEvents = 40;

class RecoderRunsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    runsAtom: PrimitiveAtom<RecoderRun[]>;
    eventsAtom: PrimitiveAtom<RecoderRunEvent[]>;
    loadingAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;
    connectedAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-runs";
        this.viewIcon = atom("wave-square");
        this.viewName = atom("Runs");
        this.runsAtom = atom([]) as PrimitiveAtom<RecoderRun[]>;
        this.eventsAtom = atom([]) as PrimitiveAtom<RecoderRunEvent[]>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderRunsView;
    }

    // Degrade-safe: any transport failure leaves connected=false so the panel
    // shows a neutral "not connected" message rather than crashing or faking data.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        try {
            const [runs, events] = await Promise.all([this.fetchRuns(), this.fetchEvents()]);
            globalStore.set(this.runsAtom, runs);
            globalStore.set(this.eventsAtom, events);
            globalStore.set(this.connectedAtom, true);
        } catch (e) {
            globalStore.set(this.connectedAtom, false);
            globalStore.set(this.runsAtom, []);
            globalStore.set(this.eventsAtom, []);
            globalStore.set(this.errorAtom, e instanceof Error ? e.message : String(e));
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    async fetchRuns(): Promise<RecoderRun[]> {
        const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/runs`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(readErrorReason(body) || `Request failed (${res.status})`);
        }
        const list = Array.isArray(body?.data) ? (body.data as RecoderRun[]) : [];
        return [...list].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    }

    async fetchEvents(): Promise<RecoderRunEvent[]> {
        const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/events`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(readErrorReason(body) || `Request failed (${res.status})`);
        }
        const list = Array.isArray(body?.data) ? (body.data as RecoderRunEvent[]) : [];
        return [...list].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, MaxEvents);
    }
}

export { RecoderRunsViewModel, type RecoderRun, type RecoderRunEvent };
