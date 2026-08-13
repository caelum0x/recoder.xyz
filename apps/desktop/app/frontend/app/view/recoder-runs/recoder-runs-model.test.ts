// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore(), createBlock: vi.fn() };
});

vi.mock("./recoder-runs", () => ({
    RecoderRunsView: () => null,
}));

import { globalStore } from "@/app/store/global";
import type { WorkspaceCorrelation } from "./recoder-runs-correlation";
import { RecoderRunsViewModel, type RecoderRun } from "./recoder-runs-model";

function makeModel(): RecoderRunsViewModel {
    return new RecoderRunsViewModel({ blockId: "b1" } as ViewModelInitType);
}

function run(overrides: Partial<RecoderRun> = {}): RecoderRun {
    return {
        runId: "r1",
        taskId: "t1",
        spaceId: "s1",
        state: "running",
        updatedAt: "2026-08-01T10:00:00Z",
        ...overrides,
    };
}

function workspace(overrides: Partial<WorkspaceCorrelation> = {}): WorkspaceCorrelation {
    return {
        workspaceId: "w1",
        taskId: "t1",
        spaceId: "s1",
        ...overrides,
    };
}

// Seed the correlation inputs (runs + live workspaces) that workspaceIdForRun
// reads, so the drilldown state machine exercises the REAL correlation path.
function seed(model: RecoderRunsViewModel, runs: RecoderRun[], workspaces: WorkspaceCorrelation[]): void {
    globalStore.set(model.runsAtom, runs);
    globalStore.set(model.workspacesAtom, workspaces);
}

// A Response-like carrying the { success, data } envelope fetchWorkspaceEvents
// unwraps via res.json(). Kept as a plain object (not a Promise) so a deferred
// gate can resolve to it on demand.
function okBody(data: unknown) {
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
}

function okJson(data: unknown) {
    return Promise.resolve(okBody(data));
}

function eventsBody(events: unknown[]) {
    return okBody({ events });
}

function evt(eventId: string) {
    return { eventId, type: "log", taskId: "t1", createdAt: "2026-08-01T10:00:00Z" };
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

// Route the per-workspace events endpoint by workspace id; everything else
// (runs/events/workspaces/findings) degrades to an empty ok body so an
// accidental refresh() never throws.
function eventsFetch(byWorkspace: Record<string, () => Promise<unknown>>) {
    return vi.fn().mockImplementation((url: string) => {
        const path = String(url);
        const match = path.match(/\/api\/conductor\/workspaces\/([^/]+)\/events$/);
        if (match) {
            const wsId = decodeURIComponent(match[1]);
            const respond = byWorkspace[wsId];
            if (respond) {
                return respond();
            }
        }
        return okJson([]);
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("RecoderRunsViewModel.workspaceIdForRun", () => {
    it("derives the correlated workspace id from the live workspaces list", () => {
        const model = makeModel();
        seed(model, [run({ runId: "r1" })], [workspace({ workspaceId: "w1", runId: "r1" })]);
        expect(model.workspaceIdForRun("r1")).toBe("w1");
    });

    it("returns '' for an unknown run (not present in the runs list)", () => {
        const model = makeModel();
        seed(model, [run({ runId: "r1" })], [workspace({ workspaceId: "w1", runId: "r1" })]);
        expect(model.workspaceIdForRun("ghost")).toBe("");
    });

    it("returns '' for a run that correlates to no workspace", () => {
        const model = makeModel();
        seed(model, [run({ runId: "r1", taskId: "t9", spaceId: "s9" })], [workspace({ runId: "rX" })]);
        expect(model.workspaceIdForRun("r1")).toBe("");
    });
});

describe("RecoderRunsViewModel.selectRun", () => {
    it("selects a run and loads its correlated workspace events (ready)", async () => {
        vi.stubGlobal("fetch", eventsFetch({ w1: () => Promise.resolve(eventsBody([evt("e1")])) }));
        const model = makeModel();
        seed(model, [run({ runId: "r1" })], [workspace({ workspaceId: "w1", runId: "r1" })]);

        await model.selectRun("r1");

        expect(globalStore.get(model.selectedRunIdAtom)).toBe("r1");
        expect(globalStore.get(model.selectedStatusAtom)).toBe("ready");
        expect(globalStore.get(model.selectedEventsAtom).map((e) => e.eventId)).toEqual(["e1"]);
    });

    it("toggles the selection off when the same run is selected again", async () => {
        vi.stubGlobal("fetch", eventsFetch({ w1: () => Promise.resolve(eventsBody([evt("e1")])) }));
        const model = makeModel();
        seed(model, [run({ runId: "r1" })], [workspace({ workspaceId: "w1", runId: "r1" })]);

        await model.selectRun("r1");
        await model.selectRun("r1");

        expect(globalStore.get(model.selectedRunIdAtom)).toBe("");
        expect(globalStore.get(model.selectedStatusAtom)).toBe("idle");
        expect(globalStore.get(model.selectedEventsAtom)).toEqual([]);
    });

    it("yields 'not-correlated' for a run with no linked workspace", async () => {
        vi.stubGlobal("fetch", eventsFetch({}));
        const model = makeModel();
        seed(model, [run({ runId: "r1", taskId: "t9", spaceId: "s9" })], [workspace({ runId: "rX" })]);

        await model.selectRun("r1");

        expect(globalStore.get(model.selectedRunIdAtom)).toBe("r1");
        expect(globalStore.get(model.selectedStatusAtom)).toBe("not-correlated");
        expect(globalStore.get(model.selectedEventsAtom)).toEqual([]);
    });
});

describe("RecoderRunsViewModel.refreshSelectedEvents null-vs-empty semantics", () => {
    it("maps a null events read (transport/backend failure) to 'not-connected'", async () => {
        vi.stubGlobal(
            "fetch",
            eventsFetch({ w1: () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }) }),
        );
        const model = makeModel();
        seed(model, [run({ runId: "r1" })], [workspace({ workspaceId: "w1", runId: "r1" })]);

        await model.selectRun("r1");

        expect(globalStore.get(model.selectedStatusAtom)).toBe("not-connected");
        expect(globalStore.get(model.selectedEventsAtom)).toEqual([]);
    });

    it("maps a connected empty transcript ([]) to 'empty', never conflated with not-connected", async () => {
        vi.stubGlobal("fetch", eventsFetch({ w1: () => Promise.resolve(eventsBody([])) }));
        const model = makeModel();
        seed(model, [run({ runId: "r1" })], [workspace({ workspaceId: "w1", runId: "r1" })]);

        await model.selectRun("r1");

        expect(globalStore.get(model.selectedStatusAtom)).toBe("empty");
        expect(globalStore.get(model.selectedEventsAtom)).toEqual([]);
    });

    it("maps a populated transcript to 'ready'", async () => {
        vi.stubGlobal("fetch", eventsFetch({ w1: () => Promise.resolve(eventsBody([evt("e1"), evt("e2")])) }));
        const model = makeModel();
        seed(model, [run({ runId: "r1" })], [workspace({ workspaceId: "w1", runId: "r1" })]);

        await model.selectRun("r1");

        expect(globalStore.get(model.selectedStatusAtom)).toBe("ready");
        expect(globalStore.get(model.selectedEventsAtom).map((e) => e.eventId)).toEqual(["e1", "e2"]);
    });

    it("treats a transport throw as not-connected (degrade-safe)", async () => {
        vi.stubGlobal(
            "fetch",
            eventsFetch({ w1: () => Promise.reject(new Error("ECONNREFUSED")) }),
        );
        const model = makeModel();
        seed(model, [run({ runId: "r1" })], [workspace({ workspaceId: "w1", runId: "r1" })]);

        await model.selectRun("r1");

        expect(globalStore.get(model.selectedStatusAtom)).toBe("not-connected");
        expect(globalStore.get(model.selectedEventsAtom)).toEqual([]);
    });
});

describe("RecoderRunsViewModel SelectedRunStatus machine", () => {
    it("transitions not-correlated -> empty -> ready truthfully as selection changes", async () => {
        vi.stubGlobal(
            "fetch",
            eventsFetch({
                w2: () => Promise.resolve(eventsBody([])),
                w3: () => Promise.resolve(eventsBody([evt("e3")])),
            }),
        );
        const model = makeModel();
        seed(
            model,
            [
                run({ runId: "r1", taskId: "t9", spaceId: "s9" }),
                run({ runId: "r2" }),
                run({ runId: "r3" }),
            ],
            [
                workspace({ workspaceId: "w2", runId: "r2" }),
                workspace({ workspaceId: "w3", runId: "r3" }),
            ],
        );

        await model.selectRun("r1");
        expect(globalStore.get(model.selectedStatusAtom)).toBe("not-correlated");

        await model.selectRun("r2");
        expect(globalStore.get(model.selectedStatusAtom)).toBe("empty");

        await model.selectRun("r3");
        expect(globalStore.get(model.selectedStatusAtom)).toBe("ready");
        expect(globalStore.get(model.selectedEventsAtom).map((e) => e.eventId)).toEqual(["e3"]);
    });

    it("never fabricates 'ready' when the events read is disconnected", async () => {
        vi.stubGlobal(
            "fetch",
            eventsFetch({ w1: () => Promise.resolve({ ok: false, status: 503, json: async () => ({}) }) }),
        );
        const model = makeModel();
        seed(model, [run({ runId: "r1" })], [workspace({ workspaceId: "w1", runId: "r1" })]);

        await model.selectRun("r1");

        expect(globalStore.get(model.selectedStatusAtom)).toBe("not-connected");
        expect(globalStore.get(model.selectedStatusAtom)).not.toBe("ready");
    });
});

describe("RecoderRunsViewModel stale-fetch guard", () => {
    it("discards a slow older poll so it cannot clobber a newer selection", async () => {
        const oldGate = deferred<ReturnType<typeof okBody>>();
        vi.stubGlobal(
            "fetch",
            eventsFetch({
                w1: () => oldGate.promise,
                w2: () => Promise.resolve(eventsBody([evt("e2-new")])),
            }),
        );
        const model = makeModel();
        seed(
            model,
            [run({ runId: "r1" }), run({ runId: "r2" })],
            [
                workspace({ workspaceId: "w1", runId: "r1" }),
                workspace({ workspaceId: "w2", runId: "r2" }),
            ],
        );

        globalStore.set(model.selectedRunIdAtom, "r1");
        const stalePoll = model.refreshSelectedEvents();
        expect(globalStore.get(model.selectedStatusAtom)).toBe("loading");

        globalStore.set(model.selectedRunIdAtom, "r2");
        await model.refreshSelectedEvents();
        expect(globalStore.get(model.selectedStatusAtom)).toBe("ready");
        expect(globalStore.get(model.selectedEventsAtom).map((e) => e.eventId)).toEqual(["e2-new"]);

        oldGate.resolve(eventsBody([evt("e1-stale")]));
        await stalePoll;

        expect(globalStore.get(model.selectedRunIdAtom)).toBe("r2");
        expect(globalStore.get(model.selectedStatusAtom)).toBe("ready");
        expect(globalStore.get(model.selectedEventsAtom).map((e) => e.eventId)).toEqual(["e2-new"]);
    });

    it("discards a stale poll even when the selection was cleared mid-flight", async () => {
        const oldGate = deferred<ReturnType<typeof okBody>>();
        vi.stubGlobal("fetch", eventsFetch({ w1: () => oldGate.promise }));
        const model = makeModel();
        seed(model, [run({ runId: "r1" })], [workspace({ workspaceId: "w1", runId: "r1" })]);

        globalStore.set(model.selectedRunIdAtom, "r1");
        const stalePoll = model.refreshSelectedEvents();
        expect(globalStore.get(model.selectedStatusAtom)).toBe("loading");

        globalStore.set(model.selectedRunIdAtom, "");
        globalStore.set(model.selectedStatusAtom, "idle");
        globalStore.set(model.selectedEventsAtom, []);

        oldGate.resolve(eventsBody([evt("e1-stale")]));
        await stalePoll;

        expect(globalStore.get(model.selectedRunIdAtom)).toBe("");
        expect(globalStore.get(model.selectedStatusAtom)).toBe("idle");
        expect(globalStore.get(model.selectedEventsAtom)).toEqual([]);
    });
});
